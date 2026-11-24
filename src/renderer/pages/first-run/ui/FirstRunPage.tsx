import { useState } from 'react';
import type {
  DesktopEngineStatus,
  RuntimeProgress,
  SetupInput,
  SpeechMode,
} from '../../../../electron/shared/contract';
import { Button } from '../../../shared/ui/Button/Button';
import styles from './FirstRunPage.module.scss';

interface FirstRunPageProps {
  busy: boolean;
  error: string;
  channel: string;
  twitchUsername: string;
  tokenConfigured: boolean;
  engineStatus: DesktopEngineStatus;
  runtimeProgress?: RuntimeProgress;
  speechMode: SpeechMode;
  statusMessage?: string;
  onSetupRuntime: (mode: SpeechMode) => void;
  onSave: (input: SetupInput) => void;
}

export function FirstRunPage({
  busy,
  error,
  channel: initialChannel,
  twitchUsername: initialUsername,
  tokenConfigured,
  engineStatus,
  runtimeProgress,
  speechMode: selectedMode,
  statusMessage,
  onSetupRuntime,
  onSave,
}: FirstRunPageProps) {
  const [channel, setChannel] = useState(initialChannel);
  const [twitchUsername, setTwitchUsername] = useState(initialUsername);
  const [oauthToken, setOauthToken] = useState('');
  const [speechMode, setSpeechMode] = useState<SpeechMode>(selectedMode);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave({ channel, twitchUsername, oauthToken });
  };

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.icon}>C</div>
        <p className={styles.eyebrow}>ПЕРВЫЙ ЗАПУСК</p>
        <h1>Подключим ваш Twitch</h1>
        <p className={styles.description}>
          Укажите канал, который нужно слушать, и данные аккаунта бота для подключения к чату.
        </p>
        <section className={styles.runtime}>
          <h2>Выберите движок озвучки</h2>
          <label>
            <input
              type="radio"
              name="speechMode"
              checked={speechMode === 'rhvoice'}
              disabled={busy}
              onChange={() => setSpeechMode('rhvoice')}
            />
            <span><strong>Только RHVoice</strong><small>Меньше загрузка, работает без RVC и CUDA.</small></span>
          </label>
          <label>
            <input
              type="radio"
              name="speechMode"
              checked={speechMode === 'rvc'}
              disabled={busy}
              onChange={() => setSpeechMode('rvc')}
            />
            <span><strong>RHVoice + RVC</strong><small>Нейроголоса, несколько гигабайт и NVIDIA GPU.</small></span>
          </label>
          <Button
            disabled={
              busy ||
              engineStatus === 'installing' ||
              (engineStatus === 'ready' && speechMode === selectedMode)
            }
            onClick={() => onSetupRuntime(speechMode)}
            tone="primary"
          >
            {engineStatus === 'ready'
              ? speechMode === selectedMode ? 'Движок готов' : 'Переключить движок'
              : engineStatus === 'installing' ? 'Установка…' : 'Установить выбранный движок'}
          </Button>
          {runtimeProgress && (
            <div className={styles.progress}>
              <span>{runtimeProgress.phase}{runtimeProgress.percent !== null ? ` · ${runtimeProgress.percent}%` : ''}</span>
              <progress max={100} {...(runtimeProgress.percent === null ? {} : { value: runtimeProgress.percent })} />
            </div>
          )}
        </section>
        <p className={styles.privacy}>
          Первичная установка требует интернета. RHVoice-only не загружает RVC-модели и CUDA.
          {statusMessage && ` ${statusMessage}`}
        </p>
        {engineStatus === 'error' && (
          <div className={styles.error}>
            Не удалось подготовить локальный движок.
            <Button disabled={busy} onClick={() => onSetupRuntime(speechMode)} size="small" tone="text">
              Повторить установку
            </Button>
          </div>
        )}
        <form className={styles.form} onSubmit={submit}>
          <label>
            Twitch-канал
            <span className={styles.inputWrap}>
              <span>#</span>
              <input
                autoFocus
                autoComplete="off"
                placeholder="название_канала"
                value={channel}
                onChange={(event) => setChannel(event.target.value)}
                required
              />
            </span>
          </label>
          <label>
            Twitch username бота
            <input
              autoComplete="username"
              placeholder="имя_аккаунта"
              value={twitchUsername}
              onChange={(event) => setTwitchUsername(event.target.value)}
              required
            />
          </label>
          <label>
            OAuth-токен бота
            <input
              type="password"
              autoComplete="new-password"
              placeholder={tokenConfigured ? 'Оставьте пустым, чтобы сохранить прежний токен' : 'oauth:...'}
              value={oauthToken}
              onChange={(event) => setOauthToken(event.target.value)}
              required={!tokenConfigured}
            />
          </label>
          <p className={styles.privacy}>
            Токен хранится отдельно от настроек и шифруется средствами Windows. Интерфейс не может его прочитать.
            {tokenConfigured && ' Сохранённый токен можно оставить без изменений.'}
          </p>
          {error && <div className={styles.error}>{error}</div>}
          <Button className={styles.submit} disabled={busy} size="large" tone="primary" type="submit">
            {busy ? 'Сохраняю…' : 'Сохранить и продолжить'}
          </Button>
        </form>
        <p className={styles.note}>
          Позже на главном экране можно проверить RHVoice/RVC, запустить подключение и настроить громкость.
        </p>
      </section>
    </main>
  );
}
