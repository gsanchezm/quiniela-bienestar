# PROMPT PARA CLAUDE CODE — Quiniela del Bienestar

Copia y pega esto en Claude Code desde la carpeta raíz de tu repo nuevo:

---

Construye una aplicación web de producción llamada **"Quiniela del Bienestar"** para dar seguimiento
a la Copa Mundial 2026 entre amigos. En la carpeta `design_handoff_quiniela/` está el **prototipo HTML
de referencia** (alta fidelidad): replica su look & feel y comportamiento, pero implementándolo con un
stack real — el prototipo NO se sube tal cual.

## Stack (se despliega en Render)
- **Next.js 14+ (App Router) + TypeScript**, en un solo Web Service de Render
- **PostgreSQL** administrado de Render + **Prisma** como ORM
- Auth con **cookies de sesión httpOnly** (o NextAuth con credenciales)
- Correos reales con **Resend** (o SMTP) para confirmación de cuenta y reset de contraseña
- Genera **render.yaml** (web service + base de datos), scripts de migración/seed y un README de despliegue
- Variables de entorno: `DATABASE_URL`, `SESSION_SECRET`, `RESEND_API_KEY`, `FOOTBALL_DATA_TOKEN` (opcional), `ADMIN_EMAILS`

## Datos
- `design_handoff_quiniela/js/data.js` contiene los **72 partidos reales de fase de grupos**
  (equipos, grupos, fechas UTC, jornadas J1/J2/J3) y 32 llaves de eliminatoria (R32→Final).
  Conviértelo en seed de la base de datos. Las horas están en UTC; muestra siempre hora local del usuario.
- Modelos: `User` (nombre, apellido, email único, passwordHash, photoUrl?, confirmed, isAdmin),
  `Match` (número, etapa, grupo?, equipos, kickoffUtc, golesLocal?, golesVisita?, ganadorPenales?),
  `Pick` (userId, matchId, valor 'H'|'D'|'A', único por usuario+partido).

## Reglas de negocio (idénticas al prototipo)
1. **Picks 1X2** (gana local / empate / gana visita) en fase de grupos; en eliminatorias solo gana A / gana B
   y los equipos de cada llave los asigna el admin cuando se definen.
2. **Cierre al silbatazo**: un pick no puede crearse/cambiarse si `now >= kickoffUtc` (validar en servidor).
3. **Puntos**: 1 punto por resultado acertado. Leaderboard ordenado por puntos, luego aciertos.
4. **Privacidad**: los picks de otros jugadores solo son visibles cuando el partido ya cerró.
5. **Resultados**: pantalla "Resultados" solo para admins (emails en `ADMIN_EMAILS`); marcadores solo
   aceptan enteros 0–99 (sin negativos). Opcional: job que sincronice marcadores desde la API gratuita
   de football-data.org si `FOOTBALL_DATA_TOKEN` existe; la captura manual siempre disponible como respaldo.

## Pantallas (ver prototipo)
1. **Landing** animada: logo (`assets/logo.png`), cuenta regresiva al partido inaugural (11-jun-2026 19:00 UTC),
   video oficial de YouTube de fondo (id `smiF90YexLY`, muted/loop, apagable), ticker de partidos, botones login/registro.
2. **Login** con carrusel de noticias (paginación numerada 1 2 3 4, autoavance 6 s) | **Registro**
   (nombre, apellido, email, contraseña — sin foto) | **Olvidé mi contraseña**. Correos de confirmación/reset reales.
3. **Partidos**: chips de etapa (J1 J2 J3 16vos 8vos 4tos Semis Final), partidos agrupados por fecha,
   tarjeta con banderas (flagcdn.com), número de partido, hora local y los 3 botones de pick; progreso "X/24 picks".
4. **Tabla**: leaderboard con avatar, aciertos y puntos; clic en jugador → sus picks partido por partido.
5. **Configuración** (clic en avatar del header): editar foto (subida, recorte cuadrado 128px), nombre, email, contraseña.

## Design tokens (tema oscuro broadcast)
- Fondos: `#121212` / paneles `#1d1d1c` / líneas `#2c2c2a`; texto `#f2f1ee` / secundario `#a39f98`
- Acento por defecto **verde del logo `#4db53c`** (alternativos: dorado `#f2b705`, naranja `#f07818`, azul `#3aa6e8`)
- Tipografías Google Fonts: **Barlow Condensed** (títulos, mayúsculas con tracking), **Archivo 800**
  (marcadores/contador, números tabulares, glow sutil del acento), **Barlow** (texto)
- Botón primario: fondo acento, texto blanco, radio 4px; aciertos en verde, fallos en rojo `#e85a4f`
- Responsivo: móvil apila los 3 botones de pick (alto mínimo 44px) y el carrusel pasa arriba del formulario

Empieza por el esquema de Prisma + seed, luego auth, luego picks/puntos, luego UI. Escribe pruebas
para el cálculo de puntos y el bloqueo por kickoff.

---
