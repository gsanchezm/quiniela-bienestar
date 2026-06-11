import crypto from 'node:crypto';

// Los tokens (sesión y correo) se guardan hasheados: si la BD se filtra,
// los valores en las cookies/enlaces siguen sin servirle a nadie.
export const hashToken = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex');

export const newToken = () => crypto.randomBytes(32).toString('hex');
