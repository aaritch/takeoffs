import type { InputHTMLAttributes } from 'react';
import { cn } from './cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

/** Text input. Pass `invalid` to surface an error state (sets aria-invalid + styling). */
export function Input({ invalid, type = 'text', className, ...rest }: InputProps) {
  return (
    <input
      type={type}
      className={cn('tk-input', className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}
