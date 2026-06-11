import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { isAdmin } from './admin';

const original = process.env.ADMIN_EMAILS;

describe('rol de administrador por ADMIN_EMAILS', () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = 'gilberto.aspros@gmail.com, Otro@Admin.MX';
  });

  afterAll(() => {
    process.env.ADMIN_EMAILS = original;
  });

  it('reconoce a los correos de la lista sin importar mayúsculas o espacios', () => {
    expect(isAdmin('gilberto.aspros@gmail.com')).toBe(true);
    expect(isAdmin('OTRO@ADMIN.MX')).toBe(true);
    expect(isAdmin('  gilberto.aspros@gmail.com  ')).toBe(true);
  });

  it('rechaza a cualquier otro correo, vacío o null', () => {
    expect(isAdmin('intruso@demo.mx')).toBe(false);
    expect(isAdmin('')).toBe(false);
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });

  it('con la variable vacía nadie es admin', () => {
    process.env.ADMIN_EMAILS = '';
    expect(isAdmin('gilberto.aspros@gmail.com')).toBe(false);
  });
});
