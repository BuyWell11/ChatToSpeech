import { app, BrowserWindow, ipcMain, safeStorage, shell } from 'electron';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { AppConfig } from '../shared/config';
import type { VoiceGroups } from '../shared/contract';
import { AudioQueue } from './services/audioQueue';
import { LocalRvcService } from './services/rvcService';
import { initTwitchListener, TwitchStatus } from './services/twitch';
import { ConfigStore, normalizeConfig } from './configStore';
import type {
  DesktopEngineStatus,
  DesktopState,
  DesktopTwitchStatus,
  EditableSettings,
  SetupInput,
  UserVoiceInput,
} from '../shared/contract';

interface StoredCredentials {
  username: string;
  oauthToken: string;
}

const emptyVoiceGroups = (): VoiceGroups => ({ male: [], female: [], rhvoice: [] });
let window: BrowserWindow | undefined;
let configStore: ConfigStore;
let config: AppConfig;
let rvcService: LocalRvcService | undefined;
let audioQueue: AudioQueue | undefined;
let twitchClient: ReturnType<typeof initTwitchListener> | undefined;
let twitchStatus: DesktopTwitchStatus = 'offline';
let engineStatus: DesktopEngineStatus = 'not-checked';
let statusMessage: string | undefined;
let credentialsPath: string;
let runtimeRoot: string;
let resourceRoot: string;
let configWriteChain = Promise.resolve();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getApplicationRoot(): string {
  return app.isPackaged ? process.resourcesPath : app.getAppPath();
}

async function getRuntimeRoot(): Promise<string> {
  if (!app.isPackaged) return resourceRoot;

  const projectRoot = path.resolve(resourceRoot, '..', '..', '..');
  const isProjectRuntime = await Promise.all([
    fileExists(path.join(projectRoot, 'env', 'python.exe')),
    fileExists(path.join(projectRoot, 'setup-runtime.ps1')),
    fileExists(path.join(projectRoot, 'requirements-local.txt')),
  ]);
  if (isProjectRuntime.every(Boolean)) {
    return projectRoot;
  }

  return path.dirname(process.execPath);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

function saveConfig(): Promise<void> {
  const write = configWriteChain.then(() => configStore.save());
  configWriteChain = write.catch(() => undefined);
  return write;
}

async function getState(): Promise<DesktopState> {
  const voices = audioQueue ? await audioQueue.getAvailableVoices() : emptyVoiceGroups();
  const tokenConfigured = await fileExists(credentialsPath);
  return {
    setupComplete: config.TWITCH_CHANNELS.length > 0 && Boolean(config.TWITCH_USERNAME) && tokenConfigured,
    twitchStatus,
    engineStatus,
    statusMessage,
    tokenConfigured,
    config: structuredClone(config),
    voices,
    users: Object.entries(config.USER_VOICES)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([username, voice]) => ({ username, voice })),
  };
}

function broadcastState(): void {
  if (!window || window.isDestroyed()) return;
  void getState()
    .then((state) => window?.webContents.send('desktop:state-changed', state))
    .catch((error) => console.error('[Electron] Не удалось обновить состояние интерфейса:', error));
}

function mapTwitchStatus(status: TwitchStatus): DesktopTwitchStatus {
  if (status === 'disconnected') return 'offline';
  return status;
}

async function readCredentials(): Promise<StoredCredentials> {
  if (!(await fileExists(credentialsPath))) {
    throw new Error('Сначала сохраните данные Twitch на экране настройки.');
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('В Windows недоступно защищённое хранилище токена. Проверьте профиль пользователя ОС.');
  }

  const encrypted = await fs.readFile(credentialsPath);
  let credentials: unknown;
  try {
    credentials = JSON.parse(safeStorage.decryptString(encrypted)) as unknown;
  } catch (error) {
    throw new Error(`Не удалось расшифровать сохранённый Twitch-токен: ${String(error)}`);
  }
  if (
    !isRecord(credentials) ||
    typeof credentials.username !== 'string' ||
    typeof credentials.oauthToken !== 'string'
  ) {
    throw new Error('Сохранённые данные Twitch повреждены. Введите их заново.');
  }
  return { username: credentials.username, oauthToken: credentials.oauthToken };
}

async function initializeSpeechEngine(): Promise<void> {
  if (rvcService && engineStatus === 'ready') return;

  engineStatus = 'checking';
  statusMessage = 'Проверяю локальную среду RHVoice/RVC...';
  broadcastState();

  const enginePath = path.join(runtimeRoot, 'engine');
  const localVoicesPath = path.join(runtimeRoot, 'voices');
  const savedVoicesPath = path.join(app.getPath('userData'), 'voices');
  const voicesPath =
    app.isPackaged && !(await fileExists(localVoicesPath)) && (await fileExists(savedVoicesPath))
      ? savedVoicesPath
      : localVoicesPath;
  const pythonPath = path.join(runtimeRoot, 'env', 'python.exe');
  const workerPath = app.isPackaged
    ? path.join(resourceRoot, 'rvc_worker.py')
    : path.join(resourceRoot, 'src', 'electron', 'main', 'runtime', 'rvc_worker.py');

  await fs.mkdir(path.join(voicesPath, 'male'), { recursive: true });
  await fs.mkdir(path.join(voicesPath, 'female'), { recursive: true });

  const service = new LocalRvcService(config, runtimeRoot, {
    enginePath,
    voicesPath,
    pythonPath,
    workerPath,
  });
  try {
    await service.connect();
    rvcService = service;
    audioQueue = new AudioQueue(service, config, path.join(runtimeRoot, 'temp'));
    if (!config.DEFAULT_MODEL_NAME) {
      const groups = await audioQueue.getAvailableVoices();
      config.DEFAULT_MODEL_NAME = groups.male[0] ?? groups.female[0] ?? `RHVoice: ${groups.rhvoice[0] ?? ''}`;
      await saveConfig();
    }
    engineStatus = 'ready';
    statusMessage = undefined;
    broadcastState();
  } catch (error) {
    engineStatus = 'error';
    statusMessage = error instanceof Error ? error.message : String(error);
    broadcastState();
    throw error;
  }
}

function handleTwitchStatus(status: TwitchStatus, message?: string): void {
  twitchStatus = mapTwitchStatus(status);
  statusMessage = message;
  broadcastState();
}

async function saveSetup(input: SetupInput): Promise<DesktopState> {
  const channelName = input.channel.trim().replace(/^#/, '').toLowerCase();
  const username = input.twitchUsername.trim();
  const token = input.oauthToken.trim();
  if (!/^[a-z0-9_]{1,25}$/.test(channelName) || !/^[a-zA-Z0-9_]{1,25}$/.test(username)) {
    throw new Error('Канал и имя пользователя Twitch должны содержать только буквы, цифры и подчёркивания (до 25 символов).');
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Безопасное хранилище ОС недоступно, поэтому токен не будет сохранён.');
  }

  const existingCredentials =
    token || !(await fileExists(credentialsPath)) ? undefined : await readCredentials();
  const oauthToken = token || existingCredentials?.oauthToken || '';
  if (!oauthToken) throw new Error('Введите OAuth-токен Twitch.');
  if (!oauthToken.startsWith('oauth:')) throw new Error('OAuth-токен должен начинаться с "oauth:".');
  const encrypted = safeStorage.encryptString(JSON.stringify({ username, oauthToken }));
  await fs.mkdir(path.dirname(credentialsPath), { recursive: true });
  const temporaryPath = `${credentialsPath}.tmp`;
  await fs.writeFile(temporaryPath, encrypted);
  await fs.rename(temporaryPath, credentialsPath);

  config.TWITCH_CHANNELS = [`#${channelName}`];
  config.TWITCH_USERNAME = username;
  await saveConfig();
  statusMessage = undefined;
  broadcastState();
  return getState();
}

async function connectTwitch(): Promise<DesktopState> {
  if (!config.TWITCH_CHANNELS.length || !config.TWITCH_USERNAME) {
    throw new Error('Сначала заполните первоначальную настройку Twitch.');
  }
  if (twitchClient && twitchStatus !== 'error') return getState();
  if (twitchClient) {
    const previousClient = twitchClient;
    twitchClient = undefined;
    await previousClient.disconnect();
  }

  const credentials = await readCredentials();
  await initializeSpeechEngine();
  twitchClient = initTwitchListener(
    audioQueue!,
    config,
    { username: credentials.username, oauthToken: credentials.oauthToken },
    handleTwitchStatus,
    async () => saveConfig(),
  );
  return getState();
}

async function disconnectTwitch(): Promise<DesktopState> {
  const client = twitchClient;
  twitchClient = undefined;
  twitchStatus = 'offline';
  if (client) await client.disconnect();
  broadcastState();
  return getState();
}

async function updateSettings(input: unknown): Promise<DesktopState> {
  if (!isRecord(input)) throw new Error('Некорректные настройки.');
  const allowedKeys = new Set([
    'AUDIO_VOLUME',
    'MESSAGE_COOLDOWN_MS',
    'DEFAULT_MODEL_NAME',
    'TTS_GENDERS',
    'BANS',
    'REGEX_REPLACEMENTS',
    'RVC_SETTINGS',
  ]);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw new Error('В запросе есть неизвестные параметры настроек.');
  }
  if ('AUDIO_VOLUME' in input && (
    typeof input.AUDIO_VOLUME !== 'number' ||
    !Number.isFinite(input.AUDIO_VOLUME) ||
    input.AUDIO_VOLUME < 0 ||
    input.AUDIO_VOLUME > 1
  )) {
    throw new Error('Громкость должна быть числом от 0 до 1.');
  }
  if ('MESSAGE_COOLDOWN_MS' in input && (
    typeof input.MESSAGE_COOLDOWN_MS !== 'number' ||
    !Number.isFinite(input.MESSAGE_COOLDOWN_MS) ||
    input.MESSAGE_COOLDOWN_MS < 0
  )) {
    throw new Error('Пауза между сообщениями должна быть неотрицательным числом.');
  }
  if ('DEFAULT_MODEL_NAME' in input && typeof input.DEFAULT_MODEL_NAME !== 'string') {
    throw new Error('Голос по умолчанию должен быть строкой.');
  }
  if ('TTS_GENDERS' in input) {
    const voices = input.TTS_GENDERS;
    if (
      !isRecord(voices) ||
      ['female', 'male', 'default'].some((key) => typeof voices[key] !== 'string')
    ) {
      throw new Error('Укажите корректные голоса RHVoice для категорий female, male и default.');
    }
  }
  if ('BANS' in input && (
    !Array.isArray(input.BANS) ||
    input.BANS.some((entry) => typeof entry !== 'string')
  )) {
    throw new Error('Список игнорируемых пользователей должен быть списком строк.');
  }
  if ('REGEX_REPLACEMENTS' in input) {
    if (
      !isRecord(input.REGEX_REPLACEMENTS) ||
      Object.entries(input.REGEX_REPLACEMENTS).some(([pattern, replacement]) => !pattern || typeof replacement !== 'string')
    ) {
      throw new Error('Правила замены должны быть объектом «regex: текст».');
    }
    try {
      for (const pattern of Object.keys(input.REGEX_REPLACEMENTS)) new RegExp(pattern, 'gi');
    } catch (error) {
      throw new Error(`Некорректное регулярное выражение: ${String(error)}`);
    }
  }
  if ('RVC_SETTINGS' in input && !isRecord(input.RVC_SETTINGS)) {
    throw new Error('Настройки RVC должны быть объектом.');
  }

  const mergedRvcSettings = {
    ...config.RVC_SETTINGS,
    ...(isRecord(input.RVC_SETTINGS) ? input.RVC_SETTINGS : {}),
  };
  const numericRvcSettings: Array<[string, number, number, number]> = [
    ['pitch', -24, 24, mergedRvcSettings.pitch],
    ['indexRate', 0, 1, mergedRvcSettings.indexRate],
    ['volumeEnvelope', 0, 1, mergedRvcSettings.volumeEnvelope],
    ['protect', 0, 0.5, mergedRvcSettings.protect],
    ['cleanStrength', 0, 1, mergedRvcSettings.cleanStrength],
    ['speakerId', 0, Number.MAX_SAFE_INTEGER, mergedRvcSettings.speakerId],
  ];
  for (const [name, minimum, maximum, value] of numericRvcSettings) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
      throw new Error(`Параметр RVC "${name}" должен быть числом от ${minimum} до ${maximum}.`);
    }
  }
  if (!Number.isInteger(mergedRvcSettings.pitch) || !Number.isInteger(mergedRvcSettings.speakerId)) {
    throw new Error('Параметры RVC pitch и speakerId должны быть целыми числами.');
  }
  if (typeof mergedRvcSettings.cleanAudio !== 'boolean') {
    throw new Error('Параметр очистки аудио должен быть логическим значением.');
  }
  if (typeof mergedRvcSettings.f0Method !== 'string' || typeof mergedRvcSettings.embedderModel !== 'string') {
    throw new Error('Метод F0 и модель embedder должны быть строками.');
  }
  const updatedConfig = normalizeConfig({
    ...config,
    ...input,
    RVC_SETTINGS: mergedRvcSettings,
  });
  if (updatedConfig.DEFAULT_MODEL_NAME && audioQueue) {
    const available = await audioQueue.getAvailableVoices();
    const selectableVoices = [
      ...available.male,
      ...available.female,
      ...available.rhvoice.map((voice) => `RHVoice: ${voice}`),
    ];
    if (!selectableVoices.includes(updatedConfig.DEFAULT_MODEL_NAME)) {
      throw new Error(`Голос по умолчанию "${updatedConfig.DEFAULT_MODEL_NAME}" не найден среди доступных голосов.`);
    }
  }
  Object.assign(config, updatedConfig);
  await saveConfig();
  broadcastState();
  return getState();
}

async function setUserVoice(input: UserVoiceInput): Promise<DesktopState> {
  const username = input.username.trim().toLowerCase();
  if (!username) throw new Error('Имя пользователя не может быть пустым.');
  if (input.voice === '') {
    delete config.USER_VOICES[username];
  } else {
    if (!audioQueue) throw new Error('Сначала запустите движок и получите список голосов.');
    const voices = await audioQueue.getAvailableVoices();
    const neuralVoice = [...voices.male, ...voices.female].find(
      (voice) => voice.toLowerCase() === input.voice.toLowerCase(),
    );
    const rhvoicePrefix = /^rhvoice:\s*/i;
    const rhvoiceName = input.voice.replace(rhvoicePrefix, '').trim();
    const directVoice = voices.rhvoice.find((voice) => voice.toLowerCase() === rhvoiceName.toLowerCase());
    if (!neuralVoice && !directVoice) throw new Error(`Голос "${input.voice}" недоступен.`);
    config.USER_VOICES[username] = neuralVoice ?? `RHVoice: ${directVoice}`;
  }
  await saveConfig();
  broadcastState();
  return getState();
}

async function refreshVoices(): Promise<DesktopState> {
  if (!rvcService || !audioQueue) throw new Error('Сначала проверьте или запустите локальный движок.');
  await rvcService.refreshModels();
  broadcastState();
  return getState();
}

async function openVoicesFolder(): Promise<void> {
  const localVoicesPath = path.join(runtimeRoot, 'voices');
  const savedVoicesPath = path.join(app.getPath('userData'), 'voices');
  const voicesPath =
    app.isPackaged && !(await fileExists(localVoicesPath)) && (await fileExists(savedVoicesPath))
      ? savedVoicesPath
      : localVoicesPath;
  await fs.mkdir(path.join(voicesPath, 'male'), { recursive: true });
  await fs.mkdir(path.join(voicesPath, 'female'), { recursive: true });
  const error = await shell.openPath(voicesPath);
  if (error) throw new Error(`Не удалось открыть папку голосовых моделей: ${error}`);
}

function setupRuntime(): Promise<DesktopState> {
  if (engineStatus === 'installing') return Promise.reject(new Error('Установка уже выполняется.'));
  const scriptPath = path.join(resourceRoot, 'setup-runtime.ps1');
  const runtimeTools = path.join(runtimeRoot, 'tools');
  const runtimeEnvironment = path.join(runtimeRoot, 'env');
  const runtimeEngine = path.join(runtimeRoot, 'engine');
  engineStatus = 'installing';
  statusMessage = 'Загружаю RVC engine, Python, CUDA и RHVoice. Первая установка может занять много времени и места на диске.';
  broadcastState();

  return new Promise((resolve, reject) => {
    const installer: ChildProcessWithoutNullStreams = spawn(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
        '-ToolsDirectory',
        runtimeTools,
        '-EnvironmentDirectory',
        runtimeEnvironment,
        '-EngineDirectory',
        runtimeEngine,
      ],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let outputBuffer = '';
    const handleOutput = (chunk: string) => {
      outputBuffer += chunk;
      const lines = outputBuffer.split(/\r?\n/);
      outputBuffer = lines.pop() ?? '';
      const latest = lines.map((line) => line.trim()).filter(Boolean).pop();
      if (latest) {
        statusMessage = latest;
        broadcastState();
      }
    };
    installer.stdout.setEncoding('utf8');
    installer.stderr.setEncoding('utf8');
    installer.stdout.on('data', handleOutput);
    installer.stderr.on('data', handleOutput);
    installer.on('error', (error) => {
      engineStatus = 'error';
      statusMessage = error.message;
      broadcastState();
      reject(error);
    });
    installer.on('close', async (code) => {
      if (code !== 0) {
        engineStatus = 'error';
        const error = new Error(`Установка локальной среды завершилась с кодом ${code}. ${statusMessage ?? ''}`);
        statusMessage = error.message;
        broadcastState();
        reject(error);
        return;
      }
      try {
        await initializeSpeechEngine();
        resolve(await getState());
      } catch (error) {
        reject(error);
      }
    });
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle('desktop:get-state', () => getState());
  ipcMain.handle('desktop:save-setup', (_event, input: unknown) => {
    if (!isRecord(input)) throw new Error('Некорректные данные первоначальной настройки.');
    return saveSetup({
      channel: String(input.channel ?? ''),
      twitchUsername: String(input.twitchUsername ?? ''),
      oauthToken: String(input.oauthToken ?? ''),
    });
  });
  ipcMain.handle('desktop:check-engine', async () => {
    await initializeSpeechEngine();
    return getState();
  });
  ipcMain.handle('desktop:connect-twitch', () => connectTwitch());
  ipcMain.handle('desktop:disconnect-twitch', () => disconnectTwitch());
  ipcMain.handle('desktop:update-settings', (_event, input: unknown) => updateSettings(input));
  ipcMain.handle('desktop:set-user-voice', (_event, input: unknown) => {
    if (!isRecord(input)) throw new Error('Некорректные данные голоса пользователя.');
    return setUserVoice({ username: String(input.username ?? ''), voice: String(input.voice ?? '') });
  });
  ipcMain.handle('desktop:refresh-voices', () => refreshVoices());
  ipcMain.handle('desktop:open-voices-folder', () => openVoicesFolder());
  ipcMain.handle('desktop:setup-runtime', () => setupRuntime());
}

function createWindow(): void {
  window = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 820,
    minHeight: 620,
    backgroundColor: '#f5f6f8',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
  window.on('closed', () => {
    window = undefined;
  });
}

app.whenReady().then(async () => {
  resourceRoot = getApplicationRoot();
  runtimeRoot = await getRuntimeRoot();
  console.log(`[Electron] Локальная среда и временные файлы: ${runtimeRoot}`);
  credentialsPath = path.join(app.getPath('userData'), 'credentials.enc');
  configStore = new ConfigStore(
    app.getPath('userData'),
    path.join(app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath(), 'config.json'),
  );
  config = await configStore.load();
  registerIpcHandlers();
  createWindow();
  void ensureSpeechRuntime().catch((error) => {
    console.error('[Electron] Не удалось автоматически подготовить среду озвучки:', error);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((error) => {
  console.error('[Electron] Не удалось запустить приложение:', error);
  app.quit();
});

async function ensureSpeechRuntime(): Promise<void> {
  const requiredFiles = [
    path.join(runtimeRoot, 'env', 'python.exe'),
    path.join(runtimeRoot, 'engine', 'rvc', 'infer', 'infer.py'),
    path.join(runtimeRoot, 'engine', 'rvc', 'models', 'predictors', 'rmvpe.pt'),
    path.join(runtimeRoot, 'engine', 'rvc', 'models', 'predictors', 'fcpe.pt'),
    path.join(runtimeRoot, 'engine', 'rvc', 'models', 'embedders', 'contentvec', 'config.json'),
    path.join(runtimeRoot, 'engine', 'rvc', 'models', 'embedders', 'contentvec', 'pytorch_model.bin'),
    path.join(runtimeRoot, 'engine', 'ffmpeg.exe'),
    path.join(runtimeRoot, 'engine', 'ffprobe.exe'),
  ];
  const filesPresent = await Promise.all(requiredFiles.map(fileExists));

  if (filesPresent.every(Boolean)) {
    try {
      await initializeSpeechEngine();
    } catch (error) {
      console.error('[Electron] Не удалось запустить локальную среду озвучки:', error);
    }
    return;
  }

  try {
    await setupRuntime();
  } catch (error) {
    console.error('[Electron] Автоматическая установка локальной среды завершилась ошибкой:', error);
  }
}

app.on('before-quit', () => {
  const client = twitchClient;
  twitchClient = undefined;
  if (client) void client.disconnect();
  void rvcService?.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
