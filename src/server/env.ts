// Punto único de lectura de variables de entorno (getters para poder
// probar con process.env mutado y para fallar hasta que de verdad se usen).

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}

export const env = {
  get sessionSecret() {
    return required('SESSION_SECRET');
  },
  get resendApiKey() {
    return process.env.RESEND_API_KEY || null;
  },
  get emailFrom() {
    return process.env.EMAIL_FROM || 'Quiniela del Bienestar <onboarding@resend.dev>';
  },
  get adminEmails() {
    return (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  },
  get footballDataToken() {
    return process.env.FOOTBALL_DATA_TOKEN || null;
  },
  get syncSecret() {
    return process.env.SYNC_SECRET || null;
  },
  get appUrl() {
    return (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  },
};
