import Conf from 'conf';
import path from 'path';
import os from 'os';
import { AUDIO, PATHS, POMODORO } from '@/utils/constants';
import {UserConfig} from "../types/index.js"

class ConfigService {
    private config: Conf<UserConfig>;
    private configDir: string;

    constructor(){
        this.configDir = path.join(os.homedir(), PATHS.CONFIG_DIR);

        this.config = new Conf<UserConfig>({
            projectName: 'codefi',
            cwd: this.configDir,
            defaults: this.getDefaults(),
        })
    }

    private getDefaults(): UserConfig {
        return {
            isPro: false,
            defaultMood: 'focus',
            defaultVolume: AUDIO.DEFAULT_VOLUME,
            pomodoroWorkDuration: POMODORO.WORK_DURATION,
            pomodoroBreakDuration: POMODORO.BREAK_DURATION,
            autoStartPomodoro: false,
            spotifyConnected: false,
            notifications: true,
        }
    }

    get<K extends keyof UserConfig>(key: K): UserConfig[K] {
        return this.config.get(key);
    }

    set<K extends keyof UserConfig>(key: K, value: UserConfig[K]): void {
        this.config.set(key, value);
    }

    getAll(): UserConfig {
        return this.config.store;
    }

    update(updates: Partial<UserConfig>): void {
        Object.entries(updates).forEach(([key, value]) => {
          this.config.set(key as keyof UserConfig, value);
        });
    }

    reset(): void {
        this.config.clear();
        this.config.store = this.getDefaults();
    }

    isPro(): boolean {
        return this.config.get('isPro');
    }

    isLoggedIn(): boolean {
        return !!this.config.get('token');
    }

    login(userId: string, token: string, isPro: boolean = false): void {
        this.config.set('userId', userId);
        this.config.set('token', token);
        this.config.set('isPro', isPro);
    }

    logout(): void {
        this.config.delete('userId');
        this.config.delete('token');
        this.config.set('isPro', false);
    }

    getConfigDir(): string {
        return this.configDir;
    }

    getTracksDir(): string {
        return path.join(this.configDir, PATHS.TRACKS_DIR);
    }

    export(): string {
        return JSON.stringify(this.config.store, null, 2);
    }

    import(configString: string): void {
        try {
          const importedConfig = JSON.parse(configString);
          this.update(importedConfig);
        } catch (error) {
          throw new Error('Invalid config format');
        }
    }
}

export const configService = new ConfigService();