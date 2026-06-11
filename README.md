# Quiniela del Bienestar — Mundial 2026 ⚽

Quiniela entre amigos para la Copa Mundial 2026: registro con confirmación por correo,
picks **gana/empata/gana** + **pronóstico de marcador exacto** por partido (se cierran al
silbatazo inicial), **1 punto** por resultado acertado y **+2** por marcador exacto, tabla
de posiciones en vivo y captura/sincronización de resultados para administradores.

**Stack:** Next.js 15 (App Router) · TypeScript · PostgreSQL + Prisma · Resend · Vitest · pnpm.
El diseño replica el prototipo hifi de `design_handoff_quiniela/`.

## Desarrollo local

Requisitos: Node 20+, pnpm 11, una base PostgreSQL.

```bash
pnpm install
copy .env.example .env        # y edita DATABASE_URL, ADMIN_EMAILS, etc.
pnpm exec prisma migrate deploy
pnpm db:seed                  # 48 selecciones + 104 partidos reales
pnpm dev                      # http://localhost:3000
```

- Sin `RESEND_API_KEY`, los correos (confirmación, reset, cambio de email) **se imprimen en
  la consola del servidor** con su enlace — el flujo completo funciona en dev.
- `pnpm test` corre la suite unitaria (dominio de puntos, cierre por kickoff, privacidad, servicios, sync).
- `pnpm test:e2e` corre la suite Playwright (happy paths, sad paths y responsive móvil/escritorio).
  Necesita el Postgres local corriendo (`pnpm exec prisma dev --name quiniela`, migrado y con seed)
  y Chromium instalado (`pnpm exec playwright install chromium`); el server de Next lo levanta sola.
- `pnpm build` compila producción.

## Despliegue en Render (blueprint)

1. Sube el repo a GitHub (`https://github.com/gsanchezm/quiniela-bienestar`).
2. En Render: **New → Blueprint** y elige el repo; `render.yaml` crea el web service
   (plan starter) y el PostgreSQL (plan basic-256mb). La migración y el seed corren solos
   en cada deploy (`preDeployCommand`).
3. Completa las variables marcadas `sync: false` en el dashboard:

| Variable | Valor |
| --- | --- |
| `ADMIN_EMAILS` | correos de administradores separados por coma (p. ej. `gilberto.aspros@gmail.com`) |
| `RESEND_API_KEY` | API key de [resend.com](https://resend.com) |
| `EMAIL_FROM` | remitente verificado, p. ej. `Quiniela del Bienestar <no-reply@tudominio.mx>` |
| `APP_URL` | URL pública, p. ej. `https://quiniela-bienestar.onrender.com` |
| `FOOTBALL_DATA_TOKEN` | (opcional) token de football-data.org para el sync |

`SESSION_SECRET` y `SYNC_SECRET` se generan solos.

### Correos (Resend)

- Con dominio propio: verifícalo en Resend y usa `EMAIL_FROM` con ese dominio.
- Sin dominio: usa `EMAIL_FROM="Quiniela <onboarding@resend.dev>"`; en ese modo Resend solo
  entrega al correo dueño de la cuenta — suficiente para probar con tu propio correo.

### Sincronización automática de marcadores

- El free tier de [football-data.org](https://www.football-data.org) incluye la Copa del Mundo
  (10 req/min, marcadores con un pequeño retraso). Regístrate, copia tu token a
  `FOOTBALL_DATA_TOKEN` y el botón **“Sincronizar”** del tab Resultados queda habilitado.
- Para que corra sola sin pagar el Cron de Render, el workflow `.github/workflows/sync.yml`
  llama a `POST /api/sync` cada 15 minutos durante el Mundial. Configura en GitHub
  (**Settings → Secrets and variables → Actions**) los secrets `APP_URL` y `SYNC_SECRET`
  (cópialos de Render).
- La captura manual del admin siempre está disponible y **el sync nunca pisa un resultado
  capturado a mano**.

## Reglas de la quiniela

1. Picks 1X2 en fase de grupos; en eliminatorias solo *gana A / gana B* (los equipos de cada
   llave los asigna el admin al definirse; si los cambia, los picks de esa llave se borran).
2. **Cierre al silbatazo**: nada se puede crear/cambiar desde `kickoff` (validado en servidor).
3. **Puntos**: 1 por resultado acertado; marcador exacto +2 (en KO compara el marcador del
   juego; los penales solo deciden al ganador del pick).
4. **Privacidad**: los picks ajenos se revelan hasta que cada partido cierra (filtrado en servidor).
5. **Resultados**: pantalla solo-admin (`ADMIN_EMAILS`); marcadores enteros 0–99, sin negativos.

## Guardrails de seguridad

- **Headers**: CSP estricta (solo flagcdn, YouTube embebido y `data:` para fotos), HSTS,
  `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy y Permissions-Policy en toda respuesta.
- **Rate limiting** en memoria: login 5/15 min por IP+correo (se libera al entrar), registro 5/h,
  "olvidé mi contraseña" 3/15 min, reset 5/15 min.
- **Sesiones**: cookie httpOnly/secure/lax; tokens de 256 bits **hasheados en BD**; restablecer la
  contraseña revoca todas las sesiones y cambiarla desde el perfil cierra los demás dispositivos.
- **Sin fugas por timing**: el login verifica un hash señuelo cuando el correo no existe y el
  `SYNC_SECRET` se compara en tiempo constante.
- **Validación en servidor** con zod en cada mutación (marcadores 0–99, foto solo JPEG ≤ 200 KB,
  picks bloqueados por kickoff o resultado existente) y server actions con payload ≤ 1 MB.
- Respuestas neutras en recuperación de contraseña (no revela correos registrados).

## Estructura

```
src/domain/     Lógica pura con TDD: puntos, cierre, tabla, validaciones zod
src/server/     Prisma, sesiones httpOnly, tokens, correo (Resend/consola), servicios, sync
src/app/        Rutas App Router + Server Actions
src/components/ UI (tarjetas de partido, carrusel, countdown, admin, perfil)
prisma/         schema, migraciones y seed de los 104 partidos
```
