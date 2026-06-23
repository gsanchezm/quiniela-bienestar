# Spec — Parte 2: Bracket interactivo de eliminatorias

**Fecha:** 2026-06-22
**Estado:** Aprobado para implementar (sujeto a revisión de spec)
**Referencia:** `design_handoff_quiniela/js/bracket.jsx` + estilos `.bk-*` en `design_handoff_quiniela/Quiniela del Bienestar.html` (líneas 509–619).

## Objetivo

En el tab **Partidos**, las fases de eliminatoria (R32/16vos, R16/octavos, QF/cuartos, SF/semis, FIN/final) dejan de mostrarse como lista de tarjetas y pasan a mostrarse como un **cuadro/bracket tipo torneo**. La fase de grupos (J1–J3) se queda igual (lista agrupada por fecha).

## Requisitos (del usuario)

- Dos lados que convergen al centro: **16vos (8 llaves por lado) → octavos (4) → cuartos (2) → semis (1) → Final** al centro, con el emblema/campeón arriba y el partido de **3.º lugar** debajo.
- Cada llave es una caja con sus dos equipos; se elige al ganador **tocando un equipo** (pick `H`/`A`, igual que hoy). Mantener: resaltado del pick, estados acierto/fallo tras el resultado, marcador por equipo, y caso **"Por definir"** (TBD) cuando aún no hay equipos.
- Conectores (líneas en codo entre rondas) dibujados con **SVG** para que queden alineados.
- El cuadro **escala** para caber en el ancho disponible y permite **desplazamiento horizontal** en pantallas pequeñas.
- El **chip de ronda** seleccionado resalta esa columna del cuadro.

## Cómo encaja con la data

El layout del prototipo calza 1:1 con los datos actuales (`src/data/worldcup2026.ts`):

| Columna | Stage | # partidos | Por lado (L / R) |
|---|---|---|---|
| 16vos | `R32` | 16 (ids 73–88) | 8 / 8 |
| Octavos | `R16` | 8 (ids 89–96) | 4 / 4 |
| Cuartos | `QF` | 4 (ids 97–100) | 2 / 2 |
| Semis | `SF` | 2 (ids 101–102) | 1 / 1 |
| Final | `FIN` | 2 (ids 103–104) | centro: 104 final, 103 3.º lugar |

**Topología = posicional (decorativa).** Igual que el prototipo, el lado izquierdo es el `slice(0, n)` de cada fase y el derecho el `slice(n)`. Los conectores son **posicionales**, NO reflejan quién avanzó realmente (el avance de equipos lo asigna el admin a mano; el modelo no tiene `nextMatchId` y **no se agrega** — YAGNI). El 3.º lugar se detecta por `tag` (`/tercer/i`), como el prototipo.

## Diseño de componentes

Nuevo módulo `src/components/matches/bracket/`:

- **`KnockoutBracket.tsx`** (client) — orquesta el cuadro. Props: `{ matches: MatchView[]; highlight: StageId; nowMs: number }`.
  - Constantes del prototipo: `H=700`, `COLW=122`, `CONNW=24`, `CENTERW=176`.
  - `useLayoutEffect` para `fit()` (escala = `clientWidth / totalW`, *clamp* `[0.58, 1]`) y para auto-centrar el scroll horizontal al montar y al cambiar de escala.
  - Estructura: `bk-wrap > bk-hint + bk-scroll > bk-sizer > bk-inner > (bk-heads + bk)`. Columnas y conectores en el orden espejo del prototipo (L: R32→Conn→R16→Conn→QF→Conn→SF→Conn(straight) → CENTRO → Conn(straight)→SF→Conn→QF→Conn→R16→Conn→R32).
  - Centro: `bk-champ` (emblema; muestra bandera del campeón si `FIN`/final ya tiene `outcome`, si no el `assets/logo.png`), `BkBox` de la final (`variant="final"`), y `bk-third` con la caja de 3.º lugar.
- **`BracketConn.tsx`** — el conector SVG en codo. Porta `Conn({ feeders, straight, dir })` y la helper `cy(i, k)` tal cual (paths idénticos).
- **`BracketBox.tsx`** — una caja de partido KO. Porta `BkBox`. Renderiza `bk-mt-top` (tag + estado FINAL/EN JUEGO/fecha·hora) y dos filas de equipo (`Row('H'|'A')`).
- **`BracketTeamRow`** (puede vivir dentro de `BracketBox`) — botón `bk-team` con `Flag`, nombre, marcador (`bk-team-score`), tick de pick. Clases de estado: `bk-team-r` (lado derecho, fila invertida), `bk-team-on` (mi pick, sin resultado), `bk-team-win/-hit/-miss/-dim` (tras resultado).

### Mapeo prototipo → app Next

| Prototipo (`bracket.jsx`) | App Next |
|---|---|
| `D.MATCHES.filter(stage)` | `matches.filter((m) => m.stage === stage)` |
| `S.matchTeams(m, st)` → `{h,a}` codes | `m.home` / `m.away` (ya resueltos en `MatchView`) |
| `S.isLocked(m, st)` | `m.locked || m.result !== null || nowMs >= kickoffMs` (igual que `MatchCard.tsx:52`) |
| `st.results[m.id]` (`{hg,ag,winner}`) | `m.result` (`{homeGoals, awayGoals, penWinner}`) |
| `S.outcome(m, st)` | `m.outcome` (`'H'|'A'` en KO) |
| `st.picks[me.id][m.id]` | `m.myPick?.outcome` |
| `setPick(v)` muta store | `pickOutcomeAction(m.id, v)` (server action, vía `useTransition`) |
| `TeamFlag` | `Flag` (`src/components/Flag.tsx`) |
| `S.fmtTime` | `fmtTime` (`src/lib/dates.ts`) |
| `assets/logo.png` | `/logo.png` (ya existe en `public/logo.png`) |

El pick inline llama al **mismo** `pickOutcomeAction(matchId, 'H'|'A')` que ya usa `MatchCard`. Se mantiene "set" (no toggle) para ser consistente con la app actual.

### Marcador exacto (+2) — preservar sin regresión

Hoy los partidos KO **sí** permiten marcador exacto (+2) vía `MatchCard` (la sección `match-pred` no está condicionada a grupos). El bracket del prototipo solo tiene pick de ganador. Para **no perder** el +2 al reemplazar las tarjetas:

- Tocar la **cabecera/zona de marcador** de una caja (no los botones de equipo) abre una **hoja inferior (bottom sheet)** que **envuelve el `MatchCard` existente** para ese partido. Así se reutiliza intacta su lógica: aviso pick≠marcador (`impliedOutcome`), lockline, re-sync de inputs, pending/error, y el propio pick de ganador.
- La hoja es un `<dialog>`/overlay simple con CSS; cierra al tocar fuera o el botón ✕.

> **Punto a confirmar en revisión de spec:** mantener el marcador exacto (+2) en eliminatoria vía esta hoja. Si el usuario prefiere ganador-solo en KO (sin +2), se elimina la hoja y se simplifica. Por defecto se preserva (evita regresión de puntaje).

### Animación de avance del ganador (CSS puro)

Decisión del usuario: **solo avance del ganador** (sin ondeo continuo). Implementación local por cambio de dato, sin librería:

- Cuando un partido tiene `outcome`, la fila del ganador (`bk-team-win`) recibe una `@keyframes` corta de "slide" hacia su conector (translateX leve hacia el centro/borde según `side`) + realce; el perdedor queda `bk-team-dim`.
- Cuando el admin asigna un equipo a una caja de la ronda siguiente (cambia `m.home/m.away` de TBD a equipo), esa fila entra con un slide-in. Se dispara con `key`/transición CSS al detectar el cambio de código de equipo.
- Respeta `prefers-reduced-motion` (desactiva animaciones).

### Estilos

Portar el bloque `.bk-*` (líneas 509–619 del HTML) a `src/styles/globals.css`. Todas las variables que usa ya existen (`--panel`, `--bg2`, `--line`, `--accent`, `--accent-dim`, `--ink`, `--ink-dim`, `--ink-faint`, `--head-font`, `--panel2`). Agregar al final las `@keyframes` del avance y la regla `prefers-reduced-motion`. Más los estilos de la hoja inferior.

## Integración en `MatchesScreen`

```tsx
const KO_STAGES: StageId[] = ['R32', 'R16', 'QF', 'SF', 'FIN'];
const isKo = KO_STAGES.includes(stage);
...
{isKo ? (
  <KnockoutBracket matches={matches} highlight={stage} nowMs={nowMs} />
) : (
  /* render actual de grupos: groups.map(... MatchCard ...) */
)}
```

- La `StageBar` se mantiene. Al estar en una fase KO se muestra el bracket completo con `highlight={stage}` (dim de las demás columnas + `bk-head-on`). El `initialStage` de la **Parte 1** ya posiciona la fase correcta al cargar.
- El aviso `urgentes` (cierre próximo) se mantiene arriba como hoy.

## Admin (Resultados)

Sin cambios de UI: sigue en filas (`AdminScreen`), que es lo adecuado para captura/asignación de equipos. Solo hereda el `initialStage` de la Parte 1.

## Manejo de errores / bordes

- **TBD**: si falta `home` o `away`, la caja muestra "Por definir" y deshabilita los botones (igual que hoy y que el prototipo).
- **Penales**: si `result.homeGoals === result.awayGoals` y hay `penWinner`, marcar la `i` "p" junto al marcador del ganador de penales (porta `pen` del prototipo).
- **Bloqueo**: kickoff pasado / resultado presente → botones deshabilitados; la hoja abre en modo lectura (lo maneja `MatchCard`).
- **Escala mínima**: por debajo de 0.58 no se encoge más; se desplaza horizontalmente (porta el clamp del prototipo).

## Pruebas

- **Unitarias/render** (Vitest + Testing Library):
  - `BracketBox` con TBD → muestra "Por definir", botones deshabilitados.
  - `BracketBox` con equipos + resultado → marcador, `bk-team-win`, hit/miss según `myPick`.
  - Click en equipo (no bloqueado) → llama `pickOutcomeAction(id, lado)`.
  - Bloqueado → no dispara la acción.
  - `currentStage` ya cubierto en Parte 1; el bracket recibe `highlight` correcto.
- **Verificación visual** (skill `verify`/`run`): cargar Partidos en una fase KO con datos sembrados, comprobar layout espejo, conectores alineados, scroll/centro en móvil, hoja de marcador.

## Fuera de alcance

- Sin cambios al esquema de Prisma ni a la lógica de puntaje.
- Sin auto-avance de ganadores (lo asigna el admin).
- Sin ondeo continuo de banderas.
- Mapeo oficial FIFA de llaves (si el usuario lo provee luego, se ajusta la topología decorativa).
