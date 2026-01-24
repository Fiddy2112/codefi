import { configService } from "@/services/config";
import { logger } from "@/services/logger";
import { Command } from "commander";
import inquirer from "inquirer";

export const loginCommand = new Command('login').description('Login to CodeFi Pro').action(async ()=>{
    try{
        logger.clear();
        logger.box('LOGIN TO CODEFI PRO');
        logger.newLine();

        if(configService.isLoggedIn()){
            const userId = configService.get('userId');
            logger.warning(`Already logged in as: ${userId}`);
            logger.info('Use "codefi logout" to logout first');
            return;
        }

        logger.info('Enter your CodeFi Pro credentials');
        logger.newLine();

        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'email',
                message: 'Email:',
                validate: (input) => {
                  if (!input.includes('@')) {
                    return 'Please enter a valid email';
                  }
                  return true;
                },
            },
            {
                type: 'password',
                name: 'password',
                message: 'Password:',
                mask: '*',
                validate: (input) => {
                  if (input.length < 6) {
                    return 'Password must be at least 6 characters';
                  }
                  return true;
                },
            },
        ]);

        const spinner = logger.spinner('Authenticating...');
        spinner.start();

        await new Promise(resolve => setTimeout(resolve, 2000));

        const mockUserId = answers.email.split('0')[0];
        const mockToken = 'mock_jwt_token' + Date.now();
        const isPro = true;

        spinner.success('Authentication successful!');
        logger.newLine();

        configService.login(mockUserId, mockToken, isPro);

        logger.success(`Welcome back, ${mockUserId}`);
        logger.newLine();

        if(isPro){
            logger.neon('✨ CodeFi Pro activated!');
            logger.newLine();
            logger.info('You now have access to:');
            logger.info('  • 100+ curated tracks');
            logger.info('  • Spotify integration');
            logger.info('  • AI mood detection');
            logger.info('  • Pomodoro timer');
            logger.info('  • Custom playlists');
            logger.info('  • Cross-device sync');
        }

        
        logger.newLine();
        logger.divider();
        logger.info('Run "codefi play" to start coding with Pro features!');
        logger.divider();

    }catch(error){
      logger.error('Login failed', error as Error);
      logger.newLine();
      logger.info('Need a Pro account?');
      logger.info('Sign up at: https://codefi.dev/pricing');
      process.exit(1);
    }
})

export default loginCommand;