import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { isAdmin, isSuperAdmin } from './admin';

const original = process.env.ADMIN_EMAILS;

describe('roles de administrador', () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = 'gilberto.aspros@gmail.com, Otro@Admin.MX';
  });

  afterAll(() => {
    process.env.ADMIN_EMAILS = original;
  });

  it('los correos de ADMIN_EMAILS son super-admins sin importar mayúsculas o espacios', () => {
    expect(isSuperAdmin('gilberto.aspros@gmail.com')).toBe(true);
    expect(isSuperAdmin('OTRO@ADMIN.MX')).toBe(true);
    expect(isSuperAdmin('  gilberto.aspros@gmail.com  ')).toBe(true);
    expect(isSuperAdmin('intruso@demo.mx')).toBe(false);
    expect(isSuperAdmin(null)).toBe(false);
  });

  it('un super-admin es admin aunque su columna isAdmin sea false', () => {
    expect(isAdmin({ email: 'gilberto.aspros@gmail.com', isAdmin: false })).toBe(true);
  });

  it('un usuario nombrado desde la UI (isAdmin=true) es admin', () => {
    expect(isAdmin({ email: 'amigo@demo.mx', isAdmin: true })).toBe(true);
  });

  it('un usuario normal no es admin', () => {
    expect(isAdmin({ email: 'amigo@demo.mx', isAdmin: false })).toBe(false);
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });

  it('con la variable vacía solo cuentan los admins de BD', () => {
    process.env.ADMIN_EMAILS = '';
    expect(isAdmin({ email: 'gilberto.aspros@gmail.com', isAdmin: false })).toBe(false);
    expect(isAdmin({ email: 'amigo@demo.mx', isAdmin: true })).toBe(true);
  });
});
