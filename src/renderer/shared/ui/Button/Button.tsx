import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.scss';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: 'primary' | 'secondary' | 'text';
  size?: 'small' | 'medium' | 'large';
}

export function Button({
  tone = 'secondary',
  size = 'medium',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={`${styles.button} ${styles[tone]} ${styles[size]} ${className}`.trim()}
    />
  );
}
