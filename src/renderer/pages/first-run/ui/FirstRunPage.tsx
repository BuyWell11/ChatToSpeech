import { useState } from 'react';
import type { DesktopEngineStatus, SetupInput } from '../../../../electron/shared/contract';
import { Button } from '../../../shared/ui/Button/Button';
import styles from './FirstRunPage.module.scss';

interface FirstRunPageProps {
  busy: boolean;
  error: string;
  channel: string;
  twitchUsername: string;
  tokenConfigured: boolean;
  engineStatus: DesktopEngineStatus;
  statusMessage?: string;
  onSetupRuntime: () => void;
  onSave: (input: SetupInput) => void;
}

export function FirstRunPage({
  busy,
  error,
  channel: initialChannel,
  twitchUsername: initialUsername,
  tokenConfigured,
  engineStatus,
  statusMessage,
  onSetupRuntime,
  onSave,
}: FirstRunPageProps) {
  const [channel, setChannel] = useState(initialChannel);
  const [twitchUsername, setTwitchUsername] = useState(initialUsername);
  const [oauthToken, setOauthToken] = useState('');

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave({ channel, twitchUsername, oauthToken });
  };

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.icon}>Г</div>
        <p className={styles.eyebrow}>ПЕРВЫЙ ЗАПУСК</p>
        <h1>Подключим ваш Twitch</h1>
        <p className={styles.description}>
          Укажите канал, который нужно слушать, и данные аккаунта бота для подключения к чату.
        </p>
        <p className={styles.privacy}>
          Локальный движок: {engineStatus === 'installing' ? 'идёт автоматическая загрузка и настройка' : engineStatus === 'ready' ? 'готов' : engineStatus === 'error' ? 'ошибка установки' : 'будет установлен автоматически'}.
          Первая установка требует интернета и нескольких гигабайт свободного места.
          {statusMessage && ` ${statusMessage}`}
        </p>
        {engineStatus === 'error' && (
          <div className={styles.error}>
            Не удалось подготовить локальный движок.
            <Button disabled={busy} onClick={onSetupRuntime} size="small" tone="text">
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
