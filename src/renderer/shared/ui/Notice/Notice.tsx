import type { HTMLAttributes } from 'react';
import styles from './Notice.module.scss';

interface NoticeProps extends HTMLAttributes<HTMLDivElement> {
  tone?: 'error' | 'info';
}

export function Notice({ tone = 'info', className = '', ...props }: NoticeProps) {
  return <div {...props} className={`${styles.notice} ${styles[tone]} ${className}`.trim()} />;
}
