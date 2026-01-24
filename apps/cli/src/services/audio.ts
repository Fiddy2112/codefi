import player from 'play-sound';
import {EventEmitter} from "events";
import type {Track, PlayerState} from "../types/index.js"
import { configService } from '@/services/config.js';
import { logger } from '@/services/logger.js';
import { AUDIO } from '@/utils/constants';

class AudioService extends EventEmitter {
    private audioPlayer: any;
    private currentProcess:any = null;
    private state: PlayerState;

    constructor(){
        super();
        this.audioPlayer = player({});
        this.state = {
            isPlaying: false,
            currentTrack: null,
            volume: configService.get('defaultVolume'),
            mood: configService.get('defaultMood'),
            repeat: false,
            shuffle: false,
        }
    }

    async play(track: Track):Promise<void>{
        try{
            if (this.state.isPlaying) {
                this.stop();
            }

            logger.nowPlaying(track.title, track.artist);

            this.state.currentTrack = track;
            this.state.isPlaying = true;

            logger.info('🎵 [DEMO MODE] Playing in simulation mode...');
            logger.info('💡 Add real audio files to enable actual playback');

            this.currentProcess = this.audioPlayer.play(track.filepath, (err: any) => {
                if (err) {
                  logger.error('Playback error', err);
                  this.state.isPlaying = false;
                  this.emit('error', err);
                  return;
                }
        
                // Track finished
                this.state.isPlaying = false;
                this.emit('trackEnded', track);
        
                // Auto-play next if repeat is on
                if (this.state.repeat) {
                  this.play(track);
                }
            });
        
            this.emit('play', track);
        }catch(error){
            logger.error('Failed to play track', error as Error);
            throw error;
        }
    }

    stop(): void {
        if (this.currentProcess) {
          this.currentProcess.kill();
          this.currentProcess = null;
        }
        
        this.state.isPlaying = false;
        this.state.currentTrack = null;
        
        logger.info('Music stopped');
        this.emit('stop');
    }

    pause(): void {
        this.stop();
        logger.info('Music paused');
        this.emit('pause');
    }

    setVolume(volume: number): void {
        const clampedVolume = Math.max(AUDIO.MIN_VOLUME, Math.min(AUDIO.MAX_VOLUME, volume));
        this.state.volume = clampedVolume;
        configService.set('defaultVolume', clampedVolume);
        
        logger.info(`Volume set to ${clampedVolume}%`);
        this.emit('volumeChange', clampedVolume);
    }

    toggleRepeat(): void {
        this.state.repeat = !this.state.repeat;
        logger.info(`Repeat: ${this.state.repeat ? 'ON' : 'OFF'}`);
        this.emit('repeatChange', this.state.repeat);
    }

    toggleShuffle(): void {
        this.state.shuffle = !this.state.shuffle;
        logger.info(`Shuffle: ${this.state.shuffle ? 'ON' : 'OFF'}`);
        this.emit('shuffleChange', this.state.shuffle);
    }

    getState(): PlayerState {
        return { ...this.state };
    }

    getCurrentTrack(): Track | null {
        return this.state.currentTrack;
    }

    isPlaying(): boolean {
        return this.state.isPlaying;
    }

    setMood(mood: PlayerState['mood']): void {
        this.state.mood = mood;
        configService.set('defaultMood', mood);
        this.emit('moodChange', mood);
    }
}

export const audioService = new AudioService();