import { describe, it, expect } from 'vitest';
import { tokens } from './tokens';

describe('tokens', () => {
  it('exposes color, space, radius, and fontSize scales', () => {
    expect(tokens.color.primary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(tokens.space.md).toBe('1rem');
    expect(Object.keys(tokens.space)).toEqual(['xs', 'sm', 'md', 'lg', 'xl']);
    expect(tokens.radius.md).toBe('0.5rem');
  });
});
