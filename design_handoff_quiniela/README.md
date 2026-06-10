# Handoff: Quiniela del Bienestar (Mundial 2026)

## Overview
Quiniela entre amigos para la Copa Mundial 2026: registro con confirmación por correo,
picks gana/empata/gana por partido que se cierran al inicio de cada juego, 1 punto por acierto,
tabla de posiciones en vivo y panel de captura de resultados.

## Sobre los archivos de diseño
Los archivos de este paquete son **referencias de diseño hechas en HTML** (prototipo funcional con
React por CDN y datos en localStorage). NO son código de producción: hay que **recrearlos** en el
stack real del proyecto. El prompt sugerido está en `PROMPT_CLAUDE_CODE.md`.

## Fidelidad
**Alta fidelidad (hifi)**: colores, tipografías, espaciados, copys e interacciones son finales.
Replicar la UI fielmente.

## Archivos
- `Quiniela del Bienestar.html` — entrada: estilos completos (design tokens en `:root`) y carga de scripts
- `js/data.js` — **fuente de verdad de los 104 partidos** (72 de grupos reales + 32 llaves), equipos y banderas
- `js/store.js` — lógica de dominio: bloqueo por kickoff, cálculo de puntos/standings, usuarios demo
- `js/auth.jsx` — landing (video de fondo + countdown + ticker), login con carrusel, registro, correos simulados
- `js/matches.jsx` — tarjetas de partido y picks por etapa
- `js/standings.jsx` — leaderboard y detalle por jugador (picks ajenos ocultos hasta el cierre)
- `js/admin.jsx` — captura de resultados (solo dígitos 0–99) y asignación de equipos en eliminatorias
- `js/profile.jsx` — configuración de perfil (foto/nombre/email/contraseña)
- `js/app.jsx` — shell, navegación por tabs y tweaks
- `assets/logo.png` — logo oficial (PNG con fondo negro; en el prototipo se funde con `mix-blend-mode: screen`;
  ideal pedir/usar versión con fondo transparente en producción)

## Notas clave para el desarrollador
- Validar el **cierre de picks en el servidor** (en el prototipo es solo en cliente)
- Hashear contraseñas (el prototipo las guarda en claro en localStorage por ser demo)
- Banderas vía `https://flagcdn.com/h40/{codigo}.png` (códigos en `js/data.js`, incluye `gb-eng`, `gb-sct`)
- El video de fondo es embed de YouTube `smiF90YexLY` (muted, loop, pointer-events none, oculto con prefers-reduced-motion)
- Horarios en UTC en los datos; render en hora local del navegador
- Los "Tweaks" (acento, densidad, video on/off) son herramienta de diseño del prototipo;
  en producción basta fijar el acento verde `#4db53c`
