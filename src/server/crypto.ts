import crypto from 'node:crypto';

// Los tokens (sesión y correo) se guardan hasheados: si la BD se filtra,
// los valores en las cookies/enlaces siguen sin servirle a nadie.
export const hashToken = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex');

export const newToken = () => crypto.randomBytes(32).toString('hex');

// Comparación en tiempo constante para secretos (p. ej. SYNC_SECRET):
// un `===` permite adivinar byte por byte midiendo tiempos.
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
