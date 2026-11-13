import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { LocalRvcService } from './rvcService';
import type { AppConfig } from '../../shared/config';
import type { VoiceGroups } from '../../shared/contract';

export interface ChatMessage {
  text: string;
  voice: string;
}

interface PlaybackTask {
  filePath: string;
}

export class AudioQueue {
  private textQueue: ChatMessage[] = [];
  private isGenerating: boolean = false;
  private playbackQueue: PlaybackTask[] = [];
  private isPlaying: boolean = false;
  private rvcService: LocalRvcService;
  private tempDir: string;
  private config: AppConfig;
  private lastPlaybackStartedAt: number = 0;

  constructor(rvcService: LocalRvcService, config: AppConfig, tempDirectory: string) {
    this.rvcService = rvcService;
    this.config = config;
    this.tempDir = tempDirectory;
  }

  private async waitForCooldownIfNeeded(): Promise<void> {
    const cooldownMs = Number(this.config.MESSAGE_COOLDOWN_MS ?? 0);
    if (!Number.isFinite(cooldownMs) || cooldownMs <= 0 || this.lastPlaybackStartedAt === 0) {
      return;
    }

    const elapsed = Date.now() - this.lastPlaybackStartedAt;
    const remaining = cooldownMs - elapsed;

    if (remaining > 0) {
      console.log(`[Генератор] Кулдаун: ждём ${remaining}ms перед следующей озвучкой.`);
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }

  push(text: string, voice: string): void {
    this.textQueue.push({ text, voice });
    if (!this.isGenerating) {
      void this.processGenerationLoop();
    }
  }

  async getAvailableVoices(): Promise<VoiceGroups> {
    const groups = await this.rvcService.getVoiceGroups();
    groups.male.sort((a, b) => a.localeCompare(b));
    groups.female.sort((a, b) => a.localeCompare(b));
    groups.rhvoice.sort((a, b) => a.localeCompare(b));
    return groups;
  }

  private async processGenerationLoop(): Promise<void> {
    if (this.textQueue.length === 0) {
      this.isGenerating = false;
      return;
    }

    this.isGenerating = true;
    await this.waitForCooldownIfNeeded();

    const currentMessage = this.textQueue.shift()!;
    const targetModelName = currentMessage.voice;

    let generationAttempts = 0;
    const maxGenerationAttempts = 3;

    while (generationAttempts < maxGenerationAttempts) {
      let filePath = '';
      try {
        filePath = path.join(this.tempDir, `speech_${randomUUID()}.wav`);
        await fs.mkdir(this.tempDir, { recursive: true });
        if (/^rhvoice:\s*/i.test(targetModelName)) {
          await this.rvcService.generateRhvoiceSpeechToFile(
            currentMessage.text,
            targetModelName.replace(/^rhvoice:\s*/i, ''),
            filePath,
          );
        } else {
          await this.rvcService.generateSpeechToFile(
            currentMessage.text,
            targetModelName,
            filePath,
          );
        }

        this.lastPlaybackStartedAt = Date.now();
        this.playbackQueue.push({ filePath });
        if (!this.isPlaying) {
          void this.processPlaybackLoop();
        }
        break;
      } catch (error) {
        if (filePath && existsSync(filePath)) {
          try {
            await fs.unlink(filePath);
          } catch (cleanupError) {
            console.error('[Генератор] Не удалось удалить временный WAV:', cleanupError);
          }
        }

        generationAttempts += 1;
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(
          `[Генератор] Ошибка сборки аудио (${generationAttempts}/${maxGenerationAttempts}) для голоса ${targetModelName}. Причина: ${errorMessage}`,
        );

        if (generationAttempts >= maxGenerationAttempts) {
          console.warn('[Генератор] Превышено максимальное число коротких попыток генерации. Сообщение пропущено.');
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000 * generationAttempts));
      }
    }

    setImmediate(() => void this.processGenerationLoop());
  }

  private async processPlaybackLoop(): Promise<void> {
    if (this.playbackQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const currentTask = this.playbackQueue.shift()!;

    let playbackSettled = false;
    const cleanupAndContinue = async () => {
      if (playbackSettled) return;
      playbackSettled = true;
      try {
        if (existsSync(currentTask.filePath)) {
          await fs.unlink(currentTask.filePath);
        }
      } catch (unlinkError) {
        console.error('[Плеер] Ошибка удаления временного файла:', unlinkError);
      }
      void this.processPlaybackLoop();
    };

    const player = spawn(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$ErrorActionPreference = "Stop"; Add-Type -AssemblyName System; $player = New-Object System.Media.SoundPlayer; $player.SoundLocation = $env:GOVORILKA_AUDIO_PATH; $player.Load(); $player.PlaySync()',
      ],
      {
        windowsHide: true,
        env: {
          ...process.env,
          GOVORILKA_AUDIO_PATH: currentTask.filePath,
        },
      },
    );

    let playerError = '';
    player.stderr.setEncoding('utf8');
    player.stderr.on('data', (chunk: string) => {
      playerError += chunk;
    });
    player.on('error', (error) => {
      console.error('[Плеер] Не удалось запустить воспроизведение Windows:', error);
      void cleanupAndContinue();
    });
    player.on('close', (code) => {
      if (code !== 0) {
        console.error(
          `[Плеер] Windows не смог воспроизвести WAV (код ${code}): ${playerError.trim() || 'нет сведений об ошибке'}`,
        );
      }
      void cleanupAndContinue();
    });
  }
}
