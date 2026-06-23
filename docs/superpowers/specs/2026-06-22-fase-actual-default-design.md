# Spec — Parte 1: Arrancar en la fase actual (no siempre J1)

**Fecha:** 2026-06-22
**Estado:** Aprobado para implementar
**Urgencia:** Alta — el bug afecta a usuarios en producción hoy (estamos en J2).

## Problema

Las tres pantallas que usan `StageBar` inicializan la fase seleccionada con un literal `'J1'`:

- `src/components/matches/MatchesScreen.tsx:15` — tab **Partidos** (jugador)
- `src/components/admin/AdminScreen.tsx:172` — tab **Resultados** (admin)
- `src/app/(app)/tabla/[userId]/PlayerPicksTable.tsx:13` — detalle de picks por jugador

No existe ninguna lógica que calcule la "fase actual". Resultado: el usuario siempre cae en Jornada 1 aunque el torneo vaya en J2/J3/eliminatoria.

## Objetivo

Al abrir cada una de esas pantallas, posicionarlas en la **fase actual** definida así (decisión del usuario):

> La fase del primer partido (en orden cronológico) cuyo kickoff **sigue en el futuro** — es decir, donde todavía se pueden hacer picks. Si ya arrancaron todos los partidos, la **última** fase del torneo (`FIN`). Antes de que empiece el torneo, `J1`.

## Diseño

### 1. Función pura `currentStage`

Archivo nuevo: `src/domain/stages.ts`

```ts
import { STAGES, type StageId } from '@/data/worldcup2026';

interface StageItem {
  stage: StageId;
  kickoffUtc: string; // ISO UTC
}

const ORDER: StageId[] = STAGES.map((s) => s.id);

/**
 * Fase "actual": la del primer partido (cronológico) cuyo kickoff aún es
 * futuro. Si todos ya arrancaron, la última fase con partidos. Si la lista
 * está vacía, J1 (fallback defensivo).
 */
export function currentStage(items: StageItem[], nowMs: number): StageId {
  if (items.length === 0) return 'J1';

  // Primer partido futuro (orden cronológico por kickoff, desempate por orden de fase).
  const future = items
    .filter((m) => new Date(m.kickoffUtc).getTime() > nowMs)
    .sort((a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime());

  if (future.length > 0) return future[0].stage;

  // Todo arrancó: la última fase (en orden de torneo) que tenga algún partido.
  for (let i = ORDER.length - 1; i >= 0; i--) {
    if (items.some((m) => m.stage === ORDER[i])) return ORDER[i];
  }
  return 'J1';
}
```

Notas de diseño:
- Es **pura** (recibe `nowMs`, no llama a `Date.now()`), para testear los bordes de forma determinista.
- Acepta cualquier arreglo con `{ stage, kickoffUtc }` — sirve para `MatchView[]` y para `PlayerPickRowView[]` (mapeando `r.match`).
- No depende de resultados capturados (evita quedarse atascada si el admin tarda en capturar) — usa el reloj, como pidió el usuario ("próximo partido por jugar").

### 2. Cálculo en el servidor, no en el cliente

Las pantallas son client components pero sus páginas son **RSC** con `export const dynamic = 'force-dynamic'`, así que `Date.now()` server-side es por-request y confiable. Calcular ahí evita el *mismatch* de hidratación y el parpadeo J1→salto (el código ya pelea hidratación con `mounted`/`suppressHydrationWarning`; no introducimos otra fuente).

Cambios por página:

**`src/app/(app)/partidos/page.tsx`**
```ts
const matches = await getMatchesForUser(me.id);
const initialStage = currentStage(matches, Date.now());
return <MatchesScreen matches={matches} initialStage={initialStage} />;
```

**`src/app/(app)/resultados/page.tsx`**
```ts
const initialStage = currentStage(matches, Date.now());
return <AdminScreen matches={matches} teams={teams} initialStage={initialStage} syncAvailable={...} />;
```

**`src/app/(app)/tabla/[userId]/page.tsx`**
Calcular `currentStage(rows.map((r) => r.match), Date.now())` y pasarlo a `PlayerPicksTable` como `initialStage`.

### 3. Consumir el prop en los client components

En cada uno: `const [stage, setStage] = useState<StageId>(initialStage);` y agregar `initialStage: StageId` a las props del componente. Sin más cambios de comportamiento.

## Componentes / interfaces

- `currentStage(items, nowMs): StageId` — única unidad nueva, pura y testeable de forma aislada.
- Tres props nuevas `initialStage` (una por componente), con un valor por defecto opcional `'J1'` para no romper otros llamadores/tests existentes.

## Manejo de errores / bordes

- Lista vacía → `J1`.
- Todos los partidos en el pasado (torneo terminado) → última fase con partidos (`FIN`).
- Pre-torneo (todos en el futuro) → la fase del más próximo = `J1`.
- Empates de hora (J3 simultáneos) → el `sort` estable mantiene el orden de entrada; todos comparten fase, así que es indiferente.

## Pruebas (TDD)

`src/domain/stages.test.ts` (Vitest), usando un subconjunto representativo de `MATCHES`:
1. `now` antes del 11-jun → `J1`.
2. `now` el 22-jun (mid-J2, hay partidos J2 futuros) → `J2`.
3. `now` justo después del último J1 y antes del primer J2 → `J2`.
4. `now` después del último partido (post 19-jul) → `FIN`.
5. `now` cuando el próximo futuro es R32 → `R32`.
6. Lista vacía → `J1`.

## Fuera de alcance

- No se toca el esquema de Prisma.
- No se cambia la navegación ni el `StageBar`.
- El bracket de eliminatorias es la **Parte 2** (spec aparte).
