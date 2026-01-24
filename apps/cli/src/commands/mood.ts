import { audioService } from "@/services/audio";
import { configService } from "@/services/config";
import { logger } from "@/services/logger";
import { COLORS, MOODS } from "@/utils/constants";
import chalk from "chalk";
import { Command } from "commander";
import inquirer from "inquirer";
import type { MoodType } from "@/types";

export const moodCommand = new Command('mood').description('Select or change mood').argument('[mood]', 'Mood type (focus, chill, debug, flow, creative)').action(async (moodArg?: string) => {
    try{
        let selectorMood: MoodType;

        if(moodArg){
            if(!Object.keys(MOODS).includes(moodArg)){
                logger.error(`Invalid mood: ${moodArg}`);
                logger.info(`Available moods: ${Object.keys(MOODS).join(', ')}`);
                process.exit(1);
            }
            selectorMood = moodArg as MoodType;
        }else {
            logger.clear();
            logger.box('SELECT YOUR CODING MOOD');
            logger.newLine();

            const choices = Object.entries(MOODS).map(([key, value])=>({
                name: `${value.emoji} ${value.name.padEnd(20)} - ${value.description}`,
                value: key,
                short: value.name,
            }));

            const answer = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'mood',
                    message: 'Choose your mood:',
                    choices,
                    pageSize:10,
                },
            ]);

            selectorMood = answer.mood as MoodType;
        }

        // set mood
        audioService.setMood(selectorMood);
        const moodConfig = MOODS[selectorMood];

        logger.newLine();
        logger.success(`Mood set to: ${moodConfig.emoji} ${moodConfig.name}`);
        logger.info(`Description: ${moodConfig.description}`);
        logger.info(`Tempo: ${moodConfig.tempo}`);
        logger.newLine();

        // If music is playing, suggest restart
        if (audioService.isPlaying()) {
            logger.warning('Restart playback to apply new mood');
            logger.info('Run: codefi stop && codefi play');
        } else {
            logger.info('Run "codefi play" to start with this mood');
        }
    }catch(error){
        logger.error('Failed to set mood', error as Error);
        process.exit(1);
    }
})

export default moodCommand;