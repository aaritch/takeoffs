import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

// Omit the native string `title` attribute so we can accept rich title content.
export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
}

/** A bordered content container with an optional title. */
export function Card({ title, className, children, ...rest }: CardProps) {
  return (
    <div className={cn('tk-card', className)} {...rest}>
      {title != null ? <div className="tk-card__title">{title}</div> : null}
      {children}
    </div>
  );
}
