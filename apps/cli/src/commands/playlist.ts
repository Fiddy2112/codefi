import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { configService } from '@/services/config';
import { logger } from '@/services/logger';
import { COLORS, MOODS, DEFAULT_PLAYLISTS } from '@/utils/constants';
import type { Playlist, Track, MoodType } from '@/types';

const PLAYLISTS_FILE = path.join(os.homedir(), '.codefi', 'playlists.json');

// ─── Local playlist storage ───────────────────────────────────────────────────
function loadPlaylists(): Playlist[] {
  try {
    if (!fs.existsSync(PLAYLISTS_FILE)) return [];
    return JSON.parse(fs.readFileSync(PLAYLISTS_FILE, 'utf8')) as Playlist[];
  } catch {
    return [];
  }
}

function savePlaylists(playlists: Playlist[]): void {
  const dir = path.dirname(PLAYLISTS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PLAYLISTS_FILE, JSON.stringify(playlists, null, 2));
}

function getAllPlaylists(): Playlist[] {
  const custom = loadPlaylists();
  return [
    ...DEFAULT_PLAYLISTS.map((p) => ({ ...p, isCustom: false })),
    ...custom.map((p) => ({ ...p, isCustom: true })),
  ];
}

function renderPlaylist(p: Playlist, index?: number): void {
  const badge   = p.isCustom
    ? chalk.hex(COLORS.PRIMARY)('[custom]')
    : chalk.gray('[built-in]');
  const mood    = MOODS[p.mood] ?? MOODS.focus;
  const prefix  = index !== undefined ? chalk.gray(`  ${String(index + 1).padStart(2)}. `) : '  ';

  console.log(
    prefix +
    chalk.white.bold(p.name) +
    '  ' + badge +
    '  ' + chalk.gray(`${mood.emoji} ${mood.name}`) +
    chalk.gray(`  ${p.tracks.length} track${p.tracks.length !== 1 ? 's' : ''}`)
  );

  // Show tracks
  p.tracks.forEach((t, i) => {
    const proTag = t.isPro ? chalk.yellow(' [Pro]') : '';
    console.log(
      chalk.gray(`       ${i + 1}. ${t.title} — ${t.artist}`) + proTag
    );
  });
}

// ─── list ─────────────────────────────────────────────────────────────────────
const listCommand = new Command('list')
  .description('List all playlists')
  .option('--custom', 'Show only your custom playlists')
  .option('--mood <mood>', 'Filter by mood')
  .action((options) => {
    let playlists = getAllPlaylists();

    if (options.custom) playlists = playlists.filter((p) => p.isCustom);
    if (options.mood)   playlists = playlists.filter((p) => p.mood === options.mood);

    if (playlists.length === 0) {
      logger.info('No playlists found');
      if (!options.custom) logger.info('Create one with: codefi playlist create');
      return;
    }

    logger.newLine();
    logger.box(`PLAYLISTS (${playlists.length})`);
    logger.newLine();

    playlists.forEach((p, i) => {
      renderPlaylist(p, i);
      logger.newLine();
    });

    if (!configService.isPro()) {
      logger.info('Create custom playlists with CodeFi Pro');
      logger.info('Upgrade: https://codefi.dev/pricing');
    }
  });

// ─── create ───────────────────────────────────────────────────────────────────
const createCommand = new Command('create')
  .description('Create a new custom playlist (Pro)')
  .option('-n, --name <name>', 'Playlist name')
  .option('-m, --mood <mood>', 'Mood for this playlist')
  .action(async (options) => {
    if (!configService.isPro()) {
      logger.proRequired();
      return;
    }

    logger.clear();
    logger.box('CREATE PLAYLIST');
    logger.newLine();

    // Name
    const nameAnswer = options.name
      ? { name: options.name }
      : await inquirer.prompt([{
          type: 'input',
          name: 'name',
          message: 'Playlist name:',
          validate: (v: string) => v.trim().length > 0 ? true : 'Name required',
        }]);

    // Mood
    const moodAnswer = options.mood && Object.keys(MOODS).includes(options.mood)
      ? { mood: options.mood as MoodType }
      : await inquirer.prompt([{
          type: 'list',
          name: 'mood',
          message: 'Mood for this playlist:',
          choices: Object.entries(MOODS).map(([k, v]) => ({
            name: `${v.emoji}  ${v.name}`,
            value: k,
          })),
        }]);

    const playlist: Playlist = {
      id:       `custom-${Date.now()}`,
      name:     nameAnswer.name.trim(),
      mood:     moodAnswer.mood,
      tracks:   [],
      isCustom: true,
      source:   'local',
    };

    // Add tracks interactively
    logger.newLine();
    logger.info('Add tracks (leave URL blank to finish)');
    logger.info('Supported: YouTube URL, local file path');
    logger.newLine();

    let addMore = true;
    while (addMore) {
      const { trackInput } = await inquirer.prompt([{
        type: 'input',
        name: 'trackInput',
        message: `Track ${playlist.tracks.length + 1} (URL or path, blank to finish):`,
      }]);

      if (!trackInput.trim()) {
        addMore = false;
        break;
      }

      const { title, artist } = await inquirer.prompt([
        {
          type: 'input',
          name: 'title',
          message: 'Track title:',
          default: path.basename(trackInput).replace(/\.[^.]+$/, ''),
        },
        {
          type: 'input',
          name: 'artist',
          message: 'Artist:',
          default: 'Unknown Artist',
        },
      ]);

      const isYouTube = trackInput.includes('youtube.com') || trackInput.includes('youtu.be');

      const track: Track = {
        id:          `track-${Date.now()}-${playlist.tracks.length}`,
        title:       title.trim(),
        artist:      artist.trim(),
        duration:    0,
        mood:        moodAnswer.mood,
        filepath:    isYouTube ? '' : trackInput.trim(),
        source:      isYouTube ? 'youtube' : 'local',
        externalUrl: isYouTube ? trackInput.trim() : undefined,
        youtubeId:   isYouTube ? new URL(trackInput).searchParams.get('v') ?? undefined : undefined,
        isPro:       false,
      };

      playlist.tracks.push(track);
      logger.success(`Added: ${title}`);
    }

    if (playlist.tracks.length === 0) {
      logger.warning('No tracks added — playlist not saved');
      return;
    }

    const existing = loadPlaylists();
    existing.push(playlist);
    savePlaylists(existing);

    logger.newLine();
    logger.success(`Playlist "${playlist.name}" created with ${playlist.tracks.length} track(s)`);
    logger.info(`Play it with: codefi playlist play "${playlist.name}"`);
    logger.newLine();
  });

// ─── delete ───────────────────────────────────────────────────────────────────
const deleteCommand = new Command('delete')
  .description('Delete a custom playlist (Pro)')
  .argument('[name]', 'Playlist name (interactive if omitted)')
  .action(async (nameArg?: string) => {
    if (!configService.isPro()) {
      logger.proRequired();
      return;
    }

    const custom = loadPlaylists();
    if (custom.length === 0) {
      logger.info('No custom playlists to delete');
      return;
    }

    let targetName = nameArg;

    if (!targetName) {
      const { chosen } = await inquirer.prompt([{
        type: 'list',
        name: 'chosen',
        message: 'Which playlist do you want to delete?',
        choices: custom.map((p) => ({ name: `${p.name} (${p.tracks.length} tracks)`, value: p.name })),
      }]);
      targetName = chosen;
    }

    const idx = custom.findIndex(
      (p) => p.name.toLowerCase() === targetName!.toLowerCase()
    );

    if (idx === -1) {
      logger.error(`Playlist not found: "${targetName}"`);
      logger.info('Run "codefi playlist list --custom" to see your playlists');
      process.exit(1);
    }

    const { confirmed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirmed',
      message: `Delete "${custom[idx].name}" (${custom[idx].tracks.length} tracks)?`,
      default: false,
    }]);

    if (!confirmed) {
      logger.info('Cancelled');
      return;
    }

    custom.splice(idx, 1);
    savePlaylists(custom);
    logger.success(`Deleted "${targetName}"`);
  });

// ─── show ─────────────────────────────────────────────────────────────────────
const showCommand = new Command('show')
  .description('Show tracks in a playlist')
  .argument('<name>', 'Playlist name')
  .action((name: string) => {
    const all = getAllPlaylists();
    const p   = all.find((pl) => pl.name.toLowerCase() === name.toLowerCase());

    if (!p) {
      logger.error(`Playlist not found: "${name}"`);
      logger.info('Run "codefi playlist list" to see available playlists');
      process.exit(1);
    }

    logger.newLine();
    renderPlaylist(p);
    logger.newLine();
  });

// ─── Root playlist command ────────────────────────────────────────────────────
export const playlistCommand = new Command('playlist')
  .description('Manage playlists')
  .addCommand(listCommand)
  .addCommand(createCommand)
  .addCommand(deleteCommand)
  .addCommand(showCommand)
  // `codefi playlist` → list
  .action(() => {
    listCommand.parseAsync([], { from: 'user' });
  });

export default playlistCommand;