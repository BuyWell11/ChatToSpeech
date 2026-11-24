import type { AppConfig } from './config';

export interface VoiceGroups {
  male: string[];
  female: string[];
  rhvoice: string[];
}

export type DesktopTwitchStatus = 'offline' | 'connecting' | 'connected' | 'error';
export type DesktopEngineStatus = 'not-checked' | 'checking' | 'ready' | 'installing' | 'error';
export type SpeechMode = 'rhvoice' | 'rvc';

export interface RuntimeProgress {
  phase: string;
  percent: number | null;
}

export interface DesktopUserVoice {
  username: string;
  voice: string;
}

export interface DesktopState {
  stateReady: boolean;
  setupComplete: boolean;
  twitchStatus: DesktopTwitchStatus;
  engineStatus: DesktopEngineStatus;
  statusMessage?: string;
  runtimeProgress?: RuntimeProgress;
  tokenConfigured: boolean;
  config: AppConfig;
  voices: VoiceGroups;
  users: DesktopUserVoice[];
}

export interface SetupInput {
  channel: string;
  twitchUsername: string;
  oauthToken: string;
}

export interface TwitchSettingsInput {
  channels: string[];
  username: string;
  oauthToken: string;
}

export interface UserVoiceInput {
  username: string;
  voice: string;
}

export type EditableSettings = Pick<
  AppConfig,
  'AUDIO_VOLUME' | 'MESSAGE_COOLDOWN_MS' | 'DEFAULT_MODEL_NAME' | 'TTS_GENDERS' | 'BANS' | 'REGEX_REPLACEMENTS' | 'RVC_SETTINGS'
>;

export interface DesktopApi {
  getState(): Promise<DesktopState>;
  saveSetup(input: SetupInput): Promise<DesktopState>;
  checkEngine(): Promise<DesktopState>;
  connectTwitch(): Promise<DesktopState>;
  disconnectTwitch(): Promise<DesktopState>;
  updateSettings(settings: Partial<EditableSettings>): Promise<DesktopState>;
  setUserVoice(input: UserVoiceInput): Promise<DesktopState>;
  updateTwitchSettings(input: TwitchSettingsInput): Promise<DesktopState>;
  refreshVoices(): Promise<DesktopState>;
  openVoicesFolder(): Promise<void>;
  setupRuntime(mode: SpeechMode): Promise<DesktopState>;
  onStateChanged(callback: (state: DesktopState) => void): () => void;
}
