import { configService } from "@/services/config";
import { logger } from "@/services/logger";
import { Command } from "commander";
import inquirer from "inquirer";

export const logoutCommand = new Command('logout').description('Logout from CodeFi').action(async ()=>{
    try{
        if(!configService.isLoggedIn()){
            logger.info('You are not logged in');
            return;
        }

        const userId = configService.get('userId');

        const answer = await inquirer.prompt([
            {
                type:"confirm",
                name: "confirmLogout",
                message: `Are you sure you want to logout from ${userId}`,
                default: false,
            },
        ]);

        if(!answer.confirmLogout){
            logger.info('Logout cancelled');
            return;
        }

        configService.logout();

        logger.newLine();
        logger.success('Successfully logged out');
        logger.newLine();
        logger.info('You can still use free features');
        logger.info('Login again with: codefi login');
    }catch(error){
      logger.error('Logout failed', error as Error);
      process.exit(1);
    }
})

export default logoutCommand;