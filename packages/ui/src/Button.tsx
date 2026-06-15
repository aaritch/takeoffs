import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/**
 * Presentational button. No client-only logic, so it works in both server and client
 * components; consumers in client components attach onClick etc. Defaults to type="button" to
 * avoid accidental form submits.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn('tk-button', `tk-button--${variant}`, `tk-button--${size}`, className)}
      {...rest}
    />
  );
}
