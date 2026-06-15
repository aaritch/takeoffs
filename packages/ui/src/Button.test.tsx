import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Button } from './Button';

afterEach(cleanup);

describe('Button', () => {
  it('applies variant and size classes and defaults type="button"', () => {
    render(
      <Button variant="secondary" size="sm">
        Save
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn.className).toContain('tk-button');
    expect(btn.className).toContain('tk-button--secondary');
    expect(btn.className).toContain('tk-button--sm');
    expect(btn.getAttribute('type')).toBe('button');
  });

  it('fires onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
