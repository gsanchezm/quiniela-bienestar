// Plantillas de correo (tema oscuro del prototipo, copys del handoff).

export interface EmailContent {
  subject: string;
  html: string;
}

function shell(heading: string, body: string, cta: string, url: string): string {
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;background:#121212;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0"
               style="background:#1d1d1c;border:1px solid #2c2c2a;border-radius:8px;padding:32px;">
          <tr><td align="center" style="padding-bottom:8px;">
            <span style="color:#4db53c;font-size:13px;letter-spacing:3px;font-weight:bold;">QUINIELA DEL BIENESTAR</span>
          </td></tr>
          <tr><td align="center" style="color:#f2f1ee;font-size:24px;font-weight:bold;padding:8px 0;">${heading}</td></tr>
          <tr><td align="center" style="color:#a39f98;font-size:15px;line-height:1.6;padding:8px 0 24px;">${body}</td></tr>
          <tr><td align="center">
            <a href="${url}" style="background:#4db53c;color:#ffffff;text-decoration:none;font-weight:bold;
               padding:14px 28px;border-radius:4px;display:inline-block;letter-spacing:1px;">${cta}</a>
          </td></tr>
          <tr><td align="center" style="color:#6f6b64;font-size:12px;line-height:1.6;padding-top:24px;">
            Si no fuiste tú, ignora este correo.<br/>Copa Mundial 2026 · México · EE.UU. · Canadá
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function confirmEmail(url: string): EmailContent {
  return {
    subject: '⚽ Confirma tu cuenta — Quiniela del Bienestar',
    html: shell(
      '¡Ya casi estás en la cancha!',
      'Haz clic en el botón para confirmar tu cuenta y empezar a llenar tu quiniela del Mundial 2026.',
      'CONFIRMAR MI CUENTA',
      url,
    ),
  };
}

export function resetEmail(url: string): EmailContent {
  return {
    subject: '🔑 Restablece tu contraseña — Quiniela del Bienestar',
    html: shell(
      '¿Olvidaste tu contraseña?',
      'No pasa nada, hasta a los mejores porteros les meten gol. Haz clic abajo para elegir una nueva contraseña.',
      'RESTABLECER CONTRASEÑA',
      url,
    ),
  };
}

export function changeEmailEmail(url: string): EmailContent {
  return {
    subject: '📬 Confirma tu nuevo correo — Quiniela del Bienestar',
    html: shell(
      'Cambio de correo',
      'Recibimos la solicitud de usar esta dirección en tu cuenta. Confírmalo para completar el cambio.',
      'CONFIRMAR NUEVO CORREO',
      url,
    ),
  };
}

const STAGE_LABEL: Record<string, string> = {
  R32: 'Dieciseisavos',
  R16: 'Octavos',
  QF: 'Cuartos',
  SF: 'Semifinales',
  FIN: 'Final',
};

export function knockoutAssignedEmail(
  assigned: Array<{ stage: string; homeCode: string; awayCode: string }>,
  anomalies: string[],
  appUrl: string,
  advanced: Array<{ matchId: number; slot: 'H' | 'A'; teamCode: string }> = [],
): EmailContent {
  const rows = assigned
    .map(
      (a) =>
        `<tr><td style="color:#6f6b64;font-size:12px;letter-spacing:1px;padding:6px 12px 6px 0;">${STAGE_LABEL[a.stage] ?? a.stage}</td>` +
        `<td style="color:#f2f1ee;font-size:15px;font-weight:bold;padding:6px 0;">${a.homeCode} vs ${a.awayCode}</td></tr>`,
    )
    .join('');
  const assignedBlock = assigned.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">${rows}</table>`
    : `<p style="color:#a39f98;font-size:15px;">No se asignaron cruces nuevos.</p>`;
  const advancedRows = advanced
    .map(
      (a) =>
        `<tr><td style="color:#6f6b64;font-size:12px;letter-spacing:1px;padding:6px 12px 6px 0;">Partido ${a.matchId}</td>` +
        `<td style="color:#f2f1ee;font-size:15px;font-weight:bold;padding:6px 0;">${a.slot === 'H' ? 'Local' : 'Visitante'}: ${a.teamCode}</td></tr>`,
    )
    .join('');
  const advancedBlock = advanced.length
    ? `<p style="color:#4db53c;font-size:14px;font-weight:bold;padding-top:16px;">Octavos+ actualizados por avance:</p>` +
      `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">${advancedRows}</table>`
    : '';
  const anomaliesBlock = anomalies.length
    ? `<p style="color:#e0a106;font-size:14px;font-weight:bold;padding-top:16px;">⚠️ Revisa en Admin:</p>` +
      `<ul style="color:#a39f98;font-size:13px;text-align:left;line-height:1.6;">${anomalies.map((x) => `<li>${x}</li>`).join('')}</ul>`
    : '';
  const subject = assigned.length
    ? `⚽ ${assigned.length} cruce(s) de eliminatoria asignados`
    : '⚠️ Revisa la auto-asignación de eliminatoria';

  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;background:#121212;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0"
             style="background:#1d1d1c;border:1px solid #2c2c2a;border-radius:8px;padding:32px;">
        <tr><td align="center" style="padding-bottom:8px;">
          <span style="color:#4db53c;font-size:13px;letter-spacing:3px;font-weight:bold;">QUINIELA DEL BIENESTAR</span>
        </td></tr>
        <tr><td align="center" style="color:#f2f1ee;font-size:22px;font-weight:bold;padding:8px 0;">Eliminatoria actualizada</td></tr>
        <tr><td align="center" style="padding:8px 0 16px;">${assignedBlock}${advancedBlock}${anomaliesBlock}</td></tr>
        <tr><td align="center">
          <a href="${appUrl}/partidos" style="background:#4db53c;color:#ffffff;text-decoration:none;font-weight:bold;
             padding:14px 28px;border-radius:4px;display:inline-block;letter-spacing:1px;">VER EL CUADRO</a>
        </td></tr>
        <tr><td align="center" style="color:#6f6b64;font-size:12px;line-height:1.6;padding-top:24px;">
          Asignación automática desde football-data.org · Copa Mundial 2026
        </td></tr>
      </table>
    </td></tr></table>
  </body>
</html>`;
  return { subject, html };
}
