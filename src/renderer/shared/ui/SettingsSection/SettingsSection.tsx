import type { PropsWithChildren } from 'react';
import styles from './SettingsSection.module.scss';

interface SettingsSectionProps extends PropsWithChildren {
  title: string;
  description: string;
}

export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      {children}
    </section>
  );
}
