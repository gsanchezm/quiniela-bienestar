# Quiniela del Bienestar — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** App de producción de quiniela del Mundial 2026 (picks 1X2 + marcador exacto, puntos, tabla, admin de resultados, sync) replicando el prototipo hifi de `design_handoff_quiniela/`.

**Architecture:** Next.js 15 App Router con dominio puro testeable (`src/domain`), puertos/repositorios delgados sobre Prisma (`src/server`), Server Actions para mutaciones y RSC para lectura. Email y proveedor de resultados detrás de interfaces (Strategy). Spec: `docs/superpowers/specs/2026-06-10-quiniela-bienestar-design.md`.

**Tech Stack:** Next 15.5 / React 19 / TS 5.9 / Prisma 6.19 / Postgres / Vitest 3 / bcryptjs / Resend / zod 3 / pnpm.

**Regla transversal (BDD/TDD):** todo módulo de `src/domain` y `src/server/services` se escribe test-primero; nombres de tests en español estilo BDD. Gate por fase: `pnpm test` y `pnpm build` verdes antes de commit.

---

## Fase 1 — Configuración base

### Task 1: tsconfig, next config, vitest config, estructura

**Files:**
- Create: `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.env.example`, `src/app/layout.tsx`, `src/app/page.tsx` (placeholder), `src/styles/globals.css` (solo tokens `:root` por ahora)

- [x] **Step 1:** `tsconfig.json` estándar Next 15 con `"paths": {"@/*": ["./src/*"]}`, strict.
- [x] **Step 2:** `vitest.config.ts` con alias `@` → `src`, `environment: 'node'`, include `src/**/*.test.ts`.
- [x] **Step 3:** `.env.example` con `DATABASE_URL`, `SESSION_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_EMAILS`, `FOOTBALL_DATA_TOKEN`, `SYNC_SECRET`, `APP_URL`.
- [x] **Step 4:** Verificar `pnpm build` compila (página placeholder) y commit.

## Fase 2 — Datos del Mundial + seed (test primero)

### Task 2: dataset tipado de 48 equipos y 104 partidos

**Files:**
- Create: `src/data/worldcup2026.ts` (portado 1:1 de `design_handoff_quiniela/js/data.js`)
- Test: `src/data/worldcup2026.test.ts`

- [x] **Step 1:** Test primero — invariantes del dataset:

```ts
import { describe, it, expect } from 'vitest';
import { TEAMS, MATCHES } from './worldcup2026';

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
  it('numera 1..104 sin huecos y con kickoff UTC válido y creciente por número de fase', () => {
    expect(MATCHES.map((m) => m.id)).toEqual(Array.from({ length: 104 }, (_, i) => i + 1));
    MATCHES.forEach((m) => expect(Number.isNaN(Date.parse(m.kickoffUtc))).toBe(false));
  });
  it('cada selección juega exactamente 3 partidos de grupos contra rivales de su grupo', () => {
    const cuenta = new Map<string, number>();
    MATCHES.filter((m) => !m.isKnockout).forEach((m) => {
      expect(TEAMS[m.homeCode!].group).toBe(TEAMS[m.awayCode!].group);
      cuenta.set(m.homeCode!, (cuenta.get(m.homeCode!) ?? 0) + 1);
      cuenta.set(m.awayCode!, (cuenta.get(m.awayCode!) ?? 0) + 1);
    });
    Object.keys(TEAMS).forEach((c) => expect(cuenta.get(c)).toBe(3));
  });
  it('los partidos KO no tienen equipos asignados y sí tienen etiqueta de llave', () => {
    MATCHES.filter((m) => m.isKnockout).forEach((m) => {
      expect(m.homeCode).toBeNull();
      expect(m.awayCode).toBeNull();
      expect(m.tag).toBeTruthy();
    });
  });
});
```

- [x] **Step 2:** Correr y ver fallar (módulo no existe). `pnpm test`
- [x] **Step 3:** Implementar `worldcup2026.ts`: tipos `TeamInfo { name, flag, group }`, `MatchSeed { id, stage, group, tag, isKnockout, homeCode, awayCode, kickoffUtc }`; transcribir los 48 equipos y 104 partidos de `js/data.js` (incluye `KICKOFF = '2026-06-11T19:00:00Z'`, etiquetas de etapas `STAGES`).
- [x] **Step 4:** `pnpm test` verde. Commit.

### Task 3: seed idempotente

**Files:**
- Create: `prisma/seed.ts`

- [x] **Step 1:** `seed.ts`: upsert de los 48 `Team` y 104 `Match` (sin tocar goles/penWinner/koTeams existentes — solo crea lo que falta; `update: {}` en partidos para no pisar resultados). Log de conteos.
- [x] **Step 2:** Verificación tipo-nivel: `pnpm exec tsc --noEmit`. (Ejecución real contra Postgres se hace en Fase 7.) Commit.

## Fase 3 — Dominio puro (TDD estricto)

### Task 4: bloqueo por kickoff

**Files:** Create `src/domain/lock.ts` · Test `src/domain/lock.test.ts`

- [x] **Step 1:** Tests: `está bloqueado cuando now === kickoff`, `cuando now > kickoff`, `abierto cuando now < kickoff`.

```ts
import { describe, it, expect } from 'vitest';
import { isLocked } from './lock';
const ko = new Date('2026-06-11T19:00:00Z');
describe('cierre al silbatazo', () => {
  it('está abierto un segundo antes del kickoff', () =>
    expect(isLocked(ko, new Date('2026-06-11T18:59:59Z'))).toBe(false));
  it('se bloquea exactamente al kickoff', () =>
    expect(isLocked(ko, new Date('2026-06-11T19:00:00Z'))).toBe(true));
  it('sigue bloqueado después del kickoff', () =>
    expect(isLocked(ko, new Date('2026-06-12T00:00:00Z'))).toBe(true));
});
```

- [x] **Step 2:** Fallar → implementar:

```ts
export function isLocked(kickoffUtc: Date, now: Date): boolean {
  return now.getTime() >= kickoffUtc.getTime();
}
```

- [x] **Step 3:** Verde. Commit.

### Task 5: puntos y resultado de partido

**Files:** Create `src/domain/types.ts`, `src/domain/scoring.ts` · Test `src/domain/scoring.test.ts`

- [x] **Step 1:** Tipos compartidos:

```ts
export type Outcome = 'H' | 'D' | 'A';
export interface MatchResult { homeGoals: number; awayGoals: number; penWinner: 'H' | 'A' | null }
export interface PickValue { outcome: Outcome | null; predHome: number | null; predAway: number | null }
export interface PickScore { points: number; outcomeHit: boolean; exactHit: boolean }
```

- [x] **Step 2:** Tests BDD (fallar primero):

```ts
describe('resultado del partido', () => {
  it('gana local / empate / gana visita en fase de grupos', ...);        // 2-1→H, 1-1→D, 0-3→A
  it('en eliminatoria el empate lo decide el ganador en penales', ...);  // 1-1 pen H → 'H'
  it('en eliminatoria empatado sin penales capturados no hay resultado', ...); // → null
});
describe('puntos por partido', () => {
  it('da 1 punto por acertar el resultado 1X2', ...);
  it('da 3 puntos (1+2) cuando además el marcador exacto coincide', ...);
  it('da 2 puntos cuando solo acierta el marcador exacto sin pick', ...); // pred 1-1 real 1-1, outcome null
  it('marcador exacto en KO con penales compara el marcador del juego', ...); // real 1-1 penA; pred 1-1 + pick A → 3
  it('no da puntos con pick y marcador errados', ...);
  it('marcador parcial (solo un lado capturado) no cuenta como exacto', ...);
});
```

- [x] **Step 3:** Implementación mínima:

```ts
export function matchOutcome(r: MatchResult, isKnockout: boolean): Outcome | null {
  if (r.homeGoals > r.awayGoals) return 'H';
  if (r.homeGoals < r.awayGoals) return 'A';
  return isKnockout ? r.penWinner : 'D';
}
export function scorePick(pick: PickValue, r: MatchResult, isKnockout: boolean): PickScore {
  const out = matchOutcome(r, isKnockout);
  const outcomeHit = pick.outcome !== null && out !== null && pick.outcome === out;
  const exactHit = pick.predHome !== null && pick.predAway !== null
    && pick.predHome === r.homeGoals && pick.predAway === r.awayGoals;
  return { points: (outcomeHit ? 1 : 0) + (exactHit ? 2 : 0), outcomeHit, exactHit };
}
```

- [x] **Step 4:** Verde. Commit.

### Task 6: tabla de posiciones

**Files:** Create `src/domain/standings.ts` · Test `src/domain/standings.test.ts`

- [x] **Step 1:** Tests: ordena por puntos desc; desempata por aciertos 1X2 desc (puede diferir con exactos); desempate final alfabético es-MX por nombre+apellido; acumula `exactos`, `jugados`, `totalPicks`.
- [x] **Step 2:** Implementar `computeStandings(users, picksByUser, finishedMatches): StandingRow[]` como función pura sobre estructuras simples (sin Prisma).
- [x] **Step 3:** Verde. Commit.

### Task 7: validaciones zod

**Files:** Create `src/domain/validation.ts` · Test `src/domain/validation.test.ts`

- [x] **Step 1:** Tests: gol acepta 0..99 enteros; rechaza -1, 100, 1.5, NaN, strings no numéricas; outcome ∈ {H,D,A}; KO no acepta 'D'; registro exige nombre/apellido no vacíos, email válido, contraseña ≥ 6; foto data-URL JPEG ≤ 200 KB.
- [x] **Step 2:** Implementar schemas: `goalSchema`, `outcomeSchema(isKnockout)`, `signupSchema`, `loginSchema`, `profileSchema`, `scorePredictionSchema`, `resultSchema` (KO empatado ⇒ `penWinner` requerido).
- [x] **Step 3:** Verde. Commit.

## Fase 4 — Infraestructura de servidor

### Task 8: db, env, password, sesiones, tokens, admin

**Files:**
- Create: `src/server/db.ts` (singleton PrismaClient), `src/server/env.ts` (lectura tipada de env),
  `src/server/auth/password.ts` (bcrypt cost 12), `src/server/auth/session.ts`,
  `src/server/auth/tokens.ts`, `src/server/admin.ts`
- Test: `src/server/admin.test.ts`, `src/server/auth/tokens.test.ts` (partes puras: TTL, generación hex 64)

- [x] **Step 1:** `session.ts`: `createSession(userId)` (token `crypto.randomBytes(32).toString('hex')`, expira +30 d, cookie `qdb_session` httpOnly/secure/lax/path=/), `getSessionUser()` (lee cookie → BD → usuario o null; borra expiradas), `destroySession()`. Server-only.
- [x] **Step 2:** `tokens.ts`: `issueToken(userId, type, ttlHours, newEmail?)`, `consumeToken(token, type)` (válido+no expirado ⇒ borra y regresa; si no, null). CONFIRM 24 h, RESET 2 h, EMAIL_CHANGE 24 h.
- [x] **Step 3:** `admin.ts`: `isAdmin(email)` contra `ADMIN_EMAILS` (CSV, case-insensitive, trim). Tests.
- [x] **Step 4:** Verde + commit.

### Task 9: correo (Strategy) + plantillas

**Files:**
- Create: `src/server/email/sender.ts`, `src/server/email/templates.ts`
- Test: `src/server/email/templates.test.ts` (las plantillas incluyen el enlace y el destinatario correcto)

- [x] **Step 1:** Puerto `EmailSender { send(to, subject, html): Promise<void> }`; `ResendSender` (SDK, from `EMAIL_FROM`); `ConsoleSender` (imprime asunto+enlace); factory `getEmailSender()` por presencia de `RESEND_API_KEY`.
- [x] **Step 2:** `templates.ts`: `confirmEmail(url)`, `resetEmail(url)`, `changeEmail(url)` — HTML oscuro con tokens del prototipo (copys del prototipo: "¡Ya casi estás en la cancha!", "hasta a los mejores porteros les meten gol").
- [x] **Step 3:** Verde + commit.

## Fase 5 — Servicios de negocio (puertos + TDD) y acciones

### Task 10: servicio de picks

**Files:** Create `src/server/services/picks.ts` · Test `src/server/services/picks.test.ts`

- [x] **Step 1:** Puerto mínimo (DIP, fakeable sin Prisma):

```ts
export interface PicksRepo {
  getMatch(id: number): Promise<{ id: number; kickoffUtc: Date; isKnockout: boolean; homeCode: string | null; awayCode: string | null } | null>;
  getPick(userId: string, matchId: number): Promise<PickValue | null>;
  upsertPick(userId: string, matchId: number, value: PickValue): Promise<void>;
  deletePick(userId: string, matchId: number): Promise<void>;
}
```

- [x] **Step 2:** Tests con repo fake: rechaza partido inexistente; rechaza `now >= kickoff`; rechaza KO sin equipos; toggle (mismo outcome ⇒ quita outcome; si tampoco hay marcador ⇒ borra fila); KO rechaza 'D'; marcador 0–99; capturar marcador sin pick auto-selecciona outcome implícito; quitar marcador conserva pick.
- [x] **Step 3:** Implementar `setOutcome(repo, userId, matchId, outcome, now)`, `setScorePrediction(repo, userId, matchId, predHome, predAway, now)`, `clearScorePrediction(...)` con las reglas BDD del spec §4.1. Adapter Prisma al final del archivo (`prismaPicksRepo`).
- [x] **Step 4:** Verde. Commit.

### Task 11: servicio de resultados y llaves (admin)

**Files:** Create `src/server/services/results.ts` · Test `src/server/services/results.test.ts`

- [x] **Step 1:** Puerto: `getMatch`, `setResult(matchId, hg, ag, penWinner|null)`, `clearResult(matchId)`, `setKnockoutTeams(matchId, homeCode, awayCode)`, `deletePicksForMatch(matchId)`.
- [x] **Step 2:** Tests: valida 0–99; KO empatado exige penWinner; grupos ignora penWinner; **cambiar equipos de llave con picks existentes borra los picks de ese partido**; no se pueden asignar equipos iguales; cambiar equipos tras kickoff rechazado.
- [x] **Step 3:** Implementar + adapter Prisma. Verde. Commit.

### Task 12: standings + privacidad (queries de lectura)

**Files:** Create `src/server/services/standings.ts` · Test `src/server/services/standings.test.ts`

- [x] **Step 1:** Tests de privacidad: `visiblePick(pick, match, viewerId, ownerId, now)` — propio siempre; ajeno solo si `isLocked`; oculto ⇒ se sustituye por `{ hidden: true }` sin valores.
- [x] **Step 2:** Implementar lectura: `getStandings(db)` (usa `computeStandings` del dominio), `getPlayerPicks(db, ownerId, viewerId, now)` con filtro de privacidad **en servidor**.
- [x] **Step 3:** Verde. Commit.

### Task 13: servicio de auth (registro/confirmación/login/reset/cambio email)

**Files:** Create `src/server/services/auth.ts` · Test `src/server/services/auth.test.ts`

- [x] **Step 1:** Tests con fakes (repo usuarios + sender espía): registro normaliza email, hashea, manda CONFIRM al email; login rechaza no confirmado / credenciales malas; confirm consume token y marca `confirmed`; forgot con email inexistente NO revela (no-op silencioso); reset cambia hash y consume; cambio de email manda EMAIL_CHANGE al **nuevo** y aplica al confirmar; email duplicado rechazado en registro y en cambio.
- [x] **Step 2:** Implementar orquestación sobre Prisma + `tokens.ts` + `sender`. Colores de avatar: paleta del prototipo (`store.js:23`).
- [x] **Step 3:** Verde. Commit.

### Task 14: sync football-data.org (Strategy + matching)

**Files:** Create `src/server/services/sync.ts` · Test `src/server/services/sync.test.ts`

- [x] **Step 1:** Puerto `ResultsProvider { fetchFinished(): Promise<ProviderMatch[]> }` con `ProviderMatch { homeName, awayName, homeTla, awayTla, utcDate, fullTime: {home,away}, penalties?: {home,away}|null, winner: 'HOME'|'AWAY'|'DRAW'|null, duration: 'REGULAR'|'EXTRA_TIME'|'PENALTY_SHOOTOUT' }`.
- [x] **Step 2:** Tests: matching por TLA y por nombre normalizado (sin acentos/case) con tolerancia de fecha ±1 día; PSO ⇒ goles del juego (si `penalties` viene aparte usa fullTime tal cual; documentado) y `penWinner` desde `winner`; **no pisa un resultado manual existente distinto** (lo reporta en el resumen); partidos sin equipos asignados en BD se saltan; resumen `{ updated, skippedManual, unmatched }`.
- [x] **Step 3:** Implementar `FootballDataProvider` (GET `https://api.football-data.org/v4/competitions/WC/matches`, header `X-Auth-Token`) + `runSync(db, provider, now)`.
- [x] **Step 4:** Verde. Commit.

### Task 15: Server Actions + route handlers

**Files:**
- Create: `src/app/actions/auth.ts`, `src/app/actions/picks.ts`, `src/app/actions/results.ts`, `src/app/actions/profile.ts`, `src/app/api/sync/route.ts`, `src/app/confirmar/[token]/route.ts`, `src/app/confirmar-email/[token]/route.ts`

- [x] **Step 1:** Acciones `'use server'` delgadas: validar con zod → sesión (`getSessionUser`) → servicio → `revalidatePath`. Resultados/llaves/sync exigen `isAdmin`. `/api/sync` acepta `Authorization: Bearer $SYNC_SECRET` **o** sesión admin; responde el resumen del sync.
- [x] **Step 2:** `pnpm build` + `pnpm test` verdes. Commit.

## Fase 6 — UI hifi (réplica del prototipo)

> Fuente de verdad visual: `design_handoff_quiniela/Quiniela del Bienestar.html` (CSS completo en `<style>`,
> design tokens en `:root`) y los `js/*.jsx`. Copys idénticos. Cambios acordados: video login `fcnDmrtj6Sk`,
> carrusel sin paginación visible, inputs de marcador en la tarjeta, tab Resultados solo admin, sin Tweaks/demo.

### Task 16: estilos globales + fuentes + componentes base

**Files:**
- Create: `src/styles/globals.css` (port completo del `<style>` del HTML, menos tweaks-panel), fuentes Google en `src/app/layout.tsx` (Barlow Condensed 600/700, Archivo 800, Barlow 400/500/600 — `next/font/google`)
- Create: `src/components/Flag.tsx`, `Avatar.tsx`, `Countdown.tsx` (client), `Field.tsx`, `Btn.tsx`, `StadiumBackdrop.tsx` (prop `videoId`, respeta prefers-reduced-motion, toggle apagar), `Ticker.tsx`

- [x] **Step 1:** Portar tokens y estilos; verificar contra prototipo (colores §5 del spec). Componentes = ports de `js/ui.jsx` con props tipadas.
- [x] **Step 2:** `pnpm build` verde. Commit.

### Task 17: landing pública

**Files:** Create `src/app/page.tsx` + `src/components/landing/*`

- [x] **Step 1:** Port de `js/auth.jsx` Landing: badge, logo (`public/logo.png` copiado de assets), sub "104 partidos · 48 selecciones…", Countdown a `2026-06-11T19:00:00Z`, video `smiF90YexLY` apagable, 3 feature cards, botones a /login y /registro, Ticker J1. Si hay sesión → redirect `/partidos`.
- [x] **Step 2:** Commit.

### Task 18: login + registro + olvidé/reset + páginas de confirmación

**Files:** Create `src/app/(auth)/login/page.tsx`, `registro/page.tsx`, `olvide/page.tsx`, `reset/[token]/page.tsx`, `src/components/auth/NewsCarousel.tsx` (client)

- [x] **Step 1:** Login split: carrusel auto 6 s **sin números** (4 slides del prototipo, `auth.jsx:138-159`) + form; video de fondo **`fcnDmrtj6Sk`**. Registro/olvide/reset como AuthShell del prototipo. Errores de venta server-action en el campo correspondiente. Móvil: carrusel arriba.
- [x] **Step 2:** Commit.

### Task 19: shell de la app + Partidos

**Files:** Create `src/app/(app)/layout.tsx` (header tabs PARTIDOS/TABLA/RESULTADOS-si-admin, avatar→/perfil, Salir), `src/app/(app)/partidos/page.tsx`, `src/components/matches/MatchCard.tsx` (client), `StageBar.tsx`

- [x] **Step 1:** Port de `js/matches.jsx` + **inputs de marcador exacto** (2 inputs numéricos 0–99 con guardado al blur/botón, mismo bloqueo y estados hit/miss con clase verde/roja). Progreso "X/N PICKS" por etapa. Agrupación por fecha **local** y hora local (client component para fechas). Estados: VS / EN JUEGO–CERRADO / FINAL con marcador LED y "✓ Acertaste +N puntos".
- [x] **Step 2:** Commit.

### Task 20: Tabla + detalle de jugador

**Files:** Create `src/app/(app)/tabla/page.tsx`, `tabla/[userId]/page.tsx`

- [x] **Step 1:** Port de `js/standings.jsx`: medallas top-3, fila "(tú)", aciertos/jugados, puntos LED 2 dígitos, aviso si no hay resultados; detalle con chips de etapa y filas pick/marcador (ajenos 🔒 hasta cierre — el filtro ya viene del servidor). Mostrar también pronóstico de marcador y badge "+3" cuando hubo exacto.
- [x] **Step 2:** Commit.

### Task 21: Resultados (admin) + Perfil

**Files:** Create `src/app/(app)/resultados/page.tsx` + `src/components/admin/*` (client), `src/app/(app)/perfil/page.tsx`

- [x] **Step 1:** Resultados (guard `isAdmin`, 404/redirect si no): port de `js/admin.jsx` sin botones demo; selects de equipos por llave (excluye el rival), inputs 0–99, select de penales si KO empatado, Finalizar/Actualizar/Borrar; botón "Sincronizar ahora" (action → runSync) con resumen.
- [x] **Step 2:** Perfil: port de `js/profile.jsx` + PhotoPicker canvas 128px (de `ui.jsx:90-126`); cambio de email dispara re-confirmación con aviso "revisa tu correo nuevo".
- [x] **Step 3:** `pnpm build` + `pnpm test`. Commit.

## Fase 7 — Deploy, sync programado, README y verificación final

### Task 22: render.yaml + GitHub Action + README

**Files:** Create `render.yaml`, `.github/workflows/sync.yml`, `README.md`

- [x] **Step 1:** `render.yaml`: web service (plan starter, `buildCommand: corepack enable && pnpm install --frozen-lockfile && pnpm build`, `preDeployCommand: pnpm db:migrate && pnpm db:seed`, `startCommand: pnpm start`, env vars con `sync: false` para secretos, `DATABASE_URL` desde la BD) + `databases:` Postgres plan starter (hmm: validar nombre de plan actual en docs de Render al ejecutar).
- [x] **Step 2:** `.github/workflows/sync.yml`: `schedule: '*/15 * * * *'` (11-jun–19-jul guard en job) → `curl -fsS -X POST -H "Authorization: Bearer ${{ secrets.SYNC_SECRET }}" ${{ secrets.APP_URL }}/api/sync`.
- [x] **Step 3:** README es-MX: requisitos, env vars, pasos Render (blueprint), alta Resend (dominio o modo sandbox a gilberto.aspros@gmail.com), alta football-data.org, GH Action secrets, desarrollo local. Commit.

### Task 23: migración inicial + verificación end-to-end local

- [x] **Step 1:** Generar migración: levantar Postgres local (docker si disponible; si no, `prisma migrate diff` para SQL y `migrate deploy` en Render) → `pnpm exec prisma migrate dev --name init` + `pnpm db:seed`.
- [x] **Step 2:** Gate final: `pnpm test` (todas las suites) + `pnpm build` + arrancar `pnpm dev` y smoke manual: registro (correo a consola), confirmar, pick antes/después de kickoff simulado, captura resultado como admin, tabla con puntos 1/3, foto perfil.
- [x] **Step 3:** Commit final.

### Task 24: push a GitHub

- [x] **Step 1:** `git remote add origin https://github.com/gsanchezm/quiniela-bienestar.git && git push -u origin main` (gh auth del usuario). Reportar URL.

---

## Self-review (hecho al escribir)

- **Cobertura del spec:** §2 stack→F1; §3 modelo→ya en schema (commit inicial); §4.1→T4,T7,T10; §4.2→T5,T6;
  §4.3→T12,T20; §4.4→T11,T21; §4.5→T8,T9,T13,T18; §4.6→T14,T15,T22; §5→T16-21; §6→T8,T13,T15; §7→T22-23. Sin huecos.
- **Tipos consistentes:** `PickValue/MatchResult/Outcome` definidos en T5 y reusados en T10-T14.
- **Sin placeholders:** los tests de dominio están completos; los de servicios enumeran caso por caso su comportamiento esperado.
