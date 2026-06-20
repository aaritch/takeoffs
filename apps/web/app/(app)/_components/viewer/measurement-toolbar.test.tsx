// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ConditionView } from '@takeoff/contracts';
import { MeasurementToolbar } from './measurement-toolbar';

afterEach(cleanup);

const conditions: ConditionView[] = [
  { id: 'c1', name: 'Curb', measurementType: 'LINEAR', unit: 'LF', colorHex: null },
];

function renderToolbar(overrides: Partial<Parameters<typeof MeasurementToolbar>[0]> = {}) {
  const props = {
    tool: 'SELECT' as const,
    onToolChange: vi.fn(),
    conditions,
    activeConditionId: 'c1',
    onActiveConditionChange: vi.fn(),
    onNewCondition: vi.fn(),
    onCalibrate: vi.fn(),
    calibrating: false,
    scaleConfirmed: false,
    readout: null,
    canUndo: false,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    canDelete: false,
    onDelete: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<MeasurementToolbar {...props} />) };
}

describe('MeasurementToolbar', () => {
  it('switches tools through the callback', () => {
    const { props } = renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'Area' }));
    expect(props.onToolChange).toHaveBeenCalledWith('AREA');
  });

  it('flags a missing scale and triggers calibration', () => {
    const { props } = renderToolbar();
    expect(screen.getByText('no scale')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Set scale' }));
    expect(props.onCalibrate).toHaveBeenCalled();
  });

  it('creates a condition with the unit defaulted by type', () => {
    const { props } = renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    fireEvent.change(screen.getByLabelText('New condition name'), {
      target: { value: 'Sidewalk' },
    });
    fireEvent.change(screen.getByLabelText('Measurement type'), { target: { value: 'AREA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(props.onNewCondition).toHaveBeenCalledWith({
      name: 'Sidewalk',
      measurementType: 'AREA',
      unit: 'SF',
    });
  });

  it('renders the live readout when drawing', () => {
    renderToolbar({ readout: { kind: 'length', geometric: 200, real: 25 } });
    expect(screen.getByText('25.0 ft')).toBeTruthy();
  });

  it('disables undo/redo/delete until each is available, then fires their callbacks', () => {
    const { props, rerender } = renderToolbar();
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    rerender(<MeasurementToolbar {...props} canUndo canRedo canDelete />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(props.onUndo).toHaveBeenCalled();
    expect(props.onRedo).toHaveBeenCalled();
    expect(props.onDelete).toHaveBeenCalled();
  });
});
