import type { InputHTMLAttributes } from 'react';
import { cn } from './cn';

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/** A checkbox input. */
export function Checkbox({ className, ...rest }: CheckboxProps) {
  return <input type="checkbox" className={cn('tk-checkbox', className)} {...rest} />;
}
