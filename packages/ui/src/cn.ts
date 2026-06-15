/** Join class names, dropping falsy values. The tiny classnames helper used by every component. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
