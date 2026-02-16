import chalk from 'chalk';

export class MusicVisualizer {
  private bars: number[] = [];
  private interval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private trackTitle: string = '';
  private artist: string = '';
  private lineCount: number = 0;
  private volume: number = 50; // Add volume state
  private status: string = 'PLAYING'; // PLAYING, PAUSED

  constructor(private barCount: number = 12) {
    this.bars = new Array(barCount).fill(0);
  }

  // Set track info
  setTrackInfo(title: string, artist: string = 'Unknown Artist'): void {
    this.trackTitle = title;
    this.artist = artist;
  }

  // Update volume (clamp 0–100 so bar never gets negative repeat)
  updateVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(100, volume));
  }

  // Update status
  updateStatus(status: string): void {
    this.status = status;
  }

  // Start animation (no init needed)
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.lineCount = 0; // Reset
    
    // Render first frame immediately
    this.render();
    
    // IMPORTANT: Don't call animate() too soon
    // Wait for terminal to stabilize
    setTimeout(() => {
      if (this.isRunning) {
        this.animate();
      }
    }, 500); // 500ms delay
  }

  // Stop animation
  stop(): void {
    this.isRunning = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  // Animation loop
  private animate(): void {
    this.interval = setInterval(() => {
      if (!this.isRunning) return;

      // Generate random bar heights
      this.bars = this.bars.map(() => Math.random());

      // Render frame
      this.render();
    }, 150);
  }

  /** Safe repeat: never pass negative to String.repeat */
  private safeRepeat(s: string, count: number): string {
    return count <= 0 ? '' : s.repeat(count);
  }

  // Render in a bordered box
  private render(): void {
    const maxHeight = 4;
    const lines: string[] = [];
    
    const boxWidth = 42; // Fixed width

    // Top border with title
    lines.push(chalk.green('┌─ CodeFi Player ') + chalk.green(this.safeRepeat('─', boxWidth - 17) + '┐'));
    
    // NOW PLAYING label with status
    const statusEmoji = this.status === 'PLAYING' ? '🎵' : '⏸️';
    const nowPlayingLine = `${statusEmoji} NOW ${this.status}`;
    lines.push(chalk.green('│ ') + chalk.magenta(nowPlayingLine) + this.safeRepeat(' ', boxWidth - nowPlayingLine.length - 1) + chalk.green('│'));
    
    // Title (truncate if too long)
    const maxTitleLen = boxWidth - 2;
    const titleText = this.trackTitle.length > maxTitleLen 
      ? this.trackTitle.substring(0, maxTitleLen - 3) + '...'
      : this.trackTitle;
    lines.push(chalk.green('│ ') + chalk.white.bold(titleText) + this.safeRepeat(' ', boxWidth - titleText.length - 1) + chalk.green('│'));
    
    // Artist
    const artistText = `by ${this.artist}`;
    const truncArtist = artistText.length > maxTitleLen
      ? artistText.substring(0, maxTitleLen - 3) + '...'
      : artistText;
    lines.push(chalk.green('│ ') + chalk.gray(truncArtist) + this.safeRepeat(' ', boxWidth - truncArtist.length - 1) + chalk.green('│'));
    
    // Empty line
    lines.push(chalk.green('│') + this.safeRepeat(' ', boxWidth) + chalk.green('│'));

    // Visualizer bars
    const barPadding = Math.max(0, boxWidth - this.barCount * 2 - 1);
    for (let row = maxHeight; row > 0; row--) {
      let barLine = '';
      
      for (let i = 0; i < this.barCount; i++) {
        const barHeight = Math.floor(this.bars[i] * maxHeight);
        
        if (barHeight >= row) {
          const intensity = barHeight / maxHeight;
          barLine += this.getColoredBar(intensity) + ' ';
        } else {
          barLine += '  ';
        }
      }
      
      lines.push(chalk.green('│ ') + barLine + this.safeRepeat(' ', barPadding) + chalk.green('│'));
    }

    // Empty line before controls
    lines.push(chalk.green('│') + this.safeRepeat(' ', boxWidth) + chalk.green('│'));

    // Volume bar (clamp to avoid negative repeat counts)
    const volBarWidth = 20;
    const volFilled = Math.max(0, Math.min(volBarWidth, Math.floor((this.volume / 100) * volBarWidth)));
    const volEmpty = Math.max(0, volBarWidth - volFilled);
    const volBar = '█'.repeat(volFilled) + '░'.repeat(volEmpty);
    const volText = `Vol: ${this.volume}% [${volBar}]`;
    const volPadding = Math.max(0, boxWidth - volText.length - 1);
    
    // Show MUTED if volume is 0
    const volDisplay = this.volume === 0 
      ? chalk.red(`Vol: MUTED [${volBar}]`)
      : chalk.yellow(volText);
    
    lines.push(chalk.green('│ ') + volDisplay + this.safeRepeat(' ', volPadding) + chalk.green('│'));

    // Controls - Updated with more options
    const controlText = '[N/P] Track [↑↓] Vol [M] Mute [S] Pause [Q] Quit';
    const ctrlPadding = Math.max(0, boxWidth - controlText.length - 1);
    lines.push(chalk.green('│ ') + chalk.gray(controlText) + this.safeRepeat(' ', ctrlPadding) + chalk.green('│'));

    // Bottom border
    lines.push(chalk.green('└') + chalk.green(this.safeRepeat('─', boxWidth)) + chalk.green('┘'));

    // Clear and redraw
    if (this.lineCount > 0) {
      this.clearBox(this.lineCount);
    }
    
    this.lineCount = lines.length;
    lines.forEach(line => console.log(line));
  }

  // Clear previous box
  private clearBox(lineCount: number): void {
    if (lineCount <= 0) return;
    process.stdout.write('\x1B[' + lineCount + 'A');
    process.stdout.write('\x1B[J');
  }

  // Get colored bar character
  private getColoredBar(intensity: number): string {
    let char: string;
    
    if (intensity > 0.75) {
      char = '█';
    } else if (intensity > 0.5) {
      char = '▓';
    } else if (intensity > 0.25) {
      char = '▒';
    } else {
      char = '░';
    }

    if (intensity > 0.8) {
      return chalk.rgb(0, 255, 65)(char);
    } else if (intensity > 0.5) {
      return chalk.rgb(0, 200, 80)(char);
    } else {
      return chalk.rgb(0, 150, 50)(char);
    }
  }
}

export const visualizer = new MusicVisualizer();