import { Command } from 'commander';
import { spawn } from 'child_process';
import chalk from 'chalk';
import https from 'https';
import { logger } from '@/services/logger';
import { COLORS } from '@/utils/constants';

const PACKAGE_NAME = '@codefi/cli';

function fetchLatestVersion(): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
    const req = https.get(url, { timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data).version as string);
        } catch {
          reject(new Error('Could not parse npm registry response'));
        }
      });
    });
    req.on('error',   reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Registry request timed out'));
    });
  });
}

function runInstall(pkg: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Detect package manager: prefer the one that installed codefi
    const isGlobal = process.argv[1]?.includes('pnpm') ? 'pnpm' : 'npm';
    const [cmd, ...args] = isGlobal === 'pnpm'
      ? ['pnpm', 'add', '-g', pkg]
      : ['npm', 'install', '-g', pkg];

    logger.info(`Running: ${[cmd, ...args].join(' ')}`);

    const child = spawn(cmd, args, {
      shell: false,
      stdio: 'inherit',
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        reject(new Error(`${cmd} not found. Install Node.js from https://nodejs.org`));
      } else {
        reject(err);
      }
    });

    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Install failed with exit code ${code}`));
    });
  });
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return  1;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return -1;
  }
  return 0;
}

export const updateCommand = new Command('update')
  .description('Update CodeFi CLI to the latest version')
  .option('-c, --check', 'Check for updates without installing')
  .option('-f, --force', 'Force reinstall even if already up to date')
  .action(async (options) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const current: string = require('../../package.json').version;

    logger.newLine();
    logger.info('Checking for updates...');

    let latest: string;
    try {
      latest = await fetchLatestVersion();
    } catch (err: any) {
      logger.error(`Could not reach npm registry: ${err.message}`);
      logger.info('Check your internet connection and try again');
      process.exit(1);
    }

    const isOutdated = compareVersions(latest, current) > 0;

    // ── Check only ───────────────────────────────────────────────────────────
    if (options.check) {
      if (isOutdated) {
        console.log(
          chalk.yellow(`  Update available: `) +
          chalk.gray(current) + ' → ' +
          chalk.hex(COLORS.PRIMARY).bold(latest)
        );
        logger.newLine();
        logger.info('Run "codefi update" to install');
      } else {
        logger.success(`Already up to date (v${current})`);
      }
      logger.newLine();
      return;
    }

    // ── Install ──────────────────────────────────────────────────────────────
    if (!isOutdated && !options.force) {
      logger.success(`Already up to date (v${current})`);
      logger.newLine();
      return;
    }

    if (isOutdated) {
      console.log(
        chalk.gray(`  Current: v${current}`) + '  →  ' +
        chalk.hex(COLORS.PRIMARY).bold(`v${latest}`)
      );
    } else {
      logger.info(`Reinstalling v${current}...`);
    }

    logger.newLine();

    try {
      await runInstall(`${PACKAGE_NAME}@${latest}`);
      logger.newLine();
      logger.success(`Updated to v${latest}!`);
      logger.info('Restart your terminal if the command feels stale.');
    } catch (err: any) {
      logger.newLine();
      logger.error('Update failed', err);
      logger.info(`Manual install: npm install -g ${PACKAGE_NAME}@latest`);
      process.exit(1);
    }

    logger.newLine();
  });

export default updateCommand;