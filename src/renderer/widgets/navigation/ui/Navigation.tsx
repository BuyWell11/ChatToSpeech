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
        <span className={styles.logo}>C</span>
        <div>
          <strong>ChatToSpeech</strong>
          <small>Twitch chat voice</small>
        </div>
      </div>
      <nav className={styles.links} aria-label="Основная навигация">
        <button className={current === 'dashboard' ? styles.active : ''} onClick={() => onChange('dashboard')}>
          <span>⌂</span> Главная
        </button>
        <button className={current === 'settings' ? styles.active : ''} onClick={() => onChange('settings')}>
          <span>⚙</span> Настройки
        </button>
      </nav>
      <footer className={styles.footer}>
        <span>Локальная озвучка Twitch</span>
        <a href="https://t.me/buywell" target="_blank" rel="noreferrer">Разработано BuyWell</a>
      </footer>
    </aside>
  );
}
