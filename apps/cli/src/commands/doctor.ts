import { Command } from 'commander';
import { spawn } from 'child_process';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { configService } from '@/services/config';
import { logger } from '@/services/logger';
import { COLORS } from '@/utils/constants';

interface CheckResult {
  label:   string;
  status:  'ok' | 'warn' | 'fail' | 'info';
  value:   string;
  fix?:    string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { shell: false });
    let out = '';
    child.stdout?.on('data', (d) => { out += d.toString(); });
    child.stderr?.on('data', (d) => { out += d.toString(); });
    child.on('error', () => resolve(''));
    child.on('close', () => resolve(out.trim()));
  });
}

async function checkCommand(
  cmd: string,
  args: string[],
  label: string,
  fix: string
): Promise<CheckResult> {
  const out = await run(cmd, args);
  const version = out.split('\n')[0].replace(/[^\d.]/g, '').trim();
  if (version) {
    return { label, status: 'ok', value: version || out.split('\n')[0] };
  }
  return { label, status: 'fail', value: 'not found', fix };
}

async function checkPythonModule(
  pythonCmd: string,
  module: string,
  label: string,
  fix: string
): Promise<CheckResult> {
  const out = await run(pythonCmd, ['-c', `import ${module}; print('ok')`]);
  if (out.includes('ok')) {
    // Try to get version
    const ver = await run(pythonCmd, ['-c', `import ${module}; print(getattr(${module}, '__version__', 'installed'))`]);
    return { label, status: 'ok', value: ver.split('\n')[0] || 'installed' };
  }
  return { label, status: 'fail', value: 'not installed', fix };
}

function checkDir(label: string, dirPath: string): CheckResult {
  const expanded = dirPath.replace('~', os.homedir());
  if (fs.existsSync(expanded)) {
    const files = fs.readdirSync(expanded).length;
    return { label, status: 'ok', value: `${expanded} (${files} files)` };
  }
  return {
    label,
    status: 'warn',
    value: `${expanded} — not created yet`,
    fix:   `Will be created automatically on first use`,
  };
}

function checkFile(label: string, filePath: string, fixMsg?: string): CheckResult {
  const expanded = filePath.replace('~', os.homedir());
  if (fs.existsSync(expanded)) {
    const stat = fs.statSync(expanded);
    const kb = (stat.size / 1024).toFixed(1);
    return { label, status: 'ok', value: `${expanded} (${kb} KB)` };
  }
  return {
    label,
    status: fixMsg ? 'fail' : 'warn',
    value: 'not found',
    fix: fixMsg,
  };
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderResult(r: CheckResult): void {
  const icons: Record<CheckResult['status'], string> = {
    ok:   chalk.hex(COLORS.SUCCESS)('✓'),
    warn: chalk.yellow('⚠'),
    fail: chalk.red('✗'),
    info: chalk.gray('ℹ'),
  };

  const valueColor: Record<CheckResult['status'], (s: string) => string> = {
    ok:   (s) => chalk.white(s),
    warn: (s) => chalk.yellow(s),
    fail: (s) => chalk.red(s),
    info: (s) => chalk.gray(s),
  };

  const label = r.label.padEnd(24);
  console.log(
    `  ${icons[r.status]}  ${chalk.gray(label)}  ${valueColor[r.status](r.value)}`
  );

  if (r.fix) {
    console.log(`     ${chalk.gray('→  ' + r.fix)}`);
  }
}

// ─── Command ──────────────────────────────────────────────────────────────────

export const doctorCommand = new Command('doctor')
  .description('Check CodeFi environment and dependencies')
  .option('--fix', 'Attempt to auto-fix issues (install missing deps)')
  .action(async (options) => {
    logger.clear();
    logger.box('CODEFI DOCTOR');
    logger.newLine();

    const results: CheckResult[] = [];

    // ── Node.js ──────────────────────────────────────────────────────────────
    const nodeVer = process.version.replace('v', '');
    const nodeMajor = parseInt(nodeVer.split('.')[0], 10);
    results.push({
      label:  'Node.js',
      status: nodeMajor >= 18 ? 'ok' : 'warn',
      value:  `v${nodeVer}`,
      fix:    nodeMajor < 18 ? 'CodeFi requires Node.js ≥ 18. Update at https://nodejs.org' : undefined,
    });

    // ── Python ───────────────────────────────────────────────────────────────
    const pythonCmds = process.platform === 'win32'
      ? [['py', ['-3', '--version']], ['python', ['--version']]]
      : [['python3', ['--version']], ['python', ['--version']]];

    let pythonResult: CheckResult = {
      label: 'Python 3',
      status: 'fail',
      value: 'not found',
      fix: 'Install Python 3 from https://python.org',
    };
    let resolvedPython = 'python3';

    for (const [cmd, args] of pythonCmds as [string, string[]][]) {
      const out = await run(cmd, args);
      const match = out.match(/Python (\d+\.\d+\.\d+)/);
      if (match) {
        const [major] = match[1].split('.').map(Number);
        if (major >= 3) {
          pythonResult = { label: 'Python 3', status: 'ok', value: match[1] };
          resolvedPython = cmd === 'py' ? 'py' : cmd;
          break;
        } else {
          pythonResult = {
            label: 'Python 3',
            status: 'fail',
            value: `Python ${match[1]} found — need Python 3`,
            fix: 'Install Python 3 from https://python.org',
          };
        }
      }
    }
    results.push(pythonResult);

    // ── pygame ───────────────────────────────────────────────────────────────
    if (pythonResult.status === 'ok') {
      const pyArgs = resolvedPython === 'py' ? ['-3'] : [];
      results.push(
        await checkPythonModule(
          resolvedPython,
          pyArgs.length ? undefined as any : 'pygame',
          'pygame',
          resolvedPython === 'py'
            ? 'py -3 -m pip install pygame'
            : `pip3 install pygame`
        )
      );
      // Re-run with correct args for py launcher
      if (resolvedPython === 'py') {
        const r = results[results.length - 1];
        const out = await run('py', ['-3', '-c', 'import pygame; print(pygame.__version__)']);
        if (out && !out.includes('Error') && !out.includes('No module')) {
          r.status = 'ok';
          r.value = out.split('\n')[0] || 'installed';
          r.fix = undefined;
        } else {
          r.status = 'fail';
          r.value = 'not installed';
          r.fix = 'py -3 -m pip install pygame';
        }
      }
    } else {
      results.push({ label: 'pygame', status: 'fail', value: 'requires Python 3 first', fix: 'Install Python 3' });
    }

    // ── yt-dlp ───────────────────────────────────────────────────────────────
    results.push(
      await checkCommand(
        'yt-dlp', ['--version'],
        'yt-dlp',
        'pip3 install yt-dlp  (or: pip install yt-dlp)'
      )
    );

    // ── ffmpeg ───────────────────────────────────────────────────────────────
    const ffmpegOut = await run('ffmpeg', ['-version']);
    const ffmpegMatch = ffmpegOut.match(/ffmpeg version ([\w.]+)/);
    results.push(
      ffmpegMatch
        ? { label: 'ffmpeg', status: 'ok', value: ffmpegMatch[1] }
        : {
            label: 'ffmpeg',
            status: 'warn',
            value: 'not found',
            fix: 'Required for YouTube audio conversion. Install: https://ffmpeg.org/download.html',
          }
    );

    // ── Config dir ───────────────────────────────────────────────────────────
    results.push(checkDir('Config dir', `~/.codefi`));
    results.push(checkDir('Tracks cache', `~/.codefi/tracks`));
    results.push(checkDir('YouTube cache', `~/.codefi/cache/youtube`));

    // ── player.py ────────────────────────────────────────────────────────────
    const playerPaths = [
      path.resolve(__dirname, '../scripts/player.py'),
      path.resolve(__dirname, '../../scripts/player.py'),
      path.resolve(process.cwd(), 'scripts/player.py'),
    ];
    const playerFound = playerPaths.find((p) => fs.existsSync(p));
    results.push(
      playerFound
        ? { label: 'player.py', status: 'ok', value: playerFound }
        : {
            label: 'player.py',
            status: 'fail',
            value: 'not found',
            fix: 'Ensure apps/cli/scripts/player.py exists and is built into dist/scripts/',
          }
    );

    // ── Auth ─────────────────────────────────────────────────────────────────
    const loggedIn = configService.isLoggedIn();
    const tokenValid = loggedIn && configService.isTokenValid();
    results.push({
      label:  'Auth token',
      status: loggedIn ? (tokenValid ? 'ok' : 'warn') : 'info',
      value:  loggedIn
        ? (tokenValid ? `valid (${configService.get('email') ?? configService.get('userId') ?? 'user'})` : 'expired — run: codefi login')
        : 'not logged in',
      fix: !loggedIn ? 'Run: codefi login  (required for Pro features)' : undefined,
    });

    results.push({
      label:  'Plan',
      status: 'info',
      value:  configService.isPro() ? 'Pro ✓' : 'Free — upgrade at codefi.dev/pricing',
    });

    // ── Spotify ──────────────────────────────────────────────────────────────
    const spotifyConnected = !!configService.get('spotifyConnected');
    results.push({
      label:  'Spotify',
      status: spotifyConnected ? 'ok' : 'info',
      value:  spotifyConnected ? 'connected' : 'not connected (optional)',
      fix:    spotifyConnected ? undefined : 'Connect with: codefi spotify connect  (Pro)',
    });

    // ── Render ────────────────────────────────────────────────────────────────
    const sections: [string, CheckResult[]][] = [
      ['Runtime',      results.slice(0, 2)],
      ['Audio engine', results.slice(2, 5)],
      ['File system',  results.slice(5, 8)],
      ['App',          results.slice(8, 10)],
      ['Account',      results.slice(10)],
    ];

    for (const [sectionTitle, items] of sections) {
      console.log(chalk.hex(COLORS.PRIMARY)(`  ${sectionTitle}`));
      items.forEach(renderResult);
      logger.newLine();
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    const failures = results.filter((r) => r.status === 'fail');
    const warnings = results.filter((r) => r.status === 'warn');

    if (failures.length === 0 && warnings.length === 0) {
      logger.success('All checks passed — CodeFi is ready to use!');
      logger.newLine();
      logger.info('Start with: codefi play');
    } else {
      if (failures.length > 0) {
        console.log(chalk.red(`  ${failures.length} issue${failures.length > 1 ? 's' : ''} found that will prevent CodeFi from working`));
      }
      if (warnings.length > 0) {
        console.log(chalk.yellow(`  ${warnings.length} warning${warnings.length > 1 ? 's' : ''} found (optional features affected)`));
      }

      // ── Auto-fix ─────────────────────────────────────────────────────────
      if (options.fix && failures.length > 0) {
        logger.newLine();
        logger.info('Attempting auto-fix...');
        logger.newLine();

        const pygameFail = results.find((r) => r.label === 'pygame' && r.status === 'fail');
        if (pygameFail) {
          const pipCmd = resolvedPython === 'py' ? ['py', '-3', '-m', 'pip', 'install', 'pygame'] : ['pip3', 'install', 'pygame'];
          logger.info(`Installing pygame: ${pipCmd.join(' ')}`);
          const [cmd, ...args] = pipCmd;
          await new Promise<void>((resolve) => {
            const child = spawn(cmd, args, { shell: false, stdio: 'inherit' });
            child.on('close', () => resolve());
          });
        }

        const ytdlpFail = results.find((r) => r.label === 'yt-dlp' && r.status === 'fail');
        if (ytdlpFail) {
          logger.info('Installing yt-dlp: pip3 install yt-dlp');
          await new Promise<void>((resolve) => {
            const child = spawn('pip3', ['install', 'yt-dlp'], { shell: false, stdio: 'inherit' });
            child.on('close', () => resolve());
          });
        }

        logger.newLine();
        logger.info('Re-run "codefi doctor" to verify fixes');
      } else if (failures.length > 0) {
        logger.newLine();
        logger.info('Run "codefi doctor --fix" to auto-install missing packages');
      }
    }

    logger.newLine();
  });

export default doctorCommand;