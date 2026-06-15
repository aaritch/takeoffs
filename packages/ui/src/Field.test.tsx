import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Field } from './Field';
import { Input } from './Input';

afterEach(cleanup);

describe('Field', () => {
  it('labels its control and shows the hint when there is no error', () => {
    render(
      <Field label="Name" htmlFor="name" required hint="Your full name">
        <Input id="name" />
      </Field>,
    );
    // Label resolves to the input (accessible name includes the required marker).
    const input = screen.getByLabelText(/Name/);
    expect(input.tagName).toBe('INPUT');
    expect(screen.getByText('Your full name')).toBeTruthy();
  });

  it('shows the error (role=alert) and hides the hint when invalid', () => {
    render(
      <Field label="Email" htmlFor="email" hint="we never share it" error="Required">
        <Input id="email" invalid />
      </Field>,
    );
    expect(screen.getByRole('alert').textContent).toBe('Required');
    expect(screen.queryByText('we never share it')).toBeNull();
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true');
  });
});
