import { COLORS, MESSAGES } from "@/utils/constants";
import chalk from "chalk";
import { time } from "console";

export class Logger {
    private prefix: string;

    constructor(prefix:string = "CodeFi"){
        this.prefix = prefix;
    }

    private formatMessage(level:string, message:string):string{
        const timestamp = new Date().toLocaleTimeString();
        return `[${timestamp}] [${level}] ${message}`;
    }

    success(message:string):void{
        console.log(chalk.hex(COLORS.SUCCESS)(`${MESSAGES.SUCCESS} ${message}`));
    }

    error(message: string, error?: Error): void {
        console.error(
          chalk.hex(COLORS.ERROR)(`${MESSAGES.ERROR} ${message}`)
        );
        if (error && process.env.NODE_ENV === 'development') {
          console.error(chalk.gray(error.stack));
        }
    }

    warning(message:string):void{
        console.warn(chalk.hex(COLORS.WARNING)(`${MESSAGES.ERROR} ${message}`));
    }

    info(message: string): void {
        console.log(
          chalk.hex(COLORS.TEXT)(`${MESSAGES.INFO} ${message}`)
        );
      }
    
    neon(message: string): void {
        console.log(chalk.hex(COLORS.PRIMARY).bold(message));
    }

    box(message:string):void{
        const lines = message.split('\n');
        const maxLength = Math.max(...lines.map(l => l.length));
        const border = '='.repeat(maxLength + 4);

        console.log(chalk.hex(COLORS.PRIMARY)(`╔${border}╗`));
        lines.forEach(line =>{
            const padding = ' '.repeat(maxLength - line.length);
            console.log(chalk.hex(COLORS.PRIMARY)(`║  ${line}${padding}  ║`));
        });
        console.log(chalk.hex(COLORS.PRIMARY)(`╚${border}╝`));
    }

    welcome(): void {
        console.log(chalk.hex(COLORS.PRIMARY)(MESSAGES.WELCOME));
    }

    nowPlaying(trackTitle: string, artist: string): void {
        console.log(
          chalk.hex(COLORS.TEXT)(`${MESSAGES.MUSIC_PLAYING} `) +
          chalk.hex(COLORS.PRIMARY).bold(trackTitle) +
          chalk.hex(COLORS.TEXT)(` by ${artist}`)
        );
    }

    flowActivated(): void {
        console.log(chalk.hex(COLORS.PRIMARY).bold(MESSAGES.FLOW_ACTIVATED));
    }

    proRequired(): void {
        this.warning(MESSAGES.PRO_REQUIRED);
        console.log(
          chalk.hex(COLORS.TEXT)('Upgrade: ') +
          chalk.hex(COLORS.PRIMARY).underline('https://codefi.dev/pricing')
        );
      }
    
    spinner(text: string): any {
        const ora = require('ora');
        return ora({
          text,
          color: 'green',
          spinner: 'dots',
        });
    }
    
    clear(): void {
        console.clear();
    }
    
    newLine(): void {
        console.log('');
    }
    
    divider(): void {
        console.log(chalk.hex(COLORS.GRAY)('─'.repeat(50)));
    }

    debug(message: string) {
        // Chỉ in ra nếu bro muốn, hoặc để màu xám (gray) cho nó chìm
        // Thêm icon con bọ (bug) cho chuẩn bài debug
        console.log(chalk.gray(`🐛 [DEBUG] ${message}`));
    }
}

export const logger = new Logger();