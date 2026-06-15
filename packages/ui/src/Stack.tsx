import type { CSSProperties, HTMLAttributes } from 'react';
import { cn } from './cn';
import { tokens, type SpaceToken } from './tokens';

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  direction?: 'row' | 'column';
  gap?: SpaceToken;
  align?: CSSProperties['alignItems'];
}

/** Flexbox layout primitive: a row or column with a token-sized gap. */
export function Stack({
  direction = 'column',
  gap = 'md',
  align,
  className,
  style,
  ...rest
}: StackProps) {
  const layout: CSSProperties = {
    display: 'flex',
    flexDirection: direction,
    gap: tokens.space[gap],
    ...(align ? { alignItems: align } : {}),
    ...style,
  };
  return <div className={cn('tk-stack', className)} style={layout} {...rest} />;
}
