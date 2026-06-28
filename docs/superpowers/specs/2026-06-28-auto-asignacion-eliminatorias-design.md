# Spec — Auto-asignación de equipos de eliminatoria

**Fecha:** 2026-06-28
**Estado:** Aprobado para implementar (sujeto a revisión de spec)
**Relacionado:** [[quiniela-knockout-teams]] (memoria), `scripts/assign-r32.ts`, `src/domain/r32-assign.ts`, `docs/superpowers/specs/2026-06-22-bracket-eliminatorias-design.md`

## Contexto y motivación

Los partidos de eliminatoria (R32→FIN, ids 73–104) se siembran **sin equipos** (`homeCode/awayCode = null`) y nada automático los llena: el sync de football-data (`runSync`) solo escribe **marcadores** de partidos que YA tienen equipos, y el proveedor filtra `status === 'FINISHED'`. Hasta hoy los cruces se asignaban a mano (Admin → fase KO → menús; decisión deliberada de la spec del bracket: avance manual, YAGNI).

El 28-jun se llenaron los 16vos con un script masivo de un solo uso (`scripts/assign-r32.ts`). Pero el admin **no estará disponible** para las rondas siguientes (octavos 4-jul, cuartos, semis, final). Verificamos en vivo que **football-data publica los cruces de cada ronda con equipos reales por anticipado** (fases `LAST_32`, `LAST_16`, `QUARTER_FINALS`, `SEMI_FINALS`, `THIRD_PLACE`, `FINAL`). Por lo tanto la asignación se puede automatizar de forma confiable.

## Objetivo

Cada 15 min (cron existente), llenar automáticamente las llaves KO **vacías** con los cruces publicados por football-data, sin intervención humana, y avisar por correo al admin cuando se asignan cruces nuevos (o cuando hay una anomalía). El modelo elegido por el usuario es **auto-fill + aviso por correo** (hands-off con red de seguridad).

## Arquitectura

Enfoque: **extender el sync de 15 min existente** (no crear infra nueva). Una orquestación `runFullSync` reemplaza la llamada directa a `runSync` en los dos disparadores actuales: el endpoint `POST /api/sync` (cron de GitHub, Bearer `SYNC_SECRET`) y el botón de admin (`syncNowAction`).

### Flujo de datos

```
cron (15m) / botón admin → runFullSync(deps, now):
  1. all = provider.fetchAll()                    ← UNA sola llamada HTTP (rate limit 10/min)
  2. syncSummary  = runSync(syncRepo, selectFinished(all))            ← goles (sin cambios)
  3. assignResult = runKnockoutAutoAssign(assignRepo,
                       selectKnockoutFixtures(all), now)              ← llena llaves KO vacías
  4. si assignResult.assigned.length || assignResult.anomalies.length:
        sender.send(adminEmails, knockoutAssignedEmail(assignResult)) ← correo (best-effort)
  5. devolver { sync: syncSummary, assign: assignResult }
```

`fetchFinished()` se refactoriza para derivarse de `fetchAll()` (mismo contrato; `runSync` no cambia). Una sola llamada sirve para goles y para asignación.

### Inyección de dependencias

`runFullSync` recibe un objeto `deps` para ser testeable con fakes:

```ts
interface FullSyncDeps {
  provider: ResultsProvider;     // fetchAll()
  syncRepo: SyncRepo;            // goles (existente)
  assignRepo: KnockoutAssignRepo; // llaves KO
  sender: EmailSender;           // Resend (existente)
  adminEmails: string[];         // env.adminEmails
}
```

El endpoint y la action construyen `deps` con las implementaciones reales de Prisma/Resend; los tests pasan fakes.

## Componente puro: `src/domain/knockout-assign.ts`

Se **generaliza y renombra** el actual `src/domain/r32-assign.ts` (que solo cubría R32) a todas las rondas KO. El script `scripts/assign-r32.ts` se actualiza para importar del módulo nuevo (sigue funcionando como herramienta manual "break-glass").

### Mapeo de fases (verificado en vivo)

| football-data | Nuestra `Stage` | Llaves (ids) |
|---|---|---|
| `LAST_32` | `R32` | 73–88 (16) |
| `LAST_16` | `R16` | 89–96 (8) |
| `QUARTER_FINALS` | `QF` | 97–100 (4) |
| `SEMI_FINALS` | `SF` | 101–102 (2) |
| `THIRD_PLACE` | `FIN` | 103 (tag `/tercer/i`) |
| `FINAL` | `FIN` | 104 |

### Algoritmo `planKnockoutAssignments(fixtures, llaves, knownCodes, now)`

Diseñado para tolerar **publicación incremental** (football-data puede revelar los cruces de una ronda de a poco, conforme terminan los partidos que alimentan cada llave). Por eso **no** se exige que la ronda esté completa ni se empareja por posición: cada cruce conocido se coloca en un casillero vacío de su ronda, con dedup por par de equipos para ser idempotente.

1. Mapear cada fixture a nuestra `Stage` (tabla de arriba) conservando la sub-fase del proveedor; descartar fases no-KO o fixtures sin ambos equipos.
2. **Agrupar por nuestra `Stage`** y procesar cada ronda **independientemente** (un problema en una ronda no afecta a las demás).
3. **Colocación por ronda** (procesando fixtures en orden de `utcDate` para determinismo):
   - **R32, R16, QF, SF** — los casilleros son decorativos: cada cruce nuevo va al casillero **vacío de menor `id`** de esa ronda.
   - **FIN** — los dos casilleros están etiquetados: el fixture `THIRD_PLACE` va a la llave con `tag` `/tercer/i` (103) y `FINAL` a la otra (104).
4. Estado por llave: `assign` (vacía → se llena), `unchanged` (ya tenía ese par → se omite, idempotente), `occupied` (ya tenía OTROS equipos → **no se toca** en modo auto), `locked` (ya inició → no se toca).
5. **Validaciones por ronda** (si una falla, se reporta como anomalía y ese cruce/ronda NO se escribe; el resto sigue):
   - todo TLA del proveedor debe existir en `knownCodes`;
   - un equipo no puede aparecer en dos cruces distintos de la misma ronda (conflicto);
   - si quedan cruces nuevos pero ya no hay casilleros vacíos en esa ronda (más cruces que llaves) → anomalía.
   - Nota: que falten cruces (ronda parcial) **no** es anomalía — simplemente se llenan los conocidos y el resto entra en un tick posterior.
6. Devolver `{ rows: PlanRow[], anomalies: string[] }`.

La hora que queda en cada `PlanRow.kickoffUtc` es la **real del proveedor** (decisión aprobada: el casillero está vacío, sin picks, así que adoptar la hora correcta no mueve ningún cierre).

## Servicio: `runKnockoutAutoAssign(repo, fixtures, now)`

Impuro mínimo (orquesta el planner + el repo). Modo **auto = conservador**: solo escribe filas con estado `assign` (jamás `occupied`; eso queda para el admin manual / `--force` del script).

```ts
interface KnockoutAssignRepo {
  getKnockoutLlaves(): Promise<Llave[]>;                    // KO: id, stage, tag, homeCode, awayCode, kickoffUtc
  assignTeams(id: number, home: string, away: string, kickoffUtc: Date): Promise<void>;
}
interface KnockoutAssignResult {
  assigned: Array<{ matchId: number; stage: string; homeCode: string; awayCode: string }>;
  anomalies: string[];
}
```

Idempotente: una vez asignada una llave deja de estar vacía → corridas siguientes la ven `unchanged` y no hacen nada.

## Notificación: `knockoutAssignedEmail`

Nueva plantilla en `src/server/email/templates.ts` (junto a las de confirmación). El correo lista los cruces recién asignados por ronda y, si hubo anomalías, las enumera ("revisa Admin → fase X"). Se envía a `env.adminEmails`.

**Cuándo se envía:** solo si `assigned.length > 0` **o** `anomalies.length > 0`. El caso normal "la siguiente ronda aún no se sortea" (cero fixtures KO con equipos) es **silencioso** (no spam). El envío es **best-effort**: si Resend falla, se loguea y NO rompe el sync (igual que el registro tolera fallo de correo).

⚠️ **Límite conocido:** Resend está en sandbox, así que el correo solo se entrega a la dirección dueña de la cuenta (gilberto.aspros@gmail.com) hasta que se verifique un dominio. Es el admin, así que cumple el objetivo.

## Cambios en archivos

| Archivo | Cambio |
|---|---|
| `src/domain/knockout-assign.ts` | Renombrar desde `r32-assign.ts` y generalizar a todas las rondas (mapeo de fases, agrupado por ronda, validación por ronda). |
| `src/domain/knockout-assign.test.ts` | Renombrar/extender tests: cada ronda, caso FIN (tercer vs final), solo-vacíos, lock, anomalía por ronda, idempotencia. |
| `src/server/services/sync.ts` | `fetchAll()` + `selectFinished`/`selectKnockoutFixtures`; `runKnockoutAutoAssign`; `runFullSync`; `prismaKnockoutAssignRepo`. |
| `src/server/services/sync.test.ts` | Tests de selectores, `runKnockoutAutoAssign` con repo falso, y `runFullSync` con deps falsas (incluye gatillo de correo). |
| `src/server/email/templates.ts` (+ `.test.ts`) | `knockoutAssignedEmail` + test de render. |
| `src/app/api/sync/route.ts` | Llamar a `runFullSync` en vez de `runSync`. |
| `src/app/actions/results.ts` | `syncNowAction` llama a `runFullSync`; el resumen devuelto incluye `assign`. |
| `src/components/admin/AdminScreen.tsx` | Mostrar también el resumen de auto-asignación (cuántas llaves se llenaron). |
| `scripts/assign-r32.ts` | Importar del módulo generalizado; sin cambios de comportamiento. |

## Manejo de errores / bordes

- **Aislamiento:** la auto-asignación va en su propio `try/catch` dentro de `runFullSync`; si truena, los goles (`runSync`) igual se procesan, y viceversa.
- **Por ronda independiente:** una anomalía en octavos no bloquea cuartos.
- **football-data caído / 429:** se propaga como hoy (el endpoint responde error); no se escribe nada.
- **Draw no publicado:** cero fixtures KO con equipos → no-op silencioso.
- **Correo:** best-effort, nunca rompe el sync.

## Pruebas

- **Puras** (`knockout-assign.test.ts`): mapeo de cada fase; colocación en casillero vacío por ronda; **ronda parcial** (4 de 8 cruces → se llenan 4, sin anomalía); FIN tercer-lugar/final por `tag` (no por orden); estados assign/occupied/locked/unchanged; validaciones por ronda (TLA desconocido, equipo en dos cruces, más cruces que casilleros); idempotencia (re-correr no re-asigna); adopción de hora del proveedor.
- **Servicio** (`sync.test.ts`): `selectFinished`/`selectKnockoutFixtures` desde un payload de football-data; `runKnockoutAutoAssign` con repo falso (asigna solo vacías, salta occupied/locked, arma `assigned`/`anomalies`); `runFullSync` con deps falsas (manda correo solo cuando hay novedades/anomalías; tolera fallo de Resend; aísla fallos entre goles y asignación).
- **Correo** (`templates.test.ts`): render de `knockoutAssignedEmail` con cruces + anomalías.
- **Verificación manual:** correr el sync con un payload real (o el endpoint en prod) y comprobar que octavos se llena solo cuando football-data lo publica.

## Fuera de alcance

- Cambiar el esquema de Prisma o la lógica de puntaje.
- Auto-avance de ganadores por la topología del cuadro (sigue llenando casilleros planos; el bracket es decorativo).
- Flujo de aprobación de "1 toque" (se evaluó y se descartó: choca con hands-off).
- Canales SMS/WhatsApp; verificar dominio en Resend (tarea de ops aparte).
- Re-asignar o corregir llaves que ya tienen equipos/picks (eso queda manual en Admin; modo auto nunca pisa).

## Riesgos

- **football-data como única fuente sin revisión previa:** mitigado porque solo llena vacías (nunca pisa), usa la fuente oficial, y avisa por correo para revisión posterior. Si publicara un cruce erróneo transitorio y se llenara, no se auto-corrige (regla solo-vacías) — el admin lo ajusta a mano. Tradeoff aceptado a cambio de hands-off.
- **Códigos de fase:** verificados en vivo (bajo riesgo); si cambiaran, el módulo es puro y fácil de ajustar.
- **Sandbox de Resend:** el aviso solo llega a una dirección hasta verificar dominio (aceptable: es el admin).
