import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { AppConfig } from '../../shared/config';
import type { VoiceGroups } from '../../shared/contract';

export interface RvcModel {
  name: string;
  gender: 'male' | 'female';
  pthPath: string;
  indexPath: string;
}

export interface RvcRuntimePaths {
  enginePath: string;
  voicesPath: string;
  pythonPath: string;
  workerPath: string;
}

interface WorkerResponse {
  id?: string;
  type?: string;
  ok?: boolean;
  error?: string;
  voices?: string[];
}

interface PendingRequest {
  resolve: (response: WorkerResponse) => void;
  reject: (error: Error) => void;
}

export class LocalRvcService {
  private readonly config: AppConfig;
  private readonly clientPath: string;
  private readonly enginePath: string;
  private readonly voicesPath: string;
  private readonly workerPath: string;
  private readonly pythonPath: string;
  private models: RvcModel[] = [];
  private rhvoiceVoices: string[] = [];
  private worker: ChildProcessWithoutNullStreams | undefined;
  private outputBuffer = '';
  private requestId = 0;
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private readyPromise: Promise<void> | undefined;
  private readyResolve: (() => void) | undefined;
  private readyReject: ((error: Error) => void) | undefined;
  private isReady = false;

  constructor(config: AppConfig, runtimeRoot: string, runtimePaths: RvcRuntimePaths) {
    this.config = config;
    this.clientPath = runtimeRoot;
    this.enginePath = runtimePaths.enginePath;
    this.voicesPath = runtimePaths.voicesPath;
    this.pythonPath = runtimePaths.pythonPath;
    this.workerPath = runtimePaths.workerPath;
  }

  async connect(): Promise<void> {
    if (process.platform !== 'win32') {
      throw new Error('Локальный RVC-клиент поддерживает только Windows.');
    }

    this.models = await this.scanModels();

    await fs.access(this.pythonPath);
    await fs.access(path.join(this.enginePath, 'rvc', 'infer', 'infer.py'));
    await fs.access(this.workerPath);

    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });

    this.worker = spawn(
      this.pythonPath,
      [this.workerPath, this.enginePath, path.join(this.clientPath, 'temp')],
      {
        cwd: this.enginePath,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PYTHONUTF8: '1',
          PYTHONIOENCODING: 'utf-8',
        },
      },
    );

    this.worker.stdout.setEncoding('utf8');
    this.worker.stdout.on('data', (chunk: string) => this.handleWorkerOutput(chunk));
    this.worker.stderr.setEncoding('utf8');
    this.worker.stderr.on('data', (chunk: string) => {
      for (const line of chunk.trimEnd().split(/\r?\n/)) {
        if (line) console.error(`[Локальный RVC] ${line}`);
      }
    });
    this.worker.on('error', (error) => this.failWorker(error));
    this.worker.on('close', (code, signal) => {
      this.failWorker(
        new Error(`Процесс локального RVC завершился (код ${code}, сигнал ${signal ?? 'нет'}).`),
      );
    });

    await this.readyPromise;
    if (this.models.length === 0 && this.rhvoiceVoices.length === 0) {
      throw new Error(
        `Не найдены голоса: добавьте RVC-модель в "${this.voicesPath}\\male" или "${this.voicesPath}\\female", либо установите голос RHVoice.`,
      );
    }
  }

  async close(): Promise<void> {
    const worker = this.worker;
    this.worker = undefined;
    if (!worker || worker.exitCode !== null) return;

    if (!this.isReady) {
      worker.kill();
      return;
    }

    const closed = new Promise<void>((resolve) => worker.once('close', () => resolve()));
    const timeout = setTimeout(() => {
      if (worker.exitCode === null) worker.kill();
    }, 5000);
    timeout.unref();
    worker.stdin.end(`${JSON.stringify({ action: 'shutdown' })}\n`);
    await closed;
    clearTimeout(timeout);
  }

  async getCleanModels(): Promise<RvcModel[]> {
    return this.models;
  }

  async refreshModels(): Promise<void> {
    this.models = await this.scanModels();
  }

  async getVoiceGroups(): Promise<VoiceGroups> {
    return {
      male: this.models.filter((model) => model.gender === 'male').map((model) => model.name),
      female: this.models.filter((model) => model.gender === 'female').map((model) => model.name),
      rhvoice: [...this.rhvoiceVoices],
    };
  }

  async generateRhvoiceSpeechToFile(text: string, voice: string, outputPath: string): Promise<void> {
    const rhvoice = this.rhvoiceVoices.find((item) => item.toLowerCase() === voice.toLowerCase());
    if (!rhvoice) {
      throw new Error(`Голос RHVoice "${voice}" не найден.`);
    }

    await this.readyPromise;
    const response = await this.sendRequest({
      action: 'synthesize',
      text,
      voice: rhvoice,
      outputPath,
      volume: this.config.AUDIO_VOLUME,
    });

    if (!response.ok) {
      throw new Error(response.error ?? 'Синтез RHVoice завершился неизвестной ошибкой.');
    }

    const output = await fs.stat(outputPath);
    if (!output.isFile() || output.size <= 44) {
      throw new Error(`RHVoice не создал валидный WAV-файл: ${outputPath}`);
    }
  }

  async generateSpeechToFile(text: string, modelName: string, outputPath: string): Promise<void> {
    const model = this.models.find((item) => item.name.toLowerCase() === modelName.toLowerCase());
    if (!model) {
      throw new Error(`Голосовая модель "${modelName}" не найдена в папках voices\\male и voices\\female.`);
    }

    await this.readyPromise;
    const response = await this.sendRequest({
      action: 'convert',
      text,
      ttsVoice: this.config.TTS_GENDERS[model.gender],
      modelPath: model.pthPath,
      indexPath: model.indexPath,
      outputPath,
      settings: this.config.RVC_SETTINGS,
      volume: this.config.AUDIO_VOLUME,
    });

    if (!response.ok) {
      throw new Error(response.error ?? 'Локальный синтез завершился неизвестной ошибкой.');
    }

    const output = await fs.stat(outputPath);
    if (!output.isFile() || output.size <= 44) {
      throw new Error(`Локальный синтез не создал валидный WAV-файл: ${outputPath}`);
    }
  }

  private async scanModels(): Promise<RvcModel[]> {
    const models: RvcModel[] = [];

    for (const gender of ['male', 'female'] as const) {
      const genderPath = path.join(this.voicesPath, gender);
      let folders;
      try {
        folders = await fs.readdir(genderPath, { withFileTypes: true });
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue;
        throw error;
      }

      for (const folder of folders) {
        if (!folder.isDirectory()) continue;

        const folderPath = path.join(genderPath, folder.name);
        const files = await fs.readdir(folderPath, { withFileTypes: true });
        const pthFiles = files
          .filter((file) => file.isFile() && /\.pth$/i.test(file.name))
          .filter((file) => !/^(G_|D_)/i.test(file.name))
          .map((file) => file.name)
          .sort((a, b) => a.localeCompare(b));
        if (pthFiles.length === 0) continue;
        if (pthFiles.length > 1) {
          throw new Error(`В папке "${folderPath}" найдено несколько .pth моделей: ${pthFiles.join(', ')}`);
        }

        const indexFile = files
          .filter((file) => file.isFile() && /\.index$/i.test(file.name))
          .filter((file) => !/trained/i.test(file.name))
          .map((file) => file.name)
          .sort((a, b) => {
            const aAdded = /^added_/i.test(a) ? 0 : 1;
            const bAdded = /^added_/i.test(b) ? 0 : 1;
            return aAdded - bAdded || a.localeCompare(b);
          })[0];

        models.push({
          name: folder.name,
          gender,
          pthPath: path.join(folderPath, pthFiles[0]),
          indexPath: indexFile ? path.join(folderPath, indexFile) : '',
        });
      }
    }

    return models.sort((a, b) => a.name.localeCompare(b.name));
  }

  private handleWorkerOutput(chunk: string): void {
    this.outputBuffer += chunk;
    const lines = this.outputBuffer.split(/\r?\n/);
    this.outputBuffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line) continue;

      try {
        const response = JSON.parse(line) as WorkerResponse;
        if (response.type === 'ready') {
          this.isReady = true;
          this.rhvoiceVoices = response.voices ?? [];
          console.log(
            `[TTS] RHVoice готов. Доступные голоса: ${this.rhvoiceVoices.join(', ') || 'не сообщены'}`,
          );
          this.readyResolve?.();
          this.readyResolve = undefined;
          this.readyReject = undefined;
          continue;
        }
        if (response.type === 'startup_error') {
          this.readyReject?.(new Error(response.error ?? 'Ошибка запуска локального движка.'));
          this.readyResolve = undefined;
          this.readyReject = undefined;
          continue;
        }
        if (!response.id) continue;

        const pending = this.pendingRequests.get(response.id);
        if (!pending) continue;

        this.pendingRequests.delete(response.id);
        pending.resolve(response);
      } catch (error) {
        console.error('[Локальный RVC] Получен некорректный ответ Python:', error);
      }
    }
  }

  private sendRequest(payload: Record<string, unknown>): Promise<WorkerResponse> {
    if (!this.worker || !this.worker.stdin.writable) {
      return Promise.reject(new Error('Процесс локального RVC не запущен.'));
    }

    const id = String(++this.requestId);
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.worker!.stdin.write(`${JSON.stringify({ ...payload, id })}\n`, (error) => {
        if (!error) return;
        this.pendingRequests.delete(id);
        reject(error);
      });
    });
  }

  private failWorker(error: Error): void {
    this.readyReject?.(error);
    this.readyResolve = undefined;
    this.readyReject = undefined;

    for (const pending of this.pendingRequests.values()) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }
}
