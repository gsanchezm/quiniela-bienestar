import { describe, it, expect } from 'vitest';
import {
  AuthError,
  signup,
  login,
  confirmAccount,
  confirmUserManually,
  requestPasswordReset,
  resetPassword,
  requestEmailChange,
  confirmEmailChange,
  type AuthDeps,
  type AuthUser,
} from './auth';

interface Sent {
  to: string;
  subject: string;
  html: string;
}

function fakeDeps() {
  const users = new Map<string, AuthUser>();
  const tokens = new Map<string, { userId: string; type: string; newEmail: string | null }>();
  const sent: Sent[] = [];
  const revoked: string[] = [];
  const verified: string[] = []; // hashes contra los que se llamó verifyPassword
  let seq = 0;

  const deps: AuthDeps = {
    users: {
      async findByEmail(email) {
        return [...users.values()].find((u) => u.email === email) ?? null;
      },
      async findById(id) {
        return users.get(id) ?? null;
      },
      async create(data) {
        const u: AuthUser = { id: `u${++seq}`, photo: null, confirmed: false, ...data };
        users.set(u.id, u);
        return u;
      },
      async update(id, data) {
        users.set(id, { ...users.get(id)!, ...data });
      },
    },
    tokens: {
      async issue(userId, type, newEmail) {
        const raw = `tok${++seq}`;
        tokens.set(raw, { userId, type, newEmail: newEmail ?? null });
        return raw;
      },
      async consume(raw, type) {
        const t = tokens.get(raw);
        if (!t || t.type !== type) return null;
        tokens.delete(raw);
        return { userId: t.userId, newEmail: t.newEmail };
      },
    },
    sender: {
      async send(to, subject, html) {
        sent.push({ to, subject, html });
      },
    },
    revokeSessions: async (userId) => {
      revoked.push(userId);
    },
    hashPassword: async (p) => `hash:${p}`,
    verifyPassword: async (p, h) => {
      verified.push(h);
      return h === `hash:${p}`;
    },
    appUrl: 'https://qdb.example',
  };
  return { deps, users, sent, revoked, verified };
}

const INPUT = { nombre: ' Gil ', apellido: 'Sánchez', email: 'GIL@Demo.MX', password: 'secreto' };

describe('registro y confirmación', () => {
  it('crea la cuenta sin confirmar, normaliza el correo y manda el enlace de confirmación', async () => {
    const { deps, users, sent } = fakeDeps();
    await signup(deps, INPUT);
    const u = [...users.values()][0];
    expect(u.email).toBe('gil@demo.mx');
    expect(u.nombre).toBe('Gil');
    expect(u.confirmed).toBe(false);
    expect(u.passwordHash).toBe('hash:secreto');
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('gil@demo.mx');
    expect(sent[0].html).toContain('https://qdb.example/confirmar/tok');
  });

  it('rechaza un correo ya registrado', async () => {
    const { deps } = fakeDeps();
    await signup(deps, INPUT);
    await expect(signup(deps, { ...INPUT, nombre: 'Otro' })).rejects.toThrow(/ya está registrado/);
  });

  it('el registro NO falla aunque el correo no se pueda enviar (sandbox sin dominio)', async () => {
    const { deps, users } = fakeDeps();
    deps.sender = {
      async send() {
        throw new Error('Resend: solo puedes enviar a tu propio correo');
      },
    };
    await expect(signup(deps, INPUT)).resolves.toMatchObject({ email: 'gil@demo.mx' });
    expect(users.size).toBe(1); // la cuenta queda pendiente de confirmación manual
  });

  it('un admin puede confirmar la cuenta manualmente sin token', async () => {
    const { deps, users } = fakeDeps();
    const u = await signup(deps, INPUT);
    await confirmUserManually(deps, u.id);
    expect(users.get(u.id)!.confirmed).toBe(true);
  });

  it('confirmAccount consume el token y marca la cuenta', async () => {
    const { deps, users, sent } = fakeDeps();
    await signup(deps, INPUT);
    const raw = sent[0].html.match(/confirmar\/(tok\d+)/)![1];
    const userId = await confirmAccount(deps, raw);
    expect(userId).toBeTruthy();
    expect(users.get(userId!)!.confirmed).toBe(true);
    expect(await confirmAccount(deps, raw)).toBeNull(); // un solo uso
  });
});

describe('login', () => {
  it('rechaza sin confirmar, con el mensaje del prototipo', async () => {
    const { deps } = fakeDeps();
    await signup(deps, INPUT);
    await expect(login(deps, 'gil@demo.mx', 'secreto')).rejects.toThrow(/no está confirmada/);
  });

  it('entra con credenciales correctas una vez confirmado', async () => {
    const { deps, sent } = fakeDeps();
    await signup(deps, INPUT);
    await confirmAccount(deps, sent[0].html.match(/confirmar\/(tok\d+)/)![1]);
    const u = await login(deps, ' GIL@demo.mx ', 'secreto');
    expect(u.email).toBe('gil@demo.mx');
  });

  it('rechaza credenciales incorrectas sin revelar cuál falló', async () => {
    const { deps, sent } = fakeDeps();
    await signup(deps, INPUT);
    await confirmAccount(deps, sent[0].html.match(/confirmar\/(tok\d+)/)![1]);
    await expect(login(deps, 'gil@demo.mx', 'mala')).rejects.toThrow('Correo o contraseña incorrectos.');
    await expect(login(deps, 'nadie@demo.mx', 'secreto')).rejects.toThrow('Correo o contraseña incorrectos.');
  });

  it('con correo inexistente TAMBIÉN verifica un hash señuelo (sin fuga por timing)', async () => {
    const { deps, verified } = fakeDeps();
    await expect(login(deps, 'nadie@demo.mx', 'loquesea')).rejects.toThrow();
    expect(verified).toHaveLength(1); // se pagó el costo de bcrypt igual
  });
});

describe('recuperación de contraseña', () => {
  it('con correo inexistente no envía nada ni revela (respuesta neutra)', async () => {
    const { deps, sent } = fakeDeps();
    await expect(requestPasswordReset(deps, 'nadie@demo.mx')).resolves.toBeUndefined();
    expect(sent).toHaveLength(0);
  });

  it('envía el enlace y la nueva contraseña queda activa (y confirma la cuenta)', async () => {
    const { deps, users, sent } = fakeDeps();
    await signup(deps, INPUT);
    await requestPasswordReset(deps, 'gil@demo.mx');
    const raw = sent[1].html.match(/reset\/(tok\d+)/)![1];
    const ok = await resetPassword(deps, raw, 'nuevaclave');
    expect(ok).toBe(true);
    const u = [...users.values()][0];
    expect(u.passwordHash).toBe('hash:nuevaclave');
    expect(u.confirmed).toBe(true);
  });

  it('restablecer la contraseña revoca TODAS las sesiones activas del usuario', async () => {
    const { deps, users, sent, revoked } = fakeDeps();
    await signup(deps, INPUT);
    await requestPasswordReset(deps, 'gil@demo.mx');
    const raw = sent[1].html.match(/reset\/(tok\d+)/)![1];
    await resetPassword(deps, raw, 'nuevaclave');
    expect(revoked).toEqual([[...users.keys()][0]]);
  });
});

describe('cambio de correo', () => {
  async function cuentaConfirmada() {
    const ctx = fakeDeps();
    await signup(ctx.deps, INPUT);
    await confirmAccount(ctx.deps, ctx.sent[0].html.match(/confirmar\/(tok\d+)/)![1]);
    return { ...ctx, userId: [...ctx.users.keys()][0] };
  }

  it('manda la confirmación al correo NUEVO y no cambia nada todavía', async () => {
    const { deps, users, sent, userId } = await cuentaConfirmada();
    await requestEmailChange(deps, userId, 'nuevo@demo.mx');
    expect(sent[1].to).toBe('nuevo@demo.mx');
    expect(users.get(userId)!.email).toBe('gil@demo.mx');
  });

  it('aplica el cambio al confirmar el token', async () => {
    const { deps, users, sent, userId } = await cuentaConfirmada();
    await requestEmailChange(deps, userId, 'nuevo@demo.mx');
    const raw = sent[1].html.match(/confirmar-email\/(tok\d+)/)![1];
    expect(await confirmEmailChange(deps, raw)).toBe(true);
    expect(users.get(userId)!.email).toBe('nuevo@demo.mx');
  });

  it('rechaza un correo que ya usa otra cuenta', async () => {
    const { deps, userId } = await cuentaConfirmada();
    await signup(deps, { ...INPUT, email: 'ocupado@demo.mx' });
    await expect(requestEmailChange(deps, userId, 'ocupado@demo.mx')).rejects.toThrow(AuthError);
  });
});
