# Spec — Quiniela del Bienestar (Mundial 2026)

**Fecha:** 2026-06-10 · **Aprobado por:** Gilberto · **Repo:** https://github.com/gsanchezm/quiniela-bienestar
**Urgencia:** el Mundial inicia el 11-jun-2026 19:00 UTC (1:00 pm CDMX); los picks de J1 se cierran al silbatazo de cada partido.

## 1. Objetivo

Aplicación web de producción para una quiniela del Mundial 2026 entre amigos: registro con
confirmación por correo, picks 1X2 + pronóstico de marcador exacto por partido (se cierran al
inicio de cada juego), puntos por acierto, tabla de posiciones en vivo y captura/sincronización
de resultados. Réplica fiel del look & feel del prototipo en `design_handoff_quiniela/`
(alta fidelidad: colores, tipografías, copys e interacciones son finales).

## 2. Stack y arquitectura

- **Next.js 15 (App Router) + TypeScript + React 19**, un solo Web Service en Render (plan **starter**).
- **PostgreSQL** de Render + **Prisma 6**. Gestor de paquetes: **pnpm**.
- CSS propio portado del prototipo (design tokens en `:root`) — sin Tailwind (KISS, fidelidad hifi).
- Pruebas con **Vitest**; metodología **spec-driven + BDD + TDD**.

### Capas (SOLID: dominio puro, servicios delgados, handlers que solo validan y delegan)

```
src/domain/      Lógica pura sin I/O: scoring, bloqueo por kickoff, validaciones zod.
src/server/      Prisma singleton, auth (bcrypt, sesiones, tokens), email, servicios, sync.
src/app/         Rutas App Router: páginas RSC + Server Actions + route handlers.
src/components/  Componentes UI (tarjeta de partido, countdown, carrusel, avatar...).
prisma/          schema.prisma, seed.ts, data/worldcup2026.ts (portado de js/data.js).
```

### Patrones (solo los que resuelven un problema real)

- **Strategy/puerto** `EmailSender`: `ResendSender` en producción, `ConsoleSender` en dev sin
  `RESEND_API_KEY` (imprime el enlace en consola). Inyección por factory según entorno.
- **Strategy/puerto** `ResultsProvider`: `FootballDataProvider` (football-data.org) detrás de una
  interfaz, con la captura manual del admin como respaldo siempre disponible.
- **Singleton** de PrismaClient (patrón estándar Next.js para evitar agotar conexiones en dev).
- Dominio = funciones puras (`computePoints`, `isLocked`, `computeStandings`) — testeables sin BD.

## 3. Modelo de datos (ver `prisma/schema.prisma`)

- `Team` (code PK, name, flag flagcdn, group A–L) — 48 selecciones.
- `Match` (id = número oficial 1–104, stage J1|J2|J3|R32|R16|QF|SF|FIN, group?, tag de llave,
  isKnockout, homeCode?/awayCode? (null en KO sin definir), kickoffUtc, homeGoals?, awayGoals?,
  penWinner? H|A).
- `User` (nombre, apellido, email único en minúsculas, passwordHash bcrypt, photo data-URL 128px
  en Postgres, color de avatar, confirmed). **Admin se deriva de `ADMIN_EMAILS`** (env, CSV) — sin columna.
- `Pick` (único por usuario+partido; `outcome` H|D|A opcional **y/o** `predHome`/`predAway` 0–99
  opcionales; al menos uno presente — validado en aplicación).
- `Session` (token aleatorio 256 bits, expiración 30 días, cookie httpOnly/secure/sameSite=lax).
- `EmailToken` (CONFIRM | RESET | EMAIL_CHANGE, expiración 24 h / 2 h / 24 h, `newEmail` para cambio).

## 4. Reglas de negocio — criterios de aceptación (BDD)

### 4.1 Picks y bloqueo al silbatazo (validación SIEMPRE en servidor)

- **Dado** un partido cuyo `kickoffUtc` es futuro, **cuando** el usuario elige H/D/A o captura un
  marcador, **entonces** se guarda y puede cambiarlo cuantas veces quiera.
- **Dado** `now >= kickoffUtc`, **cuando** intenta crear/cambiar/quitar pick o marcador,
  **entonces** el servidor rechaza con error y la UI muestra el partido bloqueado.
- **Dado** un pick activo, **cuando** el usuario vuelve a pulsar el mismo botón, **entonces** el
  pick se des-selecciona (toggle).
- **Dado** un partido de grupos, los picks válidos son H/D/A; **dado** uno de eliminatoria, solo
  H/A (gana A / gana B); **dado** una llave KO sin equipos asignados, no se puede pickear.
- **Dado** que el usuario captura un marcador sin pick 1X2 previo, **entonces** se auto-selecciona
  el pick implícito del marcador (puede cambiarlo después).
- **Dado** un marcador capturado, **cuando** contiene algo que no sea entero 0–99, **entonces**
  se rechaza (cliente y servidor); negativos prohibidos.

### 4.2 Puntos

- **Dado** un partido con resultado oficial, **cuando** el pick H/D/A del usuario coincide con el
  resultado, **entonces** gana **1 punto**.
- **Cuando** además su pronóstico de marcador coincide exactamente con el marcador oficial,
  **entonces** gana **+2 puntos extra** (máximo 3 por partido).
- **Dado** un KO empatado en tiempo regular+prórroga, **entonces** el resultado del pick es el
  ganador en penales (`penWinner`), y el marcador exacto se compara contra el marcador final del
  juego (sin penales). Ej.: real 1–1 con penales para A → pick "gana A" = 1 pt; pronóstico 1–1 = +2.
- **Dado** un usuario con marcador exacto pero sin pick 1X2 (caso extremo), gana solo los +2.
- Tabla ordenada por **puntos → aciertos (picks 1X2 correctos) → nombre alfabético**.

### 4.3 Privacidad

- **Dado** un partido no iniciado, los picks y marcadores de OTROS jugadores se muestran ocultos
  (🔒); **cuando** `now >= kickoffUtc`, se revelan. Los propios siempre visibles.
- La ocultación se aplica **en el servidor** (no se envían al cliente datos ajenos de partidos abiertos).

### 4.4 Resultados (solo admins)

- **Dado** un usuario cuyo email no está en `ADMIN_EMAILS`, el tab "Resultados" no se muestra y
  los endpoints de resultados/llaves/sync responden 403.
- Marcadores oficiales: enteros 0–99, sin negativos; KO empatado exige elegir ganador de penales.
- El admin puede borrar un resultado (recalcula puntos) y asignar/cambiar equipos de llaves KO.
- **Dado** que el admin cambia los equipos de una llave KO que ya tenía picks, **entonces** se
  **borran los picks afectados** de esa llave para que los jugadores vuelvan a elegir.

### 4.5 Cuentas y correos (Resend; pruebas a gilberto.aspros@gmail.com)

- Registro (nombre, apellido, email, contraseña ≥ 6) → correo de **confirmación**; no se puede
  iniciar sesión sin confirmar. El enlace confirma, inicia sesión y lleva a Partidos.
- **Olvidé mi contraseña** → correo con enlace de reset (expira 2 h) → formulario de nueva contraseña.
- Cambio de email en Configuración → correo de confirmación **al email nuevo**; el cambio aplica
  al confirmar. Nombre/foto/contraseña se cambian directo.
- Respuestas neutras en "olvidé mi contraseña" para no revelar si un correo existe.

### 4.6 Sincronización de resultados (football-data.org, free tier)

- Endpoint `POST /api/sync` protegido con `SYNC_SECRET` (header) o sesión de admin.
- Consulta la Copa del Mundo en football-data.org (token `FOOTBALL_DATA_TOKEN`), empareja
  partidos por equipos+fecha y guarda marcadores de partidos FINALIZADOS (incl. penales en KO).
- Botón "Sincronizar ahora" en el tab Resultados; GitHub Action programada (cada 15 min) como
  disparador automático gratuito. Si no hay token, el sync queda deshabilitado con aviso.
- El sync **no pisa** un resultado capturado manualmente distinto: el manual gana (el admin puede re-aplicar).

## 5. Pantallas (réplica del prototipo + cambios acordados)

1. **Landing**: logo, countdown LED al 11-jun 19:00 UTC, video YouTube `smiF90YexLY` de fondo
   (muted/loop, apagable, oculto con prefers-reduced-motion), ticker J1, 3 feature cards, botones.
2. **Login**: video de fondo **`fcnDmrtj6Sk`**; carrusel de noticias con avance automático cada 6 s
   **sin paginación numerada visible**; formulario correo/contraseña. | **Registro** (sin foto) |
   **Olvidé mi contraseña**. Correos reales (no pantallas simuladas).
3. **Partidos**: chips J1 J2 J3 16vos 8vos 4tos Semis Final; agrupados por fecha local; tarjeta con
   banderas flagcdn, número, hora local, 3 botones de pick **+ 2 inputs de marcador exacto**;
   progreso "X/N picks" por etapa; estados EN JUEGO/CERRADO/FINAL con ✓/✗ y puntos ganados.
4. **Tabla**: leaderboard (avatar, aciertos, puntos, medallas top 3, "(tú)"); clic en jugador →
   sus picks y marcadores partido por partido (ajenos ocultos hasta el cierre).
5. **Configuración** (avatar del header): foto (subida con recorte cuadrado client-side a 128px),
   nombre, apellido, email (re-confirmación), contraseña.

Design tokens del prototipo: fondos `#121212`/`#1d1d1c`/`#2c2c2a`, texto `#f2f1ee`/`#a39f98`,
acento fijo `#4db53c`, error `#e85a4f`; Barlow Condensed / Archivo 800 / Barlow (Google Fonts);
botones radio 4px; móvil: picks apilados (≥44 px alto), carrusel arriba del formulario.
Sin panel de Tweaks, sin usuarios demo, sin "Simular J1", sin reloj adelantado.

## 6. Seguridad

- Contraseñas bcrypt (cost 12). Sesiones en BD revocables; cookie httpOnly+secure+sameSite=lax.
- Tokens de correo aleatorios (256 bits), un solo uso, con expiración.
- Toda mutación valida sesión + reglas en servidor (zod en límites). Server Actions/route handlers.
- Sin enumeración de correos en reset. Subida de foto: límite ~200 KB de data-URL, tipo JPEG forzado.

## 7. Deploy (Render, plan starter)

- `render.yaml`: web service Node (build `pnpm install && pnpm build`, start
  `pnpm db:migrate && pnpm start`... migración como preDeploy) + Postgres starter.
- Env vars: `DATABASE_URL`, `SESSION_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`,
  `FOOTBALL_DATA_TOKEN` (opcional), `ADMIN_EMAILS`, `SYNC_SECRET`, `APP_URL`.
- Seed idempotente de 48 equipos + 104 partidos (`prisma/seed.ts`).
- `.github/workflows/sync.yml`: cron cada 15 min (11-jun → 19-jul) → `POST $APP_URL/api/sync`.
- README con pasos de despliegue, alta en Resend y football-data.org.

## 8. Estrategia de pruebas (TDD/BDD)

- **Dominio (test primero, cobertura completa):** `scoring` (1 pt, +2 exactos, penales KO, sin pick,
  bordes), `isLocked`, orden de standings con desempates, validación de marcadores 0–99.
- **Servicios:** picks (bloqueo por kickoff en servidor, toggle, KO sin equipos, auto-pick desde
  marcador), resultados (borrado de picks al cambiar llave), sync (matching y no-pisar-manual)
  — con Prisma simulado o capa de repositorio mínima.
- Nombres de tests en estilo BDD: `describe('puntos') → it('da 3 puntos cuando el marcador exacto coincide')`.
- Gate: `pnpm test` y `pnpm build` verdes antes de cada commit de fase.

## 9. Fuera de alcance (YAGNI)

Notificaciones push/recordatorios, chat, premios/pagos, múltiples quinielas/ligas, i18n (solo es-MX),
puntos en vivo durante el partido, panel de Tweaks, modo claro.
