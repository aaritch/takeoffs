import type { TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

/** Multi-line text input. */
export function Textarea({ invalid, className, ...rest }: TextareaProps) {
  return (
    <textarea
      className={cn('tk-textarea', className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}
