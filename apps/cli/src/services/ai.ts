import { spawn } from 'child_process';
import { logger } from './logger';
import { configService } from './config';
import type { CodeActivity, AIMoodResult, MoodType } from '../types';

class AIService {
  async analyzeGitActivity(): Promise<CodeActivity> {
    logger.info('🔍 Analyzing git activity...');

    const activity: CodeActivity = {
      filesChanged: 0,
      linesAdded: 0,
      linesDeleted: 0,
      commits: 0,
      language: 'javascript',
      timeOfDay: new Date().getHours(),
      isDebugging: false,
    };

    try {
      // Get recent commits
      const commitsData = await this.execGit(['log', '--oneline', '--since="1 hour ago"']);
      activity.commits = commitsData.split('\n').filter(Boolean).length;

      // Get diff stats
      const diffData = await this.execGit(['diff', '--stat', 'HEAD~1']);
      const diffLines = diffData.split('\n');
      
      diffLines.forEach(line => {
        if (line.includes('files changed')) {
          const match = line.match(/(\d+) files? changed/);
          if (match) activity.filesChanged = parseInt(match[1]);
        }
        if (line.includes('insertions')) {
          const match = line.match(/(\d+) insertions?/);
          if (match) activity.linesAdded = parseInt(match[1]);
        }
        if (line.includes('deletions')) {
          const match = line.match(/(\d+) deletions?/);
          if (match) activity.linesDeleted = parseInt(match[1]);
        }
      });

      // Detect language from recent files
      const filesData = await this.execGit(['diff', '--name-only', 'HEAD~1']);
      const files = filesData.split('\n').filter(Boolean);
      
      if (files.length > 0) {
        const ext = files[0].split('.').pop();
        activity.language = this.detectLanguage(ext || '');
      }

      // Check for debugging patterns
      const commitMsg = await this.execGit(['log', '-1', '--pretty=%B']);
      activity.isDebugging = /fix|bug|debug|error/i.test(commitMsg);

    } catch (error) {
      logger.warning('Not in a git repository or no recent activity');
    }

    return activity;
  }

  // Detect mood from activity
  async detectMood(): Promise<AIMoodResult> {
    if (!configService.isPro()) {
      throw new Error('AI mood detection requires CodeFi Pro');
    }

    const activity = await this.analyzeGitActivity();

    logger.info('🤖 AI analyzing your coding pattern...');

    // Rule-based AI (can be enhanced with ML model)
    let mood: MoodType = 'focus';
    let confidence = 0.7;
    let reason = '';

    // Debugging session
    if (activity.isDebugging || (activity.linesDeleted > activity.linesAdded)) {
      mood = 'debug';
      confidence = 0.9;
      reason = 'Detected debugging activity (fixes, deletions)';
    }
    // High activity - flow state
    else if (activity.commits > 3 || activity.filesChanged > 5) {
      mood = 'flow';
      confidence = 0.85;
      reason = 'High activity detected - you\'re in the zone!';
    }
    // Late night/early morning - chill
    else if (activity.timeOfDay < 6 || activity.timeOfDay > 22) {
      mood = 'chill';
      confidence = 0.8;
      reason = 'Late night coding session';
    }
    // Small changes - creative exploration
    else if (activity.filesChanged < 3 && activity.commits < 2) {
      mood = 'creative';
      confidence = 0.75;
      reason = 'Exploratory coding detected';
    }
    // Default: deep focus
    else {
      mood = 'focus';
      confidence = 0.7;
      reason = 'Steady coding session';
    }

    return { mood, confidence, reason };
  }

  // Execute git command
  private execGit(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const git = spawn('git', args, { shell: true });
      let output = '';

      git.stdout?.on('data', (data) => {
        output += data.toString();
      });

      git.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error('Git command failed'));
        }
      });
    });
  }

  // Detect programming language
  private detectLanguage(ext: string): string {
    const langMap: Record<string, string> = {
      'js': 'javascript',
      'ts': 'typescript',
      'py': 'python',
      'java': 'java',
      'go': 'go',
      'rs': 'rust',
      'cpp': 'c++',
      'c': 'c',
      'rb': 'ruby',
      'php': 'php',
    };
    
    return langMap[ext] || 'unknown';
  }

  // Enhanced AI with OpenAI (optional)
  async detectMoodWithAI(activity: CodeActivity): Promise<AIMoodResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      logger.warning('OpenAI API key not set. Using rule-based AI.');
      return this.detectMood();
    }

    logger.info('🤖 Asking AI for mood recommendation...');

    // In production: Call OpenAI API
    // For now: Return mock response
    return {
      mood: 'focus',
      confidence: 0.95,
      reason: 'AI analysis suggests deep focus mode',
    };
  }
}

export const aiService = new AIService();