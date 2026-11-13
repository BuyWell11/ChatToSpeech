import * as tmi from 'tmi.js';
import type { AppConfig } from '../../shared/config';
import { AudioQueue } from './audioQueue';
import { MessageProcessor } from './messageProcessor';

export interface TwitchCredentials {
  username: string;
  oauthToken: string;
}

export type TwitchStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export function initTwitchListener(
  audioQueue: AudioQueue,
  config: AppConfig,
  credentials: TwitchCredentials,
  onStatus: (status: TwitchStatus, message?: string) => void,
  onUserVoiceChange: (username: string, voice: string) => Promise<void>,
): tmi.Client {
  async function saveUserVoice(username: string, voice: string): Promise<void> {
    config.USER_VOICES[username.toLowerCase()] = voice;
    await onUserVoiceChange(username.toLowerCase(), voice);
  }

  const identity = credentials.username && credentials.oauthToken
    ? {
        username: credentials.username,
        password: credentials.oauthToken,
      }
    : undefined;

  if (!identity) {
    throw new Error('Для подключения укажите Twitch username и OAuth-токен.');
  }

  const opts: tmi.Options = {
    options: {
      debug: false,
    },
    identity,
    channels: config.TWITCH_CHANNELS,
  };

  const client = new tmi.Client(opts);

  client.on('connected', (address, port) => {
    onStatus('connected');
    console.log(`[Twitch] Слушаю каналы: ${config.TWITCH_CHANNELS.join(', ')}`);
    console.log('---------------------------------------------------------');
    console.log(`[Twitch] Подключение к Twitch: ${address}:${port}`);
  });
  client.on('disconnected', (reason) => {
    onStatus('disconnected', reason);
  });

  client.on('message', async (channel, tags, message, self) => {
    if (self) return;

    const displayName = tags['display-name'] || tags['username'] || 'Аноним';
    const rawUsername = tags['username'] || 'anonymous';
    const availableVoices = await audioQueue.getAvailableVoices();
    const result = MessageProcessor.process(rawUsername, message, saveUserVoice, config, availableVoices);

    if (result.commandReply) {
      await client.say(channel, result.commandReply);
      return;
    }

    if (result.shouldQueue && result.text && result.voice) {
      console.log(`[Чат] ${displayName}: ${result.text} (Голос: ${result.voice})`);
      audioQueue.push(result.text, result.voice);
    }
  });

  client.connect().catch((err) => {
    console.error('[Twitch] Ошибка подключения к Twitch:', err);
    onStatus('error', err instanceof Error ? err.message : String(err));
  });
  onStatus('connecting');

  return client;
}
