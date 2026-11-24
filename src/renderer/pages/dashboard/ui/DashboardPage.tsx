import { useEffect, useRef, useState } from 'react';
import type { DesktopState } from '../../../../electron/shared/contract';
import type { SpeechMode } from '../../../../electron/shared/contract';
import { EnginePanel } from '../../../features/engine/ui/EnginePanel';
import { UserVoiceTable } from '../../../features/user-voices/ui/UserVoiceTable';
import { Notice } from '../../../shared/ui/Notice/Notice';
import { PageHeader } from '../../../shared/ui/PageHeader/PageHeader';
import styles from './DashboardPage.module.scss';

interface DashboardPageProps {
  state: DesktopState;
  busy: boolean;
  error: string;
  onConnect: () => void;
  onDisconnect: () => void;
  onCheckEngine: () => void;
  onSetupRuntime: (mode: SpeechMode) => void;
  onOpenVoices: () => void;
  onRefreshVoices: () => void;
  onSetUserVoice: (username: string, voice: string) => void;
  onSaveVolume: (volume: number) => void;
}

export function DashboardPage(props: DashboardPageProps) {
  const { state, busy, error } = props;
  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="ПАНЕЛЬ УПРАВЛЕНИЯ"
        title="Главная"
        description="Подключение к чату и голоса пользователей."
      />
      {error && <Notice tone="error">{error}</Notice>}
      <EnginePanel
        state={state}
        busy={busy}
        onCheck={props.onCheckEngine}
        onConnect={props.onConnect}
        onDisconnect={props.onDisconnect}
        onSetupRuntime={props.onSetupRuntime}
      />
      <VolumeControl
        volume={state.config.AUDIO_VOLUME}
        disabled={busy}
        onSave={props.onSaveVolume}
      />
      <UserVoiceTable
        state={state}
        busy={busy}
        onSetVoice={props.onSetUserVoice}
        onOpenVoices={props.onOpenVoices}
        onRefreshVoices={props.onRefreshVoices}
      />
    </div>
  );
}

function VolumeControl({
  volume,
  disabled,
  onSave,
}: {
  volume: number;
  disabled: boolean;
  onSave: (value: number) => void;
}) {
  const [draft, setDraft] = useState(volume);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingValue = useRef<number | undefined>(undefined);
  const saveRef = useRef(onSave);

  useEffect(() => setDraft(volume), [volume]);
  useEffect(() => {
    saveRef.current = onSave;
  }, [onSave]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (pendingValue.current !== undefined) saveRef.current(pendingValue.current);
  }, []);

  const changeVolume = (value: number) => {
    setDraft(value);
    pendingValue.current = value;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      pendingValue.current = undefined;
      onSave(value);
    }, 400);
  };

  return (
    <section className={styles.volume}>
      <label>
        <span><strong>Громкость озвучки</strong><output>{Math.round(draft * 100)}%</output></span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={draft}
          disabled={disabled}
          onChange={(event) => changeVolume(Number(event.target.value))}
        />
      </label>
      <small>Громкость сохраняется после завершения настройки ползунка.</small>
    </section>
  );
}
