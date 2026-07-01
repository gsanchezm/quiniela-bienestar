# Spec — Topología oficial del cuadro + auto-avance de ganadores

**Fecha:** 2026-06-30
**Estado:** Borrador para revisión del usuario (**revisado tras verificación multi-fuente** — ver §0)
**Relacionado:**
- `docs/superpowers/specs/2026-06-22-bracket-eliminatorias-design.md` (dejó pendiente: *"Mapeo oficial FIFA de llaves"* y *"Sin auto-avance de ganadores"*)
- `docs/superpowers/specs/2026-06-28-auto-asignacion-eliminatorias-design.md` (dejó fuera: *"Auto-avance de ganadores por la topología del cuadro"*)
- `[[quiniela-knockout-teams]]` y `[[quiniela-bracket-topologia-2026]]` (memoria)
- Archivos: `src/domain/knockout-assign.ts`, `src/components/matches/bracket/layout.ts`, `src/server/services/sync.ts`, `src/app/actions/results.ts`, `scripts/fix-knockout-kickoffs.ts`, `design_handoff_quiniela/js/bracket.jsx`

---

## 0. Corrección importante respecto a la primera versión

La **primera** versión de este spec asumió que el árbol del Mundial 2026 era **emparejamiento consecutivo** (89=G73/G74, 90=G75/G76…) y por tanto "la geometría ya está bien y `layout.ts` casi no cambia". **Eso era FALSO.** Una verificación multi-fuente (6 fuentes: Wikipedia×2, FIFA, Sky, CBS, ESPN + reconciliación adversarial) confirmó por unanimidad que el árbol es **NO-consecutivo e irregular**. La primera lectura vino de un único WebFetch cuyo modelo "normalizó" el árbol al patrón estándar — fabricado. Este spec queda reescrito sobre los datos verificados (§1). Consecuencias: `layout.ts` **sí** cambia (ordenar por rango de bracket), y la topología es un **mapa explícito**, no una fórmula.

---

## 1. Datos verificados (fuente de verdad)

Confianza **alta** en: los 16 cruces de R32, equipos, sedes, resultados jugados (73–78), la topología del árbol y el ancla Canadá/Marruecos. Confianza **media** solo en la etiqueta numérica exacta de 74–78 (dos esquemas de numeración conviven) y en un par de horarios que solo CBS discrepa. **La disputa de numeración no afecta cruces, topología ni ancla** — trabajamos por identidad de equipos, no por número.

### 1.1 Cuadro R32 (Esquema X = FIFA/mayoría) — slot → equipos, hora, sede

| Slot | Local | Visitante | Kickoff UTC | Sede |
|---|---|---|---|---|
| 73 | RSA | CAN | 2026-06-28T19:00Z | SoFi, Los Ángeles |
| 74 | GER | PAR | 2026-06-29T20:30Z | Gillette, Boston |
| 75 | NED | MAR | 2026-06-30T01:00Z | BBVA, Monterrey |
| 76 | BRA | JPN | 2026-06-29T17:00Z | NRG, Houston |
| 77 | FRA | SWE | 2026-06-30T21:00Z | MetLife, NY/NJ |
| 78 | CIV | NOR | 2026-06-30T17:00Z | AT&T, Dallas |
| 79 | MEX | ECU | 2026-07-01T01:00Z | Azteca, CDMX |
| 80 | ENG | COD | 2026-07-01T16:00Z | Mercedes-Benz, Atlanta |
| 81 | USA | BIH | 2026-07-02T00:00Z | Levi's, SF Bay |
| 82 | BEL | SEN | 2026-07-01T20:00Z | Lumen, Seattle |
| 83 | POR | CRO | 2026-07-02T23:00Z | BMO, Toronto |
| 84 | ESP | AUT | 2026-07-02T19:00Z | SoFi, Los Ángeles |
| 85 | SUI | ALG | 2026-07-03T03:00Z | BC Place, Vancouver |
| 86 | ARG | CPV | 2026-07-03T22:00Z | Hard Rock, Miami |
| 87 | COL | GHA | 2026-07-04T01:30Z | Arrowhead, Kansas City |
| 88 | AUS | EGY | 2026-07-03T18:00Z | AT&T, Dallas |

> Códigos = tabla `TEAMS` de `worldcup2026.ts` (RSA, CAN, NED, MAR…). Todas las horas son distintas (fecha+hora únicas), así que sirven de clave alterna; la clave primaria de resolución será el **par de equipos**.

### 1.2 Árbol de avance (mapa explícito, NO consecutivo)

```
Octavos (feeders R32):   89=[74,77]  90=[73,75]  91=[76,78]  92=[79,80]
                         93=[83,84]  94=[81,82]  95=[86,88]  96=[85,87]
Cuartos (feeders R16):   97=[89,90]  98=[93,94]  99=[91,92]  100=[95,96]
Semis  (feeders QF):     101=[97,98] 102=[99,100]
Final:  104=[G101,G102]      3er lugar: 103=[P101,P102]   (G=ganador, P=perdedor)
```

Convención de casillero: **primer feeder → local (H), segundo feeder → visitante (A)**; el feeder-H es la caja de arriba en el display (§6).

**Ancla verificada (test obligatorio):** Canadá gana el slot 73, Marruecos gana el slot 75; ambos alimentan **octavos 90** → Canadá vs Marruecos. ✓ (sobre-determinado: las 6 fuentes lo ponen en el mismo octavos).

---

## 2. Diagnóstico de raíz (actualizado)

Dos capas, ambas "por hora de inicio", desalinean el cuadro:

1. **Sembrado R32 por cronología, no por bracket.** `pickTarget` mete cada cruce del proveedor en el casillero vacío de menor `id`, procesando por hora. El resultado es que el m-id del app ≈ **Esquema Y** (cronológico: m74=Brasil/Japón, m76=Neth/Marruecos…), distinto del Esquema X. Es una numeración válida pero **arbitraria respecto al árbol**.
2. **Conectores decorativos y consecutivos.** `layout.ts` une caja `2r`+`2r+1`→`r`. Con el árbol real (no-consecutivo) esto no corresponde a quién avanza.

Como el árbol real empareja de forma irregular (p.ej. 90=[73,75], 95=[86,88]), **ni siquiera con el sembrado "correcto" un conector consecutivo sería congruente**: hay que reordenar las cajas por su posición en el bracket.

---

## 3. Decisiones (con el usuario)

| Tema | Decisión |
|---|---|
| Alcance | App real `src/` primero, luego **portar al prototipo**. |
| Fuente de avance R16+ | **Auto-cómputo instantáneo** desde la topología. |
| Sembrado / resolución R32 | Casar por **identidad de equipos** (par de códigos), reforzado por horario. (El usuario eligió "por horario/sede"; la resolución por par de equipos es el mismo criterio, más robusto y ya usado en `fix-knockout-kickoffs.ts`.) |
| §6 Reconciliación | El proveedor queda como red de seguridad que **avisa** diferencias sin sobrescribir. |
| §9 Resultado editado aguas arriba | Se reporta **anomalía** (no auto-corrige en silencio) si ya hay resultado/picks aguas abajo. |

---

## 4. Arquitectura: topología por contenido, sin migración

**Insight clave:** las llaves **R16–104 están vacías** (sin equipos, sin picks — el torneo está en R32). Solo R32 está sembrado (por contenido, en m73–88). Por lo tanto **no hay migración**: definimos la topología en "espacio de slot Esquema X" y:

- **R16–104:** su m-id **es** el slot Esquema X (los ligamos por definición; no hay datos que mover).
- **R32:** su m-id es cronológico (Esquema Y); lo **resolvemos a su slot Esquema X por el par de equipos**.

### 4.1 Módulo puro `src/domain/bracket-topology.ts`

```ts
// 1) Sembrado R32 verificado: par de equipos (set) → slot oficial Esquema X.
export const R32_BY_TEAMS: Record<string, number>; // "CAN|RSA" (ordenado) → 73, ...
// 2) Calendario R32 (respaldo/ío): slot → { utc, venue }.
export const R32_SCHEDULE: Record<number, { utc: string; venue: string }>;
// 3) Árbol explícito: slot → [feederA, feederB].
export const FEEDERS: Record<number, [number, number]>; // 89:[74,77], 90:[73,75], ...
// Derivados:
export function r32SlotByTeams(a: string, b: string): number | null; // orden-independiente
export function winnerTarget(slot: number): { parentId: number; slot: 'H'|'A' } | null;
export function loserTarget(slot: number): { parentId: number; slot: 'H'|'A' } | null; // solo 101/102 → 103
export function bracketRank(stage: string, slot: number): number; // orden de display (§6)
```

`winnerTarget` se deriva de `FEEDERS` (invertido): si `FEEDERS[P] = [a,b]`, entonces `winnerTarget(a) = {P, 'H'}` y `winnerTarget(b) = {P, 'A'}`. `loserTarget(101)= {103,'H'}`, `loserTarget(102)= {103,'A'}`.

### 4.2 Resolución de slot por partido

```ts
function slotOf(match): number | null {
  if (stage === 'R32') return r32SlotByTeams(match.homeCode, match.awayCode); // por contenido
  return match.id; // R16+ : m-id = slot Esquema X (lo garantizamos, §7)
}
```

Un par R32 que **no resuelve** (equipos fuera de `R32_BY_TEAMS`) → **anomalía**, nunca se descarta en silencio.

---

## 5. Auto-avance (R32 → Final)

Función PURA `computeAdvancement(matches)` en el módulo:

```ts
interface AdvanceInput { id; stage; homeCode; awayCode; outcome: 'H'|'A'|null }
interface AdvanceWrite { matchId; slot: 'H'|'A'; teamCode; source: 'winner'|'loser' }
export function computeAdvancement(matches: AdvanceInput[]): AdvanceWrite[];
```

- Para cada partido con `outcome`: resolver su `slot`, ganador = equipo del lado `outcome`; `winnerTarget(slot)` → escribir ganador en `parentId`/`slot`. Para SF (101/102): además `loserTarget` → perdedor al 3er lugar.
- **Idempotente y recomputable:** se corre completo tras cualquier cambio de resultado; editar/borrar un resultado propaga el recálculo aguas abajo.
- **Writer conservador:** aplica un `AdvanceWrite` solo si el casillero destino está **vacío** o ya contiene ese mismo equipo (mismo valor). Si contiene OTRO equipo y ese partido ya tiene **picks o resultado** → **anomalía**, no se sobrescribe (§9). Nunca borra picks en silencio (a diferencia de `assignKnockoutTeams`).

### 5.1 Kickoff / cierre de picks (bug de corrección, punto crítico)

`isLocked` se calcula con el `kickoffUtc` de la fila. Al llenar un R16+ por auto-avance, la fila trae su hora **seed** (aproximada, típicamente **más temprana** que la real → cerraría picks antes de tiempo). Resolución, **reusando el patrón ya existente** en `fix-knockout-kickoffs.ts` (casar por par de equipos con el proveedor):

- En `runFullSync`, tras el auto-avance, un paso adopta el **kickoff real del proveedor** para las filas R16+ cuyos equipos ya están puestos (match por par de equipos). Así, equipos (topología) + hora real (proveedor) quedan juntos en el mismo tick de 15 min.
- En captura manual (sin proveedor en ese instante): la fila queda con hora seed hasta el siguiente sync; como la seed es **más temprana**, a lo sumo cierra antes y el sync la **re-abre** (lógica `reopen` ya existente). Gap acotado por la cadencia de 15 min. Se documenta explícitamente como comportamiento aceptado.

### 5.2 Disparadores

1. **Captura manual:** `saveResultAction` y `clearResultAction` (`src/app/actions/results.ts`) corren `runKnockoutAdvance` tras escribir/borrar (borrar también, para revertir).
2. **Sync:** dentro de `runFullSync`, tras `runSync` (goles).

Servicio impuro `runKnockoutAdvance(repo)`: lee partidos KO + resultados, llama `computeAdvancement`, aplica writes conservadores, devuelve `{ advanced, anomalies }`.

---

## 6. Display: `layout.ts` ordena por rango de bracket

`stageSide` hoy hace `.sort((a,b)=>a.id-b.id)`. Cambia a **ordenar por `bracketRank(stage, slotOf(match))`**. La geometría del conector (`connPath`, consecutiva) **no cambia**: al colocar las cajas en orden de bracket, los feeders quedan adyacentes y las líneas cuadran.

Orden de display verificado (rango 0…):

```
R32 (16): [74,77,73,75,83,84,81,82 | 76,78,79,80,86,88,85,87]   (izq | der)
R16 (8):  [89,90,93,94 | 91,92,95,96]
QF (4):   [97,98 | 99,100]
SF (2):   [101 | 102]
```

Chequeo de conectores (izq): R32 pos (0,1)=(74,77)→R16 pos0=89 ✓; (2,3)=(73,75)→90 ✓; (4,5)=(83,84)→93 ✓; (6,7)=(81,82)→94 ✓. Análogo a la derecha. La partición izquierda/derecha sale del propio orden (`slice(0,8)` / `slice(8)`).

> Los tags "Llave 1..16" quedan cosméticos y fuera de orden respecto al display; se re-etiquetan a slot Esquema X o a posición de display (detalle menor de implementación).

---

## 7. Swap del planner + reset (conflicto con el cron)

El cron de 15 min corre `runKnockoutAutoAssign` → `planKnockoutAssignments`, que hoy llena **todas** las rondas KO por menor-id-libre. Con el nuevo diseño:

- **R32:** ya está sembrado; el planner lo deja igual (idempotente).
- **R16+:** el planner **deja de sembrar equipos** (los pone el auto-avance). Se envían al camino de reconciliación (§8).
- **Reset de una vez:** si el cron ya pobló filas R16+ por cronología (m-id ≠ slot Esquema X), esas filas **no** coinciden con nuestra ligadura. Un paso de reset (idempotente) **limpia las filas R16+ pobladas por el proveedor que NO tengan picks** antes de que el auto-avance las ligue por topología. Filas R16+ con picks → **anomalía manual** (no se tocan).
- **`R16+ m-id = slot Esquema X`:** se garantiza porque el auto-avance escribe usando `winnerTarget` (que apunta a `parentId` = slot Esquema X = m-id de esas filas vacías). No hay dato que migrar.

> **Pre-implementación (obligatorio):** verificar el estado REAL (DB de producción y localStorage del prototipo), no inferir de la captura. Confirmar cuántas filas R16+ están pobladas y si alguna tiene picks, para dimensionar el reset.

---

## 8. Reconciliación (red de seguridad)

El proveedor sigue publicando cruces R16+ con equipos reales. Ya **no** los usamos para llenar; sí para **verificación cruzada** y para adoptar kickoff real (§5.1):

- Comparar cada fixture R16+ del proveedor contra el casillero que llenó el auto-avance, **como conjunto** (sin importar orden H/A) → evita el falso positivo de `pairKey` sensible al orden.
- Coincide → adopta kickoff real. Difiere → **anomalía** (`"Octavos m90: proveedor {A,B} vs topología {C,D} — revisa Admin"`), sin sobrescribir.

---

## 9. Manejo de errores / bordes

- **Resultado editado/borrado aguas arriba:** `computeAdvancement` recomputa; si un partido aguas abajo ya tenía resultado/picks y su equipo cambiaría → **anomalía**, no auto-corrige en silencio.
- **Par R32 no resoluble** (equipos fuera de `R32_BY_TEAMS`): anomalía.
- **Casillero destino con picks + equipo distinto:** no se pisa; anomalía.
- **Empate KO sin `penWinner`:** `outcome=null` → no avanza (espera penales).
- **Aislamiento:** avance y reconcile en su propio `try/catch` dentro de `runFullSync`; no rompen los goles.

---

## 10. Cambios por archivo

| Archivo | Cambio |
|---|---|
| `src/domain/bracket-topology.ts` *(nuevo)* | `R32_BY_TEAMS`, `R32_SCHEDULE`, `FEEDERS`, `r32SlotByTeams`, `winnerTarget`, `loserTarget`, `bracketRank`, `computeAdvancement`. Puro; datos 2026 hardcodeados (YAGNI). |
| `src/domain/bracket-topology.test.ts` *(nuevo)* | Fórmulas de avance por ronda; SF→3er lugar; idempotencia; **test de ancla Canadá/Marruecos → octavos 90**; orden de display; par no-resoluble → anomalía. |
| `src/domain/knockout-assign.ts` | R16+ deja de sembrarse; comparación de pares order-independent para reconcile; R32 sin cambios. |
| `src/server/services/sync.ts` | `runKnockoutAdvance` + repo; adopción de kickoff real R16+ por par; `reconcileProvider`; `runFullSync` (advance + reconcile); reset R16+ idempotente. |
| `src/server/services/sync.test.ts` | Tests de advance, reset, adopción de kickoff, reconcile, `runFullSync` ampliado. |
| `src/app/actions/results.ts` | `saveResultAction` y `clearResultAction` corren `runKnockoutAdvance`. |
| `src/components/matches/bracket/layout.ts` (+`.test.ts`) | `stageSide` ordena por `bracketRank` (no por id). |
| `src/server/email/templates.ts` (+test) | Extender aviso con avance/reconcile/anomalías. |
| `design_handoff_quiniela/js/bracket.jsx` + `store.js` | **Port:** topología + auto-avance en JS plano; recompute de `koTeams` R16+ al mutar `results`; seed demo R32 (cualquier orden) para demostrar congruencia. |

---

## 11. Pruebas

- **Puras (`bracket-topology.test.ts`):** `r32SlotByTeams('CAN','RSA')===73` (orden-indep.); `winnerTarget(73)={90,'H'}`, `winnerTarget(75)={90,'A'}`, …, `winnerTarget(101)={104,'H'}`, `loserTarget(101)={103,'H'}`; `computeAdvancement` con resultados parciales; idempotencia; **ancla: con 73→CAN y 75→MAR ganando, octavos 90 = {CAN,MAR}**; `bracketRank` reproduce el orden §6; par no-resoluble → anomalía.
- **Servicio (`sync.test.ts`):** `runKnockoutAdvance` (llena R16+ desde resultados, salta ocupados/picks, arma anomalías); reset R16+ (limpia sin-picks, respeta con-picks); adopción de kickoff por par; reconcile (coincide/difiere); `runFullSync` ampliado.
- **Acción:** captura manual de un resultado KO → el casillero padre se llena en la misma operación; borrar → se revierte.
- **Verificación visual (`verify`/`run`):** capturar ganadores R32 y ver octavos llenarse congruente; **Canadá→Marruecos en el mismo octavos** visible; conectores alineados con el orden §6.

---

## 12. Port al prototipo

- Portar `bracket-topology` a JS plano (`design_handoff_quiniela/js/`).
- `store.js`: tras mutar `st.results`, recomputar `st.koTeams` de R16+ vía `computeAdvancement` (idempotente).
- El bracket del prototipo lee `koTeams`; ordenar cajas por `bracketRank` igual que `layout.ts`.
- R32 del prototipo se siembra manual (sin proveedor); el demo puede sembrarse en cualquier orden — la resolución por contenido + `bracketRank` lo acomoda.

---

## 13. Fuera de alcance (YAGNI)

- Cambiar el esquema de Prisma o la lógica de puntaje.
- Codificar la tabla oficial de asignación de terceros (el sembrado R32 ya está resuelto; hardcodeamos el cuadro 2026).
- Sembrado R32 100% sin proveedor / re-seed a numeración oficial (innecesario y arriesgado con picks existentes).
- Abstracción genérica de torneos: los datos son **2026-específicos hardcodeados**, a propósito.
- Verificar dominio Resend (ops aparte).

---

## 14. Riesgos

- **Exactitud del árbol:** mitigado por verificación de 6 fuentes + reconciliación adversarial (no-refutada) + **test de ancla** que falla si Canadá/Marruecos no caen en el mismo octavos. La disputa de numeración X/Y no afecta cruces/topología/ancla (trabajamos por par de equipos).
- **Enlace de semifinales / 3er lugar:** confiado 101=[97,98], 102=[99,100], 104=[101,102], 103=[P101,P102]; menos crítico para el objetivo inmediato (R32→octavos).
- **Estado vivo del cron:** el reset (§7) debe verificarse contra la DB real antes de aplicar; si octavos ya tuviera picks, es manejo manual.
- **Doble fuente (auto-avance vs proveedor):** mitigado por reconciliación que avisa sin pisar.
```
