audioService
import { audioService } from "@/services/audio";
import { logger } from "@/services/logger";
import { Command } from "commander";

export const stopCommand = new Command('stop').description('Stop playing music').action(()=>{
    try{
        if(!audioService.isPlaying()){
            logger.info('No music is currently playing');
            return;
        }

        audioService.stop();
        logger.success('Music stopped successfully')
    }catch(error){
        logger.error('Failed to stop playback', error as Error);
        process.exit(1);
    }
})

export default stopCommand;