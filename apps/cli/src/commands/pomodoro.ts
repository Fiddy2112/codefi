import { audioService } from "@/services/audio";
import { configService } from "@/services/config";
import { logger } from "@/services/logger";
import { COLORS, POMODORO } from "@/utils/constants";
import chalk from "chalk";
import { Command } from "commander";
import notifier from "node-notifier";

// wrap all mutable state in a class — no module-level globals
class PomodoroTimer {
  private interval: NodeJS.Timeout | null = null;
  private session: "work" | "break" = "work";
  private remaining: number = 0;
  private completed: number = 0;
  private workMinutes: number = POMODORO.WORK_DURATION;
  private breakMinutes: number = POMODORO.BREAK_DURATION;

  isRunning(): boolean {
    return this.interval !== null;
  }

  async start(workMinutes: number, breakMinutes: number): Promise<void> {
    if (this.isRunning()) {
      logger.warning("A Pomodoro session is already running. Stop it first.");
      return;
    }

    this.workMinutes = workMinutes;
    this.breakMinutes = breakMinutes;
    this.remaining = workMinutes * 60;
    this.session = "work";

    logger.clear();
    logger.box("POMODORO TIMER STARTED");
    logger.newLine();
    logger.info(`Work session: ${workMinutes} minutes`);
    logger.info(`Break: ${breakMinutes} minutes`);
    logger.newLine();
    logger.flowActivated();
    logger.newLine();

    this.interval = setInterval(() => this.tick(), 1000);

    // Handle Ctrl+C inside pomodoro
    const onSigint = () => {
      this.stop();
      process.exit(0);
    };
    process.once("SIGINT", onSigint);
  }

  private tick(): void {
    this.remaining--;

    const minutes = Math.floor(this.remaining / 60);
    const seconds = this.remaining % 60;
    const timeStr = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    const icon = this.session === "work" ? "🎯" : "☕";

    process.stdout.write(`\r${icon} ${chalk.hex(COLORS.PRIMARY).bold(timeStr)}`);

    if (this.remaining > 0) return;

    if (this.session === "work") {
      this.completed++;
      logger.newLine();
      logger.newLine();
      logger.success(`Work session #${this.completed} completed!`);
      this.notify(
        "Work Session Complete!",
        `Great job! Take a ${this.breakMinutes} minute break.`
      );

      if (audioService.isPlaying()) audioService.pause();

      this.session = "break";
      this.remaining = this.breakMinutes * 60;
      logger.newLine();
      logger.info(`Starting ${this.breakMinutes} minute break...`);
      logger.newLine();
    } else {
      logger.newLine();
      logger.newLine();
      logger.success("Break complete! Ready to focus again?");
      this.notify("Break Complete!", "Time to get back to work!");

      if (!audioService.isPlaying() && configService.get("autoStartPomodoro")) {
        audioService.resume();
      }

      this.session = "work";
      this.remaining = this.workMinutes * 60;
      logger.newLine();
      logger.info(`Starting work session #${this.completed + 1}...`);
      logger.newLine();
    }
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.newLine();
      logger.newLine();
      logger.success("Pomodoro timer stopped");
      logger.info(`Sessions completed: ${this.completed}`);
    } else {
      logger.info("No active Pomodoro session");
    }
  }

  status(): void {
    if (this.interval) {
      const minutes = Math.floor(this.remaining / 60);
      const seconds = this.remaining % 60;
      logger.info(`Current session: ${this.session}`);
      logger.info(
        `Time remaining: ${minutes}:${String(seconds).padStart(2, "0")}`
      );
      logger.info(`Sessions completed: ${this.completed}`);
    } else {
      logger.info("No active Pomodoro session");
      logger.info('Run "codefi pomodoro start" to begin');
    }
  }

  private notify(title: string, message: string): void {
    if (configService.get("notifications")) {
      notifier.notify({ title, message, sound: true, wait: false });
    }
  }
}

// One shared instance per process — no global primitive vars
const timer = new PomodoroTimer();

export const pomodoroCommand = new Command("pomodoro")
  .description("Start Pomodoro timer")
  .argument("[action]", "Action: start, stop, status (default: start)")
  .option(
    "-w, --work <minutes>",
    "Work duration in minutes",
    String(POMODORO.WORK_DURATION)
  )
  .option(
    "-b, --break <minutes>",
    "Break duration in minutes",
    String(POMODORO.BREAK_DURATION)
  )
  .action(async (action = "start", options) => {
    try {
      if (!configService.isPro()) {
        logger.proRequired();
        return;
      }

      const workDuration = parseInt(options.work);
      const breakDuration = parseInt(options.break);

      if (isNaN(workDuration) || workDuration < 1 || workDuration > 180) {
        logger.error("Work duration must be between 1 and 180 minutes");
        process.exit(1);
      }
      if (isNaN(breakDuration) || breakDuration < 1 || breakDuration > 60) {
        logger.error("Break duration must be between 1 and 60 minutes");
        process.exit(1);
      }

      if (action === "start") {
        await timer.start(workDuration, breakDuration);
      } else if (action === "stop") {
        timer.stop();
      } else if (action === "status") {
        timer.status();
      } else {
        logger.error(`Invalid action: ${action}`);
        logger.info("Available actions: start, stop, status");
        process.exit(1);
      }
    } catch (error) {
      logger.error("Pomodoro error", error as Error);
      process.exit(1);
    }
  });

export default pomodoroCommand;