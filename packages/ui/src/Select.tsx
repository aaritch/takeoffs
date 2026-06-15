import type { SelectHTMLAttributes } from 'react';
import { cn } from './cn';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

/** Native select; pass `<option>`s as children. */
export function Select({ invalid, className, children, ...rest }: SelectProps) {
  return (
    <select className={cn('tk-select', className)} aria-invalid={invalid || undefined} {...rest}>
      {children}
    </select>
  );
}
