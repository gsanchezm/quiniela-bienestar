import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimit, clearRateLimit, resetRateLimits } from './rate-limit';

const T0 = 1_000_000;

describe('rate limiting de endpoints sensibles', () => {
  beforeEach(() => resetRateLimits());

  it('permite hasta el máximo de intentos dentro de la ventana', () => {
    for (let i = 0; i < 5; i++) {
      expect(rateLimit('login:1.2.3.4:a@b.mx', 5, 60_000, T0 + i).ok).toBe(true);
    }
  });

  it('bloquea el intento que excede el máximo e informa cuánto falta', () => {
    for (let i = 0; i < 5; i++) rateLimit('k', 5, 60_000, T0);
    const r = rateLimit('k', 5, 60_000, T0 + 10_000);
    expect(r.ok).toBe(false);
    expect(r.retryAfterMs).toBe(50_000);
  });

  it('la ventana expira y vuelve a permitir', () => {
    for (let i = 0; i < 6; i++) rateLimit('k', 5, 60_000, T0);
    expect(rateLimit('k', 5, 60_000, T0 + 60_001).ok).toBe(true);
  });

  it('las llaves son independientes (otro usuario/IP no se ve afectado)', () => {
    for (let i = 0; i < 6; i++) rateLimit('login:ip1:a@b.mx', 5, 60_000, T0);
    expect(rateLimit('login:ip2:a@b.mx', 5, 60_000, T0).ok).toBe(true);
    expect(rateLimit('login:ip1:otro@b.mx', 5, 60_000, T0).ok).toBe(true);
  });

  it('un login exitoso limpia el contador de esa llave', () => {
    for (let i = 0; i < 4; i++) rateLimit('k', 5, 60_000, T0);
    clearRateLimit('k');
    for (let i = 0; i < 5; i++) {
      expect(rateLimit('k', 5, 60_000, T0 + 1).ok).toBe(true);
    }
  });
});
