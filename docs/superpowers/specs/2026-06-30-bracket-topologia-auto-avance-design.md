# Spec — Topología oficial del cuadro + auto-avance de ganadores

**Fecha:** 2026-06-30
**Estado:** Borrador para revisión del usuario
**Relacionado:**
- `docs/superpowers/specs/2026-06-22-bracket-eliminatorias-design.md` (dejó pendiente: *"Mapeo oficial FIFA de llaves"* y *"Sin auto-avance de ganadores"*)
- `docs/superpowers/specs/2026-06-28-auto-asignacion-eliminatorias-design.md` (dejó fuera: *"Auto-avance de ganadores por la topología del cuadro"*)
- `[[quiniela-knockout-teams]]` (memoria)
- Archivos: `src/domain/knockout-assign.ts`, `src/components/matches/bracket/layout.ts`, `src/server/services/sync.ts`, `src/data/worldcup2026.ts`, `design_handoff_quiniela/js/bracket.jsx`

Este spec es el **sucesor planeado** de los dos specs anteriores: aterriza el mapeo oficial FIFA y el auto-avance que ambos pospusieron.

---

## 1. Contexto y problema

En el tab **Partidos**, las fases KO se ven como un cuadro tipo torneo (`KnockoutBracket`). El usuario reporta que **las líneas de avance no son congruentes**: parece que el ganador de la Llave 1 (Sudáfrica vs Canadá) jugaría octavos contra el ganador de la Llave 2 (Brasil vs Japón), pero en el torneo real Canadá ya ganó y juega contra **Marruecos** (que en la app cayó en la Llave 4).

### Diagnóstico de raíz

Dos piezas lo causan, y el código lo admite en sus propios comentarios:

1. **El sembrado de R32 está descuadrado respecto a la numeración oficial.** `planKnockoutAssignments` → `pickTarget` coloca cada cruce del proveedor en *"el casillero vacío de menor `id`"*, procesando los fixtures **en orden de hora de inicio**. Es decir: los equipos se siembran por horario, no por su **número oficial de partido FIFA**. Evidencia: el partido oficial **73 es Alemania vs Paraguay**, pero en la app cayó en la **Llave 3** (m75).

2. **La geometría del cuadro NO está mal.** `layout.ts` reparte lado izquierdo = `slice(0, n)` (partidos 73–80) y derecho = `slice(n)` (81–88), con conectores que unen "caja de arriba + caja de abajo → siguiente".

El árbol oficial del Mundial 2026 (fuente: Wikipedia, *2026 FIFA World Cup knockout stage*) es **emparejamiento consecutivo**, que **calza exactamente** con esa geometría:

```
Octavos: 89=G73/G74  90=G75/G76  91=G77/G78  92=G79/G80
         93=G81/G82  94=G83/G84  95=G85/G86  96=G87/G88
Cuartos: 97=G89/G90  98=G91/G92  99=G93/G94  100=G95/G96
Semis:   101=G97/G98 102=G99/G100
Final:   104=G101/G102      3er lugar: 103=P101/P102      (G=ganador, P=perdedor)
```

**Conclusión:** el cuadro ya está bien dibujado. El bug es que los equipos están en la **llave equivocada** (sembrado por horario en vez de por número oficial), y que **no existe auto-avance** (R16+ se llenan por el proveedor, sin reflejar la topología). Por eso Canadá (en realidad oficial vecino de Marruecos, mismo octavos 89) terminó en una llave no vecina.

> Nota: los enfrentamientos que muestra la imagen son reales (Países Bajos vs Marruecos, Francia vs Suecia, etc.); lo único incorrecto es **en qué casillero numerado** quedó cada uno.

---

## 2. Objetivo

Que el cuadro sea **congruente con el torneo real** y se mantenga solo:

1. **Sembrar R32 en su llave oficial** → las líneas quedan congruentes (la geometría existente ya es correcta).
2. **Llenar octavos ya** con los ganadores definidos.
3. **Cascada automática e instantánea**: en cuanto un partido KO tiene ganador (capturado a mano o por sync de goles), su ganador aparece en el casillero del siguiente partido — octavos, luego cuartos, semis, final — sin esperar al proveedor.

Decisiones ya tomadas con el usuario:

| Tema | Decisión |
|---|---|
| Alcance | App real `src/` primero, luego **portar al prototipo** `design_handoff_quiniela`. |
| Fuente de avance R16+ | **Auto-cómputo instantáneo**: la topología es la verdad para R16+. El proveedor solo trae **goles** y el **sembrado de R32**. |
| Mapeo de sembrado R32 | Casar el fixture del proveedor con su llave oficial **por horario/sede oficial del partido**. |

---

## 3. Arquitectura: un solo artefacto de topología

Núcleo nuevo: **`src/domain/bracket-topology.ts`** — módulo PURO, indexado por número de partido (= nuestro `id`, que ya coincide 1:1 con la FIFA: R32 73–88, R16 89–96, QF 97–100, SF 101–102, 3.º 103, Final 104). De él se derivan las tres peticiones.

Expone:

```ts
// Calendario oficial de R32 para sembrar por horario/sede (valores exactos: ver §7).
export interface R32Slot { matchId: number; utc: string; venue: string }
export const R32_SCHEDULE: R32Slot[]; // 16 filas, matchId 73..88

// Avance: dado un partido KO con ganador, a qué casillero del padre va.
export type Slot = 'H' | 'A';
export interface AdvanceTarget { parentId: number; slot: Slot } // ganador
export interface LoserTarget  { parentId: number; slot: Slot } // solo SF → 3er lugar

export function winnerTarget(matchId: number): AdvanceTarget | null;
export function loserTarget(matchId: number): LoserTarget | null; // null salvo 101/102
```

Fórmulas (puras, sin tabla larga):

- **Ganador** de `M`:
  - R32 (73–88): `parentId = 89 + ⌊(M−73)/2⌋`; `slot = (M−73) par ? 'H' : 'A'`
  - R16 (89–96): `parentId = 97 + ⌊(M−89)/2⌋`; `slot = (M−89) par ? 'H' : 'A'`
  - QF (97–100): `parentId = 101 + ⌊(M−97)/2⌋`; `slot = (M−97) par ? 'H' : 'A'`
  - SF (101–102): `parentId = 104` (Final); `slot = M===101 ? 'H' : 'A'`
- **Perdedor** de SF (101–102): `parentId = 103` (3.º lugar); `slot = M===101 ? 'H' : 'A'`
- Final (104) y 3.º (103): sin padre (`null`).

> Verificación obligatoria (§8): un test de ancla debe confirmar que **Canadá y Marruecos terminan alimentando el mismo octavos**.

---

## 4. Cómo se siembra R32 (por horario/sede)

`R32_SCHEDULE` guarda, por `matchId` oficial (73..88), el **UTC y la sede oficial** de ese partido. El sembrado deja de ser "primer casillero libre" y pasa a ser **determinista por número oficial**:

- Para cada fixture R32 del proveedor, se busca la fila de `R32_SCHEDULE` cuyo `utc` casa (±tolerancia) — con `venue` como desempate si dos partidos coincidieran en hora — y se asigna ese par de equipos a esa `matchId`.
- Sigue siendo **conservador**: solo escribe casilleros vacíos; nunca pisa equipos ya asignados ni con picks; tolera publicación parcial (los que falten entran en un tick posterior).

Esto reutiliza el sembrado oficial que la FIFA ya resolvió (incluida la asignación de terceros), sin que nosotros codifiquemos la tabla de terceros.

### Cambio en `knockout-assign.ts`

- **R32:** `pickTarget` para R32 se reemplaza por `matchByOfficialSchedule(fixture, R32_SCHEDULE)`.
- **R16/QF/SF:** dejan de sembrarse desde el proveedor (ahora las llena el auto-avance, §5). El planner ya **no** coloca cruces de esas rondas; en su lugar se usan para **reconciliación** (§6).
- **FIN:** sin cambio (tercer/final por `tag`), pero esos casilleros normalmente ya los llenó el auto-avance.

---

## 5. Auto-avance (R16 → Final)

Función PURA nueva en `bracket-topology.ts` (o módulo hermano `knockout-advance.ts`):

```ts
export interface AdvanceInput {
  id: number; stage: string;
  homeCode: string | null; awayCode: string | null;
  outcome: 'H' | 'A' | null;     // ganador KO (ya resuelto, incl. penales)
}
export interface AdvanceWrite { matchId: number; slot: 'H' | 'A'; teamCode: string }

// Deriva TODOS los casilleros R16+ que se pueden llenar desde los resultados actuales.
export function computeAdvancement(matches: AdvanceInput[]): AdvanceWrite[];
```

- Para cada partido con `outcome`, calcula `winnerTarget`/`loserTarget` y produce el código de equipo ganador/perdedor a escribir en el casillero del padre.
- Es **idempotente** y **recomputable**: se corre completo tras cualquier cambio de resultado; si un resultado se edita/borra, el recálculo actualiza aguas abajo.
- **Conservador en la escritura**: el writer aplica un `AdvanceWrite` solo si el casillero está vacío o contiene un valor previamente auto-derivado; **nunca** pisa un casillero que ya tiene picks/lock con un equipo distinto (en ese borde reporta anomalía, no sobrescribe — §6).

### Disparadores

El auto-avance debe correr en **ambos** caminos por los que entra un resultado:

1. **Captura manual** (Admin): `saveResultAction` / servicio de resultados → tras escribir el resultado, ejecutar el avance.
2. **Sync** (cron 15 min / botón): dentro de `runFullSync`, después de `runSync` (goles).

Servicio impuro mínimo `runKnockoutAdvance(repo, ...)` (paralelo a `runKnockoutAutoAssign`): lee partidos KO + resultados, llama `computeAdvancement`, aplica writes conservadores, devuelve `{ advanced, anomalies }`.

### Integración en `runFullSync`

```
runFullSync(deps, now):
  1. all  = provider.fetchAll()
  2. sync = runSync(syncRepo, selectFinished(all))                 ← goles (incl. KO)
  3. assignR32 = runKnockoutAutoAssign(...)  ← AHORA: solo R32, por horario/sede oficial
  4. advance   = runKnockoutAdvance(...)     ← NUEVO: llena R16+ desde resultados+topología
  5. reconcile = reconcileProvider(selectKnockoutFixtures(all) R16+, estado)  ← cross-check (§6)
  6. email si (assignR32 | advance | reconcile) tienen novedades/anomalías
```

---

## 6. Reconciliación (red de seguridad, hereda filosofía del spec 06-28)

El proveedor sigue publicando los cruces de R16+ con equipos reales. Ya **no** los usamos para llenar, pero sí como **verificación cruzada**:

- Para cada fixture R16+ del proveedor, comparar su par de equipos contra el casillero que nuestro auto-avance llenó, **como conjunto (sin importar orden home/away)**.
- Si coinciden → ok. Si **difieren** → anomalía (`"Octavos X: el proveedor publica {A,B} pero la topología derivó {C,D} — revisa Admin"`), **sin** sobrescribir.
- Nuestro orden home/away canónico = el de la topología (menor número de partido = local). Esto evita el falso positivo de `pairKey` sensible al orden que tiene hoy `knockout-assign`.

Esto atrapa errores de sembrado/topología o correcciones del proveedor, manteniendo el modelo "auto + aviso por correo".

---

## 7. Datos oficiales a fijar en implementación (no de memoria)

Las fuentes secundarias se **contradicen** en la numeración exacta de R32, así que estos valores se sacan de fuente autoritativa (Wikipedia *knockout stage* / calendario oficial FIFA) y se fijan **con tests** durante la implementación:

1. **`R32_SCHEDULE`** (16 filas): `matchId` oficial → `utc` + `venue` reales.
2. Confirmar que los `utc` de los 16 partidos R32 son **distintos** (si lo son, `venue` es solo respaldo).
3. **Test de ancla:** con el sembrado oficial + el árbol, **Canadá y Marruecos co-alimentan el mismo octavos**.

El árbol de avance (§3) ya está confirmado y es estable (emparejamiento consecutivo).

---

## 8. Cambios por archivo

| Archivo | Cambio |
|---|---|
| `src/domain/bracket-topology.ts` *(nuevo)* | `R32_SCHEDULE`, `winnerTarget`, `loserTarget`, `computeAdvancement`. Puro. |
| `src/domain/bracket-topology.test.ts` *(nuevo)* | Fórmulas de avance por ronda; perdedor SF→3.º; idempotencia; **test de ancla** Canadá/Marruecos. |
| `src/domain/knockout-assign.ts` | R32: sembrar por `R32_SCHEDULE` (horario/sede) en vez de menor-id. Quitar colocación R16+ (pasa a reconcile). Comparación de pares **order-independent**. |
| `src/domain/knockout-assign.test.ts` | Ajustar: R32 por horario/sede; ya no coloca R16+; reconcile. |
| `src/server/services/sync.ts` | `runKnockoutAdvance` + repo; `reconcileProvider`; `runFullSync` paso 4–5; correo incluye avance/reconcile. |
| `src/server/services/sync.test.ts` | Tests de avance con repo falso, reconcile, y `runFullSync` ampliado. |
| `src/app/actions/results.ts` | Tras guardar resultado manual, ejecutar `runKnockoutAdvance` (avance instantáneo). |
| `src/components/matches/bracket/layout.ts` | Confirmar orden por `id` = orden oficial (sin cambio funcional; el orden ya es correcto una vez sembrado bien). |
| `src/server/email/templates.ts` (+test) | Extender `knockoutAssignedEmail` (o nueva sección) para avance/reconcile. |
| `design_handoff_quiniela/js/bracket.jsx` + `store.js` | **Port:** topología + auto-avance en JS plano; recompute de `koTeams` R16+ al mutar `results`. Seed demo de R32 en orden oficial para demostrar congruencia. |

---

## 9. Manejo de errores / bordes

- **Resultado editado/borrado:** `computeAdvancement` recomputa todo; aguas abajo se actualiza. Si un partido posterior ya tenía resultado y su equipo cambia → **anomalía** (no se auto-corrige en silencio), se avisa.
- **Casillero con picks + equipo distinto:** no se pisa; anomalía.
- **Empate KO sin `penWinner`:** `outcome` es `null` → no avanza (espera el ganador por penales).
- **Aislamiento:** avance y reconcile en su propio `try/catch` dentro de `runFullSync`; su fallo no rompe los goles.
- **Sembrado R32 parcial:** los que falten entran en ticks posteriores (no es anomalía).
- **Colisión de horario en `R32_SCHEDULE`:** desempate por `venue`; si aún ambiguo → anomalía.

---

## 10. Pruebas

- **Puras (`bracket-topology.test.ts`):** `winnerTarget` para cada rango (73→89H, 74→89A, …, 100→102A); `loserTarget` 101→103H/102→103A; `computeAdvancement` con resultados parciales; idempotencia; **ancla Canadá/Marruecos mismo octavos**.
- **Sembrado (`knockout-assign.test.ts`):** R32 casado por horario/sede a la `matchId` correcta; orden home/away order-independent; conservador (no pisa).
- **Servicio (`sync.test.ts`):** `runKnockoutAdvance` con repo falso (llena R16+ desde resultados, salta ocupados, arma anomalías); `reconcileProvider` (coincide / difiere); `runFullSync` ampliado (avance tras goles, correo con novedades).
- **Acción:** captura manual de un resultado KO → el siguiente casillero se llena en la misma operación.
- **Verificación visual (skill `verify`/`run`):** capturar ganadores de R32 y ver octavos llenarse congruente; el ancla Canadá→Marruecos visible.

---

## 11. Fuera de alcance (YAGNI)

- Cambiar el esquema de Prisma o la lógica de puntaje.
- Codificar la tabla oficial de asignación de terceros (lo resuelve el proveedor vía `R32_SCHEDULE`).
- Sembrado de R32 100% sin proveedor (se evaluó como enfoque B; se eligió A).
- Animaciones nuevas del cuadro (ya existen del spec 06-22).
- Verificar dominio Resend (ops aparte; el correo sigue llegando solo al admin en sandbox).

---

## 12. Riesgos

- **Exactitud de `R32_SCHEDULE`:** es el dato crítico. Mitigación: sacarlo de fuente autoritativa + **test de ancla** que falla si el sembrado no produce Canadá vs Marruecos. No se codifica de memoria.
- **Doble fuente (auto-avance vs proveedor):** mitigado por la reconciliación que avisa diferencias sin pisar.
- **Disparo en captura manual:** hay que asegurar que `saveResultAction` corre el avance sin romper el flujo actual de resultados (test de acción).
