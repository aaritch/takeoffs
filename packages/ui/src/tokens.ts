/**
 * Design tokens — the programmatic source of truth for the design system. Mirrored as CSS
 * custom properties in `styles.css` (kept in sync by hand for now; a generator can replace this
 * later). Components reference the CSS variables via class names; layout primitives read these
 * values directly.
 */
export const tokens = {
  color: {
    fg: '#1a1a1a',
    muted: '#6b7280',
    bg: '#ffffff',
    primary: '#2563eb',
    primaryFg: '#ffffff',
    border: '#e5e7eb',
    danger: '#dc2626',
  },
  space: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
  },
  radius: {
    sm: '0.25rem',
    md: '0.5rem',
    lg: '0.75rem',
  },
  fontSize: {
    sm: '0.875rem',
    base: '1rem',
    lg: '1.25rem',
    xl: '2rem',
  },
} as const;

export type SpaceToken = keyof typeof tokens.space;
