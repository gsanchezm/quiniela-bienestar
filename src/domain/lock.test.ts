import { describe, it, expect } from 'vitest';
import { isLocked } from './lock';

const ko = new Date('2026-06-11T19:00:00Z');

describe('cierre al silbatazo', () => {
  it('está abierto un segundo antes del kickoff', () => {
    expect(isLocked(ko, new Date('2026-06-11T18:59:59Z'))).toBe(false);
  });

  it('se bloquea exactamente al kickoff', () => {
    expect(isLocked(ko, new Date('2026-06-11T19:00:00Z'))).toBe(true);
  });

  it('sigue bloqueado después del kickoff', () => {
    expect(isLocked(ko, new Date('2026-06-12T00:00:00Z'))).toBe(true);
  });
});
