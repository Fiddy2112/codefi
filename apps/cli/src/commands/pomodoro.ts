import { audioService } from "@/services/audio";
import { configService } from "@/services/config";
import { logger } from "@/services/logger";
import { COLORS, POMODORO } from "@/utils/constants";
import chalk from "chalk";
import { Command } from "commander";
import notifier from 'node-notifier'

export const pomodoroCommand = new Command('pomodoro').description('Start Pomodoro timer').argument('[action]' ,'Action: start, stop, status (default: start)').option('-w, --work <minutes>', 'Work duration in minutes', String(POMODORO.WORK_DURATION)).option('-b, --break <minutes>', 'Break duration in minutes', String(POMODORO.BREAK_DURATION)).action(async (action = 'start', options)=>{
    try{
        if(!configService.isPro()){
            logger.proRequired();
            return;
        }

        const workDuration = parseInt(options.work);
        const breakDuration = parseInt(options.break);

        if(action === 'start'){
            await startPomodoro(workDuration, breakDuration);
        }else if(action === 'stop'){
            stopPomodoro();
        }else if(action === 'status'){
            showStatus();
        }else{
            logger.error(`Invalid action: ${action}`);
            logger.info('Available actions: start, stop, status');
        }
    }catch(error){
        logger.error('Pomodoro error', error as Error);
        process.exit(1);
    }
});

let pomodoroInterval:NodeJS.Timeout | null = null;
let currentSession: 'work' | 'break' = 'work';
let remainingTime: number = 0;
let sessionsCompleted: number = 0;

async function startPomodoro(workMinutes: number, breakMinutes: number): Promise<void>{
    logger.clear();
    logger.box('POMODORO TIMER STARTED');
    logger.newLine();

    remainingTime = workMinutes * 60;
    currentSession = 'work';

    logger.info(`Work session: ${workMinutes} minutes`);
    logger.info(`Break: ${breakMinutes} minutes`);
    logger.newLine();
    logger.flowActivated();
    logger.newLine();

    if(!audioService.isPlaying() && configService.get('autoStartPomodoro')){
        logger.info('Starting music...');
    }

    pomodoroInterval = setInterval(()=>{
        remainingTime --;

        const minutes = Math.floor(remainingTime / 60);
        const seconds = remainingTime % 60;
        const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        process.stdout.write(`\r${currentSession === 'work' ? '🎯' : '☕'} ${chalk.hex(COLORS.PRIMARY).bold(timeString)}`);

        if(remainingTime <= 0){
            if(currentSession === 'work'){
                sessionsCompleted++;
                logger.newLine();
                logger.newLine();
                logger.success(`Work session #${sessionsCompleted} completed!`);

                notify('Work Session Complete!', `Great job! Take a ${breakMinutes} minute break.`);

                // pause
                if (audioService.isPlaying()) {
                    audioService.pause();
                }

                // Start break
                currentSession = 'break';
                remainingTime = breakMinutes * 60;
                
                logger.newLine();
                logger.info(`Starting ${breakMinutes} minute break...`);
                logger.newLine();
            }else{
                logger.newLine();
                logger.newLine();
                logger.success('Break complete! Ready to focus again?');

                notify('Break Complete!', `Time to get back to work!`);

                // Resume
                if (!audioService.isPlaying() && configService.get('autoStartPomodoro')) {
                    logger.info('Resuming music...');
                  }
                
                currentSession = 'work';
                remainingTime = workMinutes * 60;
                
                logger.newLine();
                logger.info(`Starting work session #${sessionsCompleted + 1}...`);
                logger.newLine();
            }
        }
    },1000);

    process.on('SIGINT', () => {
        stopPomodoro();
        process.exit(0);
    });
}

function stopPomodoro():void{
    if(pomodoroInterval){
        clearInterval(pomodoroInterval);
        pomodoroInterval = null;
        logger.newLine();
        logger.newLine();
        logger.success('Pomodoro timer stopped');
        logger.info(`Sessions completed: ${sessionsCompleted}`);
    }else{
        logger.info('No active Pomodoro session');
    }
}

function showStatus():void {
    if(pomodoroInterval){
        const minutes = Math.floor(remainingTime / 60);
        const seconds = remainingTime % 60;
        logger.info(`Current session: ${currentSession}`);
        logger.info(`Time remaining: ${minutes}:${seconds.toString().padStart(2, '0')}`);
        logger.info(`Sessions completed: ${sessionsCompleted}`);
    }else{
        logger.info('No active Pomodoro session');
        logger.info('Run "codefi pomodoro start" to begin');
    }
}

function notify(title: string, message: string): void {
    if (configService.get('notifications')) {
      notifier.notify({
        title,
        message,
        sound: true,
        wait: false,
      });
    }
}

export default pomodoroCommand;