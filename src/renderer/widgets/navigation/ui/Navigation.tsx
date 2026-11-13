import styles from './Navigation.module.scss';

type Page = 'dashboard' | 'settings';

interface NavigationProps {
  current: Page;
  onChange: (page: Page) => void;
}

export function Navigation({ current, onChange }: NavigationProps) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <span className={styles.logo}>Г</span>
        <div>
          <strong>Говорилка</strong>
          <small>Twitch voice client</small>
        </div>
      </div>
      <nav className={styles.links} aria-label="Основная навигация">
        <button className={current === 'dashboard' ? styles.active : ''} onClick={() => onChange('dashboard')}>
          <span>⌂</span> Обзор
        </button>
        <button className={current === 'settings' ? styles.active : ''} onClick={() => onChange('settings')}>
          <span>⚙</span> Настройки
        </button>
      </nav>
      <div className={styles.footer}>Локальная озвучка Twitch</div>
    </aside>
  );
}
