export interface AppConfig {
  TWITCH_CHANNELS: string[];
  TWITCH_USERNAME?: string;
  BOT_COMMAND_PREFIX?: string;
  TTS_GENDERS: { female: string; male: string; default: string };
  AUDIO_VOLUME: number;
  MESSAGE_COOLDOWN_MS?: number;
  DEFAULT_MODEL_NAME: string;
  USER_VOICES: Record<string, string>;
  BANS: string[];
  REGEX_REPLACEMENTS?: Record<string, string>;
  RVC_SETTINGS: {
    pitch: number;
    f0Method: string;
    indexRate: number;
    volumeEnvelope: number;
    protect: number;
    embedderModel: string;
    speakerId: number;
    cleanAudio: boolean;
    cleanStrength: number;
  };
}
