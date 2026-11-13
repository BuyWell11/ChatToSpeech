import { useCallback, useEffect, useState } from 'react';
import type { DesktopState } from '../../../electron/shared/contract';

export function useDesktopState() {
  const [state, setState] = useState<DesktopState>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void window.desktop
      .getState()
      .then((nextState) => {
        if (active) setState(nextState);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      });
    const unsubscribe = window.desktop.onStateChanged((nextState) => setState(nextState));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError('');
    try {
      return await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, setState, error, setError, busy, run };
}
