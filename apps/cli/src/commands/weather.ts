import { Command } from 'commander';
import https from 'https';
import chalk from 'chalk';
import { logger } from '@/services/logger';
import { COLORS } from '@/utils/constants';

interface WeatherData {
  current_condition: Array<{
    temp_C:          string;
    FeelsLikeC:      string;
    humidity:        string;
    windspeedKmph:   string;
    weatherDesc:     Array<{ value: string }>;
    weatherCode:     string;
  }>;
  nearest_area: Array<{
    areaName:   Array<{ value: string }>;
    country:    Array<{ value: string }>;
  }>;
  weather: Array<{
    date:     string;
    maxtempC: string;
    mintempC: string;
    hourly:   Array<{
      time:        string;
      tempC:       string;
      weatherDesc: Array<{ value: string }>;
    }>;
  }>;
}

// Weather code → emoji map (WMO codes used by wttr.in)
function weatherEmoji(code: string): string {
  const n = parseInt(code, 10);
  if (n === 113) return '☀️ ';
  if (n === 116) return '⛅';
  if (n === 119 || n === 122) return '☁️ ';
  if (n >= 143 && n <= 248) return '🌫️ ';
  if (n >= 263 && n <= 281) return '🌦️ ';
  if (n >= 293 && n <= 321) return '🌧️ ';
  if (n >= 329 && n <= 377) return '🌨️ ';
  if (n >= 386 && n <= 395) return '⛈️ ';
  return '🌡️ ';
}

function fetchWeather(location: string): Promise<WeatherData> {
  return new Promise((resolve, reject) => {
    const encoded = encodeURIComponent(location || 'auto');
    const url     = `https://wttr.in/${encoded}?format=j1`;

    const req = https.get(url, {
      headers: { 'User-Agent': 'codefi-cli/1.0' },
      timeout: 8000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Weather API returned ${res.statusCode}`));
        }
        try { resolve(JSON.parse(data) as WeatherData); }
        catch { reject(new Error('Failed to parse weather data')); }
      });
    });

    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Weather request timed out')); });
  });
}

function renderWeather(w: WeatherData): void {
  const cur     = w.current_condition[0];
  const area    = w.nearest_area[0];
  const city    = area.areaName[0].value;
  const country = area.country[0].value;
  const desc    = cur.weatherDesc[0].value;
  const emoji   = weatherEmoji(cur.weatherCode);
  const today   = w.weather[0];

  logger.newLine();
  console.log(chalk.hex(COLORS.PRIMARY)('  ┌─ Weather ──────────────────────────────┐'));

  // Location
  const loc = `${city}, ${country}`;
  console.log(chalk.hex(COLORS.PRIMARY)('  │ ') + chalk.gray(loc));

  // Current temp
  const tempLine = `${emoji}  ${desc}`;
  console.log(chalk.hex(COLORS.PRIMARY)('  │ ') + chalk.white.bold(tempLine));

  console.log(
    chalk.hex(COLORS.PRIMARY)('  │ ') +
    chalk.white(`${cur.temp_C}°C`) +
    chalk.gray(` feels like ${cur.FeelsLikeC}°C`) +
    chalk.gray(`  💧 ${cur.humidity}%`) +
    chalk.gray(`  💨 ${cur.windspeedKmph} km/h`)
  );

  // Today high/low
  console.log(
    chalk.hex(COLORS.PRIMARY)('  │ ') +
    chalk.gray(`Today  ↑ ${today.maxtempC}°C  ↓ ${today.mintempC}°C`)
  );

  // 3-day forecast
  console.log(chalk.hex(COLORS.PRIMARY)('  │'));
  console.log(chalk.hex(COLORS.PRIMARY)('  │ ') + chalk.gray('3-day forecast'));

  for (const day of w.weather.slice(0, 3)) {
    const date   = new Date(day.date).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' });
    const midday = day.hourly.find(h => h.time === '1200') ?? day.hourly[Math.floor(day.hourly.length / 2)];
    const emo    = weatherEmoji(midday?.weatherDesc?.[0]?.value === desc ? cur.weatherCode : '113');
    console.log(
      chalk.hex(COLORS.PRIMARY)('  │ ') +
      chalk.gray(`${date.padEnd(14)} ${emo}  ↑ ${day.maxtempC}°C  ↓ ${day.mintempC}°C`)
    );
  }

  console.log(chalk.hex(COLORS.PRIMARY)('  └────────────────────────────────────────┘'));
  logger.newLine();
  logger.info('Powered by wttr.in');
  logger.newLine();
}

export const weatherCommand = new Command('weather')
  .description('Show current weather')
  .argument('[city]', 'City name (auto-detect from IP if omitted)')
  .option('-j, --json', 'Output raw JSON')
  .action(async (city: string | undefined, options) => {
    logger.newLine();
    logger.info('Fetching weather...');

    try {
      const data = await fetchWeather(city ?? '');

      if (options.json) {
        console.log(JSON.stringify(data.current_condition[0], null, 2));
        return;
      }

      renderWeather(data);
    } catch (err: any) {
      logger.error(`Could not fetch weather: ${err.message}`);
      logger.info('Check your internet connection or try: codefi weather "Ho Chi Minh City"');
      process.exit(1);
    }
  });

export default weatherCommand;