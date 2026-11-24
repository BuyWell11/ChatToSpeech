import { contextBridge, ipcRenderer } from 'electron';
import type {
  DesktopApi,
  DesktopState,
  EditableSettings,
  SetupInput,
  SpeechMode,
  TwitchSettingsInput,
  UserVoiceInput,
} from '../shared/contract';

const desktopApi: DesktopApi = {
  getState: () => ipcRenderer.invoke('desktop:get-state') as Promise<DesktopState>,
  saveSetup: (input: SetupInput) => ipcRenderer.invoke('desktop:save-setup', input) as Promise<DesktopState>,
  checkEngine: () => ipcRenderer.invoke('desktop:check-engine') as Promise<DesktopState>,
  connectTwitch: () => ipcRenderer.invoke('desktop:connect-twitch') as Promise<DesktopState>,
  disconnectTwitch: () => ipcRenderer.invoke('desktop:disconnect-twitch') as Promise<DesktopState>,
  updateSettings: (settings: Partial<EditableSettings>) =>
    ipcRenderer.invoke('desktop:update-settings', settings) as Promise<DesktopState>,
  setUserVoice: (input: UserVoiceInput) =>
    ipcRenderer.invoke('desktop:set-user-voice', input) as Promise<DesktopState>,
  updateTwitchSettings: (input: TwitchSettingsInput) =>
    ipcRenderer.invoke('desktop:update-twitch-settings', input) as Promise<DesktopState>,
  refreshVoices: () => ipcRenderer.invoke('desktop:refresh-voices') as Promise<DesktopState>,
  openVoicesFolder: () => ipcRenderer.invoke('desktop:open-voices-folder') as Promise<void>,
  setupRuntime: (mode: SpeechMode) =>
    ipcRenderer.invoke('desktop:setup-runtime', mode) as Promise<DesktopState>,
  onStateChanged(callback: (state: DesktopState) => void) {
    const listener = (_event: Electron.IpcRendererEvent, state: DesktopState) => callback(state);
    ipcRenderer.on('desktop:state-changed', listener);
    return () => ipcRenderer.removeListener('desktop:state-changed', listener);
  },
};

contextBridge.exposeInMainWorld('desktop', desktopApi);
