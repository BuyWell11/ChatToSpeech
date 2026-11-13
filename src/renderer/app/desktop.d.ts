import type { DesktopApi } from '../../electron/shared/contract';

declare global {
  interface Window {
    desktop: DesktopApi;
  }
}

export {};
