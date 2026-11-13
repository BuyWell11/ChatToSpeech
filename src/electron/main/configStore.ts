import * as fs from 'fs/promises';
import * as path from 'path';
import type { AppConfig } from '../shared/config';

const defaultConfig: AppConfig = {
  TWITCH_CHANNELS: [],
  TWITCH_USERNAME: '',
  BOT_COMMAND_PREFIX: '!',
  TTS_GENDERS: { female: 'anna', male: 'aleksandr', default: 'anna' },
  AUDIO_VOLUME: 0.8,
  MESSAGE_COOLDOWN_MS: 0,
  DEFAULT_MODEL_NAME: '',
  USER_VOICES: {},
  BANS: [],
  REGEX_REPLACEMENTS: {},
  RVC_SETTINGS: {
    pitch: 0,
    f0Method: 'rmvpe',
    indexRate: 0.45,
    volumeEnvelope: 1,
    protect: 0.33,
    embedderModel: 'contentvec',
    speakerId: 0,
    cleanAudio: false,
    cleanStrength: 0.5,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeConfig(value: unknown): AppConfig {
  const saved = isRecord(value) ? value : {};
  const ttsGenders = isRecord(saved.TTS_GENDERS) ? saved.TTS_GENDERS : {};
  const rvcSettings = isRecord(saved.RVC_SETTINGS) ? saved.RVC_SETTINGS : {};
  const audioVolume = Number(saved.AUDIO_VOLUME ?? defaultConfig.AUDIO_VOLUME);
  const cooldown = Number(saved.MESSAGE_COOLDOWN_MS ?? 0);

  return {
    ...defaultConfig,
    TWITCH_CHANNELS: Array.isArray(saved.TWITCH_CHANNELS)
      ? saved.TWITCH_CHANNELS.filter((channel): channel is string => typeof channel === 'string')
      : [],
    TWITCH_USERNAME: typeof saved.TWITCH_USERNAME === 'string' ? saved.TWITCH_USERNAME : '',
    BOT_COMMAND_PREFIX:
      typeof saved.BOT_COMMAND_PREFIX === 'string' ? saved.BOT_COMMAND_PREFIX : defaultConfig.BOT_COMMAND_PREFIX,
    TTS_GENDERS: {
      female: typeof ttsGenders.female === 'string' ? ttsGenders.female : defaultConfig.TTS_GENDERS.female,
      male: typeof ttsGenders.male === 'string' ? ttsGenders.male : defaultConfig.TTS_GENDERS.male,
      default: typeof ttsGenders.default === 'string' ? ttsGenders.default : defaultConfig.TTS_GENDERS.default,
    },
    AUDIO_VOLUME: Number.isFinite(audioVolume) ? Math.min(1, Math.max(0, audioVolume)) : 0.8,
    MESSAGE_COOLDOWN_MS: Number.isFinite(cooldown) ? Math.max(0, cooldown) : 0,
    DEFAULT_MODEL_NAME:
      typeof saved.DEFAULT_MODEL_NAME === 'string' ? saved.DEFAULT_MODEL_NAME : defaultConfig.DEFAULT_MODEL_NAME,
    USER_VOICES: isRecord(saved.USER_VOICES)
      ? Object.fromEntries(
          Object.entries(saved.USER_VOICES).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      : {},
    BANS: Array.isArray(saved.BANS)
      ? saved.BANS.filter((entry): entry is string => typeof entry === 'string')
      : [],
    REGEX_REPLACEMENTS: isRecord(saved.REGEX_REPLACEMENTS)
      ? Object.fromEntries(
          Object.entries(saved.REGEX_REPLACEMENTS).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      : {},
    RVC_SETTINGS: {
      pitch: Number.isFinite(Number(rvcSettings.pitch)) ? Number(rvcSettings.pitch) : 0,
      f0Method:
        typeof rvcSettings.f0Method === 'string' ? rvcSettings.f0Method : defaultConfig.RVC_SETTINGS.f0Method,
      indexRate: Number.isFinite(Number(rvcSettings.indexRate))
        ? Number(rvcSettings.indexRate)
        : defaultConfig.RVC_SETTINGS.indexRate,
      volumeEnvelope: Number.isFinite(Number(rvcSettings.volumeEnvelope))
        ? Number(rvcSettings.volumeEnvelope)
        : defaultConfig.RVC_SETTINGS.volumeEnvelope,
      protect: Number.isFinite(Number(rvcSettings.protect))
        ? Number(rvcSettings.protect)
        : defaultConfig.RVC_SETTINGS.protect,
      embedderModel:
        typeof rvcSettings.embedderModel === 'string'
          ? rvcSettings.embedderModel
          : defaultConfig.RVC_SETTINGS.embedderModel,
      speakerId: Number.isFinite(Number(rvcSettings.speakerId)) ? Number(rvcSettings.speakerId) : 0,
      cleanAudio: typeof rvcSettings.cleanAudio === 'boolean' ? rvcSettings.cleanAudio : false,
      cleanStrength: Number.isFinite(Number(rvcSettings.cleanStrength))
        ? Number(rvcSettings.cleanStrength)
        : defaultConfig.RVC_SETTINGS.cleanStrength,
    },
  };
}

export class ConfigStore {
  private readonly configPath: string;
  private config: AppConfig = normalizeConfig(defaultConfig);

  constructor(userDataPath: string, legacyConfigPath: string) {
    this.configPath = path.join(userDataPath, 'config.json');
    this.legacyConfigPath = legacyConfigPath;
  }

  private readonly legacyConfigPath: string;

  async load(): Promise<AppConfig> {
    let configPath = this.configPath;
    try {
      await fs.access(configPath);
    } catch (error) {
      if (!this.isNotFound(error)) throw error;
      configPath = this.legacyConfigPath;
    }

    try {
      const contents = await fs.readFile(configPath, 'utf8');
      this.config = normalizeConfig(JSON.parse(contents) as unknown);
    } catch (error) {
      if (!this.isNotFound(error)) {
        throw new Error(`Не удалось загрузить конфигурацию ${configPath}: ${String(error)}`);
      }
      this.config = normalizeConfig(defaultConfig);
    }

    await this.save();
    return this.get();
  }

  get(): AppConfig {
    return this.config;
  }

  async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    const temporaryPath = `${this.configPath}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(this.config, null, 2), 'utf8');
    await fs.rename(temporaryPath, this.configPath);
  }

  private isNotFound(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
  }
}
