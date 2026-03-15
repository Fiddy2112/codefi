import chalk from 'chalk';

type PlayerStatus = 'PLAYING' | 'PAUSED';

const ANSI_RE = /\x1B\[[0-9;]*m/g;
const visibleLen = (s: string): number => s.replace(ANSI_RE, '').length;

export class MusicVisualizer {
  private bars: number[] = [];
  private targets: number[] = [];
  private interval: NodeJS.Timeout | null = null;
  private startTimeout: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private trackTitle: string = '';
  private artist: string = '';
  private lineCount: number = 0;
  private volume: number = 50;
  private status: PlayerStatus = 'PLAYING';

  private readonly BOX_INNER = 44;

  constructor(private barCount: number = 12) {
    this.bars    = new Array(barCount).fill(0);
    this.targets = new Array(barCount).fill(0);
  }

  setTrackInfo(title: string, artist: string = 'Unknown Artist'): void {
    this.trackTitle = title;
    this.artist = artist;
  }

  updateVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(100, volume));
  }

  updateStatus(status: PlayerStatus): void {
    this.status = status;
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lineCount = 0;
    this.render();

    this.startTimeout = setTimeout(() => {
      this.startTimeout = null;
      if (this.isRunning) this.animate();
    }, 500);
  }

  stop(): void {
    this.isRunning = false;

    if (this.startTimeout) {
      clearTimeout(this.startTimeout);
      this.startTimeout = null;
    }

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private animate(): void {
    this.interval = setInterval(() => {
      if (!this.isRunning) return;

      // smooth animation — pick new random targets, lerp bars toward them
      // Every ~600ms (4 frames) randomise targets; bars ease toward them each frame
      if (Math.random() < 0.25) {
        this.targets = this.targets.map(() => Math.random());
      }
      // Lerp: bar moves 30% of the way to its target each frame → smooth glide
      this.bars = this.bars.map((b, i) => b + (this.targets[i] - b) * 0.3);

      this.render();
    }, 150);
  }

  /** Pad / truncate a plain string to exactly `width` visible chars */
  private fit(text: string, width: number): string {
    if (text.length > width) return text.slice(0, width - 3) + '...';
    return text + ' '.repeat(width - text.length);
  }

  /**
   * Pad a potentially ANSI-coloured string to exactly `width` visible chars.
   */
  private fitColoured(coloured: string, width: number): string {
    const vl = visibleLen(coloured);
    if (vl >= width) return coloured;
    return coloured + ' '.repeat(width - vl);
  }

  private row(content: string): string {
    // content must already be exactly BOX_INNER visible chars wide
    return chalk.green('│') + content + chalk.green('│');
  }

  private render(): void {
    const isTTY = process.stdout.isTTY;

    const W = this.BOX_INNER; // inner width (visible chars)
    const lines: string[] = [];

    // ── Top border ──────────────────────────────────────────────────────────
    const titleLabel = ' CodeFi Player ';
    const topFill = '─'.repeat(W - titleLabel.length - 1); // -1 for corner chars
    lines.push(chalk.green('┌') + chalk.green(titleLabel) + chalk.green(topFill) + chalk.green('┐'));

    // ── Status line ──────────────────────────────────────────────────────────
    const statusEmoji = this.status === 'PLAYING' ? '🎵' : '⏸ ';
    const statusText   = `${statusEmoji} NOW ${this.status}`;
    lines.push(this.row(this.fitColoured(chalk.magenta(statusText), W)));

    // ── Track title ──────────────────────────────────────────────────────────
    const titleFitted = this.fit(this.trackTitle || 'No track', W);
    lines.push(this.row(chalk.white.bold(titleFitted)));

    // ── Artist ───────────────────────────────────────────────────────────────
    const artistFitted = this.fit(`by ${this.artist}`, W);
    lines.push(this.row(chalk.gray(artistFitted)));

    // ── Empty spacer ─────────────────────────────────────────────────────────
    lines.push(this.row(' '.repeat(W)));

    // ── Visualizer bars ──────────────────────────────────────────────────────
    const maxHeight = 4;
    const barsBlock = this.barCount * 2; // each bar = char + space
    const barPad    = Math.max(0, W - barsBlock);

    for (let row = maxHeight; row > 0; row--) {
      let barLine = '';
      for (let i = 0; i < this.barCount; i++) {
        const h = Math.floor(this.bars[i] * maxHeight);
        barLine += h >= row ? this.coloredBar(h / maxHeight) + ' ' : '  ';
      }
      // barLine is barCount*2 visible chars; pad to W
      lines.push(this.row(barLine + ' '.repeat(barPad)));
    }

    // ── Empty spacer ─────────────────────────────────────────────────────────
    lines.push(this.row(' '.repeat(W)));

    // ── Volume bar ───────────────────────────────────────────────────────────
    const volBarW  = 20;
    const filled   = Math.round((this.volume / 100) * volBarW);
    const empty    = volBarW - filled;
    const bar      = '█'.repeat(filled) + '░'.repeat(empty);

    // build plain string first so we know its length, then colour it
    const volPlain    = `Vol: ${this.volume === 0 ? 'MUTED' : this.volume + '%'} [${bar}]`;
    const volColoured = this.volume === 0
      ? chalk.red(volPlain)
      : chalk.yellow(volPlain);
    lines.push(this.row(this.fitColoured(volColoured, W)));

    // ── Controls ─────────────────────────────────────────────────────────────
    const ctrl = '[N/P] Track  [↑↓] Vol  [M] Mute  [S] Pause  [Q] Quit';
    lines.push(this.row(this.fitColoured(chalk.gray(ctrl), W)));

    // ── Bottom border ─────────────────────────────────────────────────────────
    lines.push(chalk.green('└') + chalk.green('─'.repeat(W)) + chalk.green('┘'));

    // ── Draw ─────────────────────────────────────────────────────────────────
    if (isTTY && this.lineCount > 0) {
      // Move cursor up and clear from cursor to end of screen
      process.stdout.write(`\x1B[${this.lineCount}A\x1B[J`);
    }

    this.lineCount = lines.length;
    lines.forEach(l => console.log(l));
  }

  private coloredBar(intensity: number): string {
    const char =
      intensity > 0.75 ? '█' :
      intensity > 0.5  ? '▓' :
      intensity > 0.25 ? '▒' : '░';

    return intensity > 0.8
      ? chalk.rgb(0, 255, 65)(char)
      : intensity > 0.5
      ? chalk.rgb(0, 200, 80)(char)
      : chalk.rgb(0, 150, 50)(char);
  }

  /** Legacy alias kept for backwards compatibility with play.ts */
  private safeRepeat(s: string, count: number): string {
    return count <= 0 ? '' : s.repeat(count);
  }
}

export const visualizer = new MusicVisualizer();