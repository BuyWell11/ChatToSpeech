import { useState } from 'react';
import type { DesktopState } from '../../../electron/shared/contract';
import { DashboardPage } from '../../pages/dashboard/ui/DashboardPage';
import { FirstRunPage } from '../../pages/first-run/ui/FirstRunPage';
import { SettingsPage } from '../../pages/settings/ui/SettingsPage';
import { Navigation } from '../../widgets/navigation/ui/Navigation';
import { useDesktopState } from '../../shared/lib/useDesktopState';
import styles from './App.module.scss';

type Page = 'dashboard' | 'settings';

export function App() {
  const { state, setState, error, setError, busy, run } = useDesktopState();
  const [page, setPage] = useState<Page>('dashboard');

  const applyState = (nextState: DesktopState | undefined) => {
    if (nextState) setState(nextState);
  };

  if (!state) {
    return (
      <main className={styles.loading}>
        <span className={styles.spinner} />
        <p>Загружаю настройки приложения…</p>
        {error && <p className={styles.error}>{error}</p>}
      </main>
    );
  }

  if (!state.setupComplete) {
    return (
      <FirstRunPage
        busy={busy}
        error={error}
        channel={state.config.TWITCH_CHANNELS[0]?.replace(/^#/, '') ?? ''}
        twitchUsername={state.config.TWITCH_USERNAME ?? ''}
        tokenConfigured={state.tokenConfigured}
        engineStatus={state.engineStatus}
        statusMessage={state.statusMessage}
        onSetupRuntime={() => run(async () => applyState(await window.desktop.setupRuntime()))}
        onSave={(input) => run(async () => applyState(await window.desktop.saveSetup(input)))}
      />
    );
  }

  return (
    <div className={styles.shell}>
      <Navigation current={page} onChange={setPage} />
      <main className={styles.content}>
        {page === 'dashboard' ? (
          <DashboardPage
            state={state}
            busy={busy}
            error={error}
            onConnect={() => run(async () => applyState(await window.desktop.connectTwitch()))}
            onDisconnect={() => run(async () => applyState(await window.desktop.disconnectTwitch()))}
            onCheckEngine={() => run(async () => applyState(await window.desktop.checkEngine()))}
            onSetupRuntime={() => run(async () => applyState(await window.desktop.setupRuntime()))}
            onOpenVoices={() => run(async () => window.desktop.openVoicesFolder())}
            onRefreshVoices={() => run(async () => applyState(await window.desktop.refreshVoices()))}
            onSetUserVoice={(username, voice) =>
              run(async () => applyState(await window.desktop.setUserVoice({ username, voice })))
            }
          />
        ) : (
          <SettingsPage
            state={state}
            busy={busy}
            error={error}
            onSave={(settings) =>
              run(async () => applyState(await window.desktop.updateSettings(settings)))
            }
            onError={setError}
          />
        )}
      </main>
    </div>
  );
}
