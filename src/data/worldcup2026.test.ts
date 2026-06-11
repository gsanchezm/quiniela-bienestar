import { describe, it, expect } from 'vitest';
import { TEAMS, MATCHES, STAGES, KICKOFF } from './worldcup2026';

describe('dataset Mundial 2026', () => {
  it('tiene 48 selecciones en 12 grupos de 4', () => {
    expect(Object.keys(TEAMS)).toHaveLength(48);
    const porGrupo = new Map<string, number>();
    Object.values(TEAMS).forEach((t) => porGrupo.set(t.group, (porGrupo.get(t.group) ?? 0) + 1));
    expect([...porGrupo.keys()].sort().join('')).toBe('ABCDEFGHIJKL');
    [...porGrupo.values()].forEach((n) => expect(n).toBe(4));
  });

  it('tiene 104 partidos: 72 de grupos y 32 de eliminatoria', () => {
    expect(MATCHES).toHaveLength(104);
    expect(MATCHES.filter((m) => !m.isKnockout)).toHaveLength(72);
    expect(MATCHES.filter((m) => m.isKnockout)).toHaveLength(32);
  });

  it('numera 1..104 sin huecos y con kickoff UTC válido', () => {
    expect(MATCHES.map((m) => m.id)).toEqual(Array.from({ length: 104 }, (_, i) => i + 1));
    MATCHES.forEach((m) => expect(Number.isNaN(Date.parse(m.kickoffUtc))).toBe(false));
  });

  it('arranca con México-Sudáfrica el 11 de junio a las 19:00 UTC', () => {
    expect(KICKOFF).toBe('2026-06-11T19:00:00Z');
    const inaugural = MATCHES[0];
    expect(inaugural.homeCode).toBe('MEX');
    expect(inaugural.awayCode).toBe('RSA');
    expect(inaugural.kickoffUtc).toBe(KICKOFF);
  });

  it('cada selección juega exactamente 3 partidos de grupos contra rivales de su grupo', () => {
    const cuenta = new Map<string, number>();
    MATCHES.filter((m) => !m.isKnockout).forEach((m) => {
      expect(TEAMS[m.homeCode!].group).toBe(TEAMS[m.awayCode!].group);
      expect(m.group).toBe(TEAMS[m.homeCode!].group);
      cuenta.set(m.homeCode!, (cuenta.get(m.homeCode!) ?? 0) + 1);
      cuenta.set(m.awayCode!, (cuenta.get(m.awayCode!) ?? 0) + 1);
    });
    Object.keys(TEAMS).forEach((c) => expect(cuenta.get(c)).toBe(3));
  });

  it('los partidos de eliminatoria no tienen equipos asignados y sí tienen etiqueta de llave', () => {
    MATCHES.filter((m) => m.isKnockout).forEach((m) => {
      expect(m.homeCode).toBeNull();
      expect(m.awayCode).toBeNull();
      expect(m.group).toBeNull();
      expect(m.tag).toBeTruthy();
    });
  });

  it('las etapas cubren J1 J2 J3 R32 R16 QF SF FIN con los conteos correctos', () => {
    expect(STAGES.map((s) => s.id)).toEqual(['J1', 'J2', 'J3', 'R32', 'R16', 'QF', 'SF', 'FIN']);
    const porEtapa = (id: string) => MATCHES.filter((m) => m.stage === id).length;
    expect(porEtapa('J1')).toBe(24);
    expect(porEtapa('J2')).toBe(24);
    expect(porEtapa('J3')).toBe(24);
    expect(porEtapa('R32')).toBe(16);
    expect(porEtapa('R16')).toBe(8);
    expect(porEtapa('QF')).toBe(4);
    expect(porEtapa('SF')).toBe(2);
    expect(porEtapa('FIN')).toBe(2);
  });
});
