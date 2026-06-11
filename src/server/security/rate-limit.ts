// Rate limiting de ventana fija en memoria. Suficiente para un solo web
// service (Render): protege login/registro/reset de fuerza bruta sin Redis.

interface Bucket {
  count: number;
  resetAt: number;
}

// En globalThis (como el singleton de Prisma): una recompilación de dev/HMR
// no debe reiniciar los contadores.
const globalStore = globalThis as unknown as { __qdbRateBuckets?: Map<string, Bucket> };
const buckets = globalStore.__qdbRateBuckets ?? new Map<string, Bucket>();
globalStore.__qdbRateBuckets = buckets;

export interface RateLimitResult {
  ok: boolean;
  retryAfterMs: number;
}

export function rateLimit(key: string, max: number, windowMs: number, now: number = Date.now()): RateLimitResult {
  sweepIfNeeded(now);
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterMs: 0 };
  }
  if (b.count < max) {
    b.count += 1;
    return { ok: true, retryAfterMs: 0 };
  }
  return { ok: false, retryAfterMs: b.resetAt - now };
}

// Tras un éxito (p. ej. login correcto) el contador de esa llave se libera.
export function clearRateLimit(key: string): void {
  buckets.delete(key);
}

export function resetRateLimits(): void {
  buckets.clear();
}

// Evita crecimiento sin tope si alguien rota llaves (IPs/correos basura).
function sweepIfNeeded(now: number): void {
  if (buckets.size < 50_000) return;
  for (const [k, b] of buckets) {
    if (now >= b.resetAt) buckets.delete(k);
  }
}
