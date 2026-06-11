import { describe, it, expect } from 'vitest';
import { timeLeftLabel } from './dates';

const NOW = Date.parse('2026-06-11T17:00:00Z');
const at = (iso: string) => timeLeftLabel(iso, NOW);

describe('tiempo restante para el cierre', () => {
  it('menos de una hora se expresa en minutos', () => {
    expect(at('2026-06-11T17:47:00Z')).toBe('47 min');
    expect(at('2026-06-11T17:01:00Z')).toBe('1 min');
  });

  it('una hora o más se expresa en horas y minutos', () => {
    expect(at('2026-06-11T18:00:00Z')).toBe('1 h 00 m');
    expect(at('2026-06-11T18:23:00Z')).toBe('1 h 23 m');
    expect(at('2026-06-11T22:05:00Z')).toBe('5 h 05 m');
  });

  it('en el kickoff o después ya está cerrado', () => {
    expect(at('2026-06-11T17:00:00Z')).toBe('cerrado');
    expect(at('2026-06-11T16:00:00Z')).toBe('cerrado');
  });
});
