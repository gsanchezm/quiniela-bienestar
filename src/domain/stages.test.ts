import { describe, it, expect } from 'vitest';
import { MATCHES } from '@/data/worldcup2026';
import { currentStage } from './stages';

const at = (iso: string) => new Date(iso).getTime();

describe('currentStage — fase actual por defecto', () => {
  it('antes de que arranque el torneo cae en J1', () => {
    expect(currentStage(MATCHES, at('2026-06-01T00:00:00Z'))).toBe('J1');
  });

  it('a media Jornada 2 (con partidos J2 por jugar) cae en J2', () => {
    expect(currentStage(MATCHES, at('2026-06-22T12:00:00Z'))).toBe('J2');
  });

  it('en el hueco entre la última J1 y la primera J2 cae en J2', () => {
    // id 24 (J1) cierra 18-jun 02:00Z; id 25 (J2) abre 18-jun 16:00Z
    expect(currentStage(MATCHES, at('2026-06-18T10:00:00Z'))).toBe('J2');
  });

  it('cuando el próximo por jugar es eliminatoria cae en R32', () => {
    // id 72 (J3) cierra 27-jun 23:30Z; id 73 (R32) abre 28-jun 17:00Z
    expect(currentStage(MATCHES, at('2026-06-28T00:00:00Z'))).toBe('R32');
  });

  it('con el torneo terminado cae en la última fase (FIN)', () => {
    expect(currentStage(MATCHES, at('2026-08-01T00:00:00Z'))).toBe('FIN');
  });

  it('con lista vacía cae en J1 (fallback defensivo)', () => {
    expect(currentStage([], at('2026-06-22T12:00:00Z'))).toBe('J1');
  });
});
