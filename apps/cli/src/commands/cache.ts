import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '@/services/logger';
import { COLORS } from '@/utils/constants';

const HOME        = os.homedir();
const TRACKS_DIR  = path.join(HOME, '.codefi', 'tracks');
const YT_CACHE    = path.join(HOME, '.codefi', 'cache', 'youtube');
const CUSTOM_CACHE= path.join(HOME, '.codefi', 'cache', 'custom');

interface CacheStats {
  label: string;
  dir:   string;
  files: number;
  bytes: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getDirStats(dir: string): { files: number; bytes: number } {
  if (!fs.existsSync(dir)) return { files: 0, bytes: 0 };
  try {
    const entries = fs.readdirSync(dir);
    let bytes = 0;
    let files = 0;
    for (const f of entries) {
      try {
        const stat = fs.statSync(path.join(dir, f));
        if (stat.isFile()) { files++; bytes += stat.size; }
      } catch {}
    }
    return { files, bytes };
  } catch { return { files: 0, bytes: 0 }; }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 ** 2)   return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3)   return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function clearDir(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  for (const f of fs.readdirSync(dir)) {
    try {
      fs.unlinkSync(path.join(dir, f));
      removed++;
    } catch {}
  }
  return removed;
}

function listDirFiles(dir: string): Array<{ name: string; size: number; mtime: Date }> {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map((f) => {
      try {
        const stat = fs.statSync(path.join(dir, f));
        return stat.isFile() ? { name: f, size: stat.size, mtime: stat.mtime } : null;
      } catch { return null; }
    })
    .filter(Boolean) as Array<{ name: string; size: number; mtime: Date }>;
}

// ─── Sub-commands ─────────────────────────────────────────────────────────────

const sizeCommand = new Command('size')
  .alias('info')
  .description('Show cache size and file counts')
  .action(() => {
    const caches: CacheStats[] = [
      { label: 'Built-in tracks',  dir: TRACKS_DIR,   ...getDirStats(TRACKS_DIR)  },
      { label: 'YouTube cache',    dir: YT_CACHE,     ...getDirStats(YT_CACHE)    },
      { label: 'Custom URL cache', dir: CUSTOM_CACHE, ...getDirStats(CUSTOM_CACHE)},
    ];

    const totalFiles = caches.reduce((a, c) => a + c.files, 0);
    const totalBytes = caches.reduce((a, c) => a + c.bytes, 0);

    logger.newLine();
    logger.box('CACHE INFO');
    logger.newLine();

    caches.forEach(({ label, dir, files, bytes }) => {
      const exists = fs.existsSync(dir);
      const filesStr = files > 0 ? `${files} file${files !== 1 ? 's' : ''}` : 'empty';
      const sizeStr  = bytes > 0 ? formatBytes(bytes) : '—';

      console.log(
        chalk.gray(`  ${label.padEnd(22)} `) +
        chalk.white(filesStr.padEnd(14)) +
        (bytes > 0 ? chalk.hex(COLORS.PRIMARY)(sizeStr) : chalk.gray(sizeStr))
      );
      console.log(chalk.gray(`    ${dir}${!exists ? ' (not created yet)' : ''}`));
    });

    logger.newLine();
    console.log(
      chalk.gray('  Total: ') +
      chalk.white(`${totalFiles} files`) +
      chalk.gray('  |  ') +
      chalk.hex(COLORS.PRIMARY)(formatBytes(totalBytes))
    );
    logger.newLine();
  });

const listCommand = new Command('list')
  .description('List cached files')
  .option('--tracks',  'Show built-in tracks only')
  .option('--youtube', 'Show YouTube cache only')
  .option('--custom',  'Show custom URL cache only')
  .action((options) => {
    const toShow: Array<{ label: string; dir: string }> = [];

    if (!options.tracks && !options.youtube && !options.custom) {
      toShow.push(
        { label: 'Built-in tracks',  dir: TRACKS_DIR   },
        { label: 'YouTube cache',    dir: YT_CACHE      },
        { label: 'Custom URL cache', dir: CUSTOM_CACHE  },
      );
    } else {
      if (options.tracks)  toShow.push({ label: 'Built-in tracks',  dir: TRACKS_DIR  });
      if (options.youtube) toShow.push({ label: 'YouTube cache',    dir: YT_CACHE    });
      if (options.custom)  toShow.push({ label: 'Custom URL cache', dir: CUSTOM_CACHE});
    }

    logger.newLine();

    for (const { label, dir } of toShow) {
      const files = listDirFiles(dir).sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
      console.log(chalk.hex(COLORS.PRIMARY)(`  ${label}`));

      if (files.length === 0) {
        console.log(chalk.gray('    (empty)'));
      } else {
        files.forEach(({ name, size, mtime }) => {
          console.log(
            chalk.gray('    ') +
            chalk.white(name.padEnd(36)) +
            chalk.gray(formatBytes(size).padEnd(10)) +
            chalk.gray(mtime.toLocaleDateString())
          );
        });
      }
      logger.newLine();
    }
  });

const clearCommand = new Command('clear')
  .description('Clear cached files')
  .option('--tracks',  'Clear built-in track cache')
  .option('--youtube', 'Clear YouTube download cache')
  .option('--custom',  'Clear custom URL cache')
  .option('--all',     'Clear all caches')
  .action(async (options) => {
    const clearAll = options.all || (!options.tracks && !options.youtube && !options.custom);

    const targets: Array<{ label: string; dir: string }> = [];
    if (clearAll || options.tracks)  targets.push({ label: 'built-in tracks',  dir: TRACKS_DIR   });
    if (clearAll || options.youtube) targets.push({ label: 'YouTube cache',    dir: YT_CACHE     });
    if (clearAll || options.custom)  targets.push({ label: 'custom URL cache', dir: CUSTOM_CACHE });

    const totalFiles = targets.reduce((a, { dir }) => a + getDirStats(dir).files, 0);

    if (totalFiles === 0) {
      logger.info('Cache is already empty');
      return;
    }

    const { default: inquirer } = await import('inquirer');
    const { confirmed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirmed',
      message: `Delete ${totalFiles} cached file${totalFiles !== 1 ? 's' : ''}?`,
      default: false,
    }]);

    if (!confirmed) { logger.info('Cancelled'); return; }

    let totalRemoved = 0;
    for (const { label, dir } of targets) {
      const removed = clearDir(dir);
      if (removed > 0) {
        logger.success(`Cleared ${label}: ${removed} file${removed !== 1 ? 's' : ''}`);
        totalRemoved += removed;
      }
    }

    logger.newLine();
    logger.success(`Removed ${totalRemoved} file${totalRemoved !== 1 ? 's' : ''} total`);
    logger.info('Tracks will be re-downloaded on next play');
    logger.newLine();
  });

// ─── Root cache command ───────────────────────────────────────────────────────
export const cacheCommand = new Command('cache')
  .description('Manage downloaded track cache')
  .addCommand(sizeCommand)
  .addCommand(listCommand)
  .addCommand(clearCommand)
  .action(() => {
    sizeCommand.parseAsync([], { from: 'user' });
  });

export default cacheCommand;