import type { DesktopEngineStatus, DesktopState, DesktopTwitchStatus } from '../../../../electron/shared/contract';
import { Button } from '../../../shared/ui/Button/Button';
import styles from './EnginePanel.module.scss';

interface EnginePanelProps {
  state: DesktopState;
  busy: boolean;
  onCheck: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onSetupRuntime: () => void;
}

const engineLabels: Record<DesktopEngineStatus, string> = {
  'not-checked': 'Не проверен',
  checking: 'Проверка…',
  ready: 'Готов',
  installing: 'Установка…',
  error: 'Ошибка',
};

const twitchLabels: Record<DesktopTwitchStatus, string> = {
  offline: 'Не подключён',
  connecting: 'Подключение…',
  connected: 'Подключён',
  error: 'Ошибка',
};

export function EnginePanel({
  state,
  busy,
  onCheck,
  onConnect,
  onDisconnect,
  onSetupRuntime,
}: EnginePanelProps) {
  const voicesCount = state.voices.male.length + state.voices.female.length + state.voices.rhvoice.length;

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>СОСТОЯНИЕ СИСТЕМЫ</p>
          <h2>Подключение и озвучка</h2>
        </div>
        <span className={`${styles.dot} ${styles[state.twitchStatus]}`} />
      </header>
      <div className={styles.statuses}>
        <div>
          <span>Локальный движок</span>
          <strong className={state.engineStatus === 'ready' ? styles.good : ''}>
            {engineLabels[state.engineStatus]}
          </strong>
        </div>
        <div>
          <span>Twitch-чат</span>
          <strong className={state.twitchStatus === 'connected' ? styles.good : ''}>
            {twitchLabels[state.twitchStatus]}
          </strong>
        </div>
        <div>
          <span>Канал</span>
          <strong>{state.config.TWITCH_CHANNELS[0] || 'Не задан'}</strong>
        </div>
        <div>
          <span>Доступно голосов</span>
          <strong>{voicesCount || 'Не загружены'}</strong>
        </div>
      </div>

      {state.statusMessage && <p className={styles.message}>{state.statusMessage}</p>}

      <div className={styles.actions}>
        {state.twitchStatus === 'connected' ? (
          <Button disabled={busy} onClick={onDisconnect}>
            Отключить
          </Button>
        ) : (
          <Button disabled={busy || state.engineStatus !== 'ready'} onClick={onConnect} tone="primary">
            {state.twitchStatus === 'connecting' ? 'Подключаю…' : 'Подключить Twitch'}
          </Button>
        )}
        {state.engineStatus !== 'ready' && (
          <Button disabled={busy || state.engineStatus === 'installing'} onClick={onCheck}>
            Проверить движок
          </Button>
        )}
        {state.engineStatus === 'error' && (
          <Button disabled={busy} onClick={onSetupRuntime} tone="text">
            Установить / восстановить среду
          </Button>
        )}
      </div>
      {state.engineStatus === 'installing' && (
        <p className={styles.hint}>
          Компоненты занимают много места; загрузка CUDA/Python может занять время. Пользовательские голосовые модели
          не включаются в установщик.
        </p>
      )}
    </section>
  );
}
