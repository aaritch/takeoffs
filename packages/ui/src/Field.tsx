import type { ReactNode } from 'react';
import { cn } from './cn';

export interface FieldProps {
  label: ReactNode;
  /** id of the control this label points at (set the same id on the child Input/Select). */
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Form field wrapper: a label over a control, with an optional hint and an error message. The
 * error takes precedence over the hint and is announced (role="alert"). Wire accessibility by
 * passing the same `htmlFor`/`id` on the field and its control.
 */
export function Field({ label, htmlFor, hint, error, required, className, children }: FieldProps) {
  return (
    <div className={cn('tk-field', error != null && 'tk-field--invalid', className)}>
      <label className="tk-field__label" htmlFor={htmlFor}>
        {label}
        {required ? (
          <span aria-hidden="true" className="tk-field__required">
            {' *'}
          </span>
        ) : null}
      </label>
      {children}
      {error != null ? (
        <p className="tk-field__error" role="alert">
          {error}
        </p>
      ) : hint != null ? (
        <p className="tk-field__hint">{hint}</p>
      ) : null}
    </div>
  );
}
