import { describe, it, expect } from 'vitest';
import { hashToken, newToken, safeEqual } from './crypto';

describe('utilidades criptográficas', () => {
  it('los tokens son de 256 bits en hex y no se repiten', () => {
    const a = newToken();
    const b = newToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it('el hash de token es determinista y distinto del token', () => {
    const t = newToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toBe(t);
  });

  it('safeEqual compara en tiempo constante sin tronar con largos distintos', () => {
    expect(safeEqual('Bearer abc', 'Bearer abc')).toBe(true);
    expect(safeEqual('Bearer abc', 'Bearer abd')).toBe(false);
    expect(safeEqual('corto', 'mucho-mas-largo')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});
