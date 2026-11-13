import type { DesktopState } from '../../../../electron/shared/contract';
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
  onSetupRuntime: () => void;
  onOpenVoices: () => void;
  onRefreshVoices: () => void;
  onSetUserVoice: (username: string, voice: string) => void;
}

export function DashboardPage(props: DashboardPageProps) {
  const { state, busy, error } = props;
  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="ПАНЕЛЬ УПРАВЛЕНИЯ"
        title="Обзор"
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
