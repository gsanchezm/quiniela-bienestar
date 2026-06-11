import { describe, it, expect } from 'vitest';
import {
  goalSchema,
  outcomeSchema,
  signupSchema,
  profilePasswordSchema,
  photoSchema,
  resultSchema,
  scorePredictionSchema,
} from './validation';

describe('validación de marcadores', () => {
  it('acepta enteros de 0 a 99', () => {
    expect(goalSchema.safeParse(0).success).toBe(true);
    expect(goalSchema.safeParse(99).success).toBe(true);
  });

  it('rechaza negativos, mayores a 99, decimales y no-números', () => {
    expect(goalSchema.safeParse(-1).success).toBe(false);
    expect(goalSchema.safeParse(100).success).toBe(false);
    expect(goalSchema.safeParse(1.5).success).toBe(false);
    expect(goalSchema.safeParse('2').success).toBe(false);
    expect(goalSchema.safeParse(NaN).success).toBe(false);
  });

  it('el pronóstico exige ambos lados', () => {
    expect(scorePredictionSchema.safeParse({ predHome: 2, predAway: 0 }).success).toBe(true);
    expect(scorePredictionSchema.safeParse({ predHome: 2 }).success).toBe(false);
  });
});

describe('validación de picks', () => {
  it('en grupos acepta H, D y A', () => {
    ['H', 'D', 'A'].forEach((v) => expect(outcomeSchema(false).safeParse(v).success).toBe(true));
  });

  it('en eliminatoria rechaza el empate', () => {
    expect(outcomeSchema(true).safeParse('D').success).toBe(false);
    expect(outcomeSchema(true).safeParse('H').success).toBe(true);
    expect(outcomeSchema(true).safeParse('A').success).toBe(true);
  });
});

describe('validación de registro', () => {
  const base = { nombre: 'Gil', apellido: 'Sánchez', email: 'Gil@Demo.MX ', password: 'secreto' };

  it('normaliza el correo a minúsculas sin espacios', () => {
    const r = signupSchema.parse(base);
    expect(r.email).toBe('gil@demo.mx');
  });

  it('rechaza nombre vacío, correo inválido y contraseña corta con mensajes del prototipo', () => {
    expect(signupSchema.safeParse({ ...base, nombre: '  ' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, email: 'no-es-correo' }).success).toBe(false);
    const corta = signupSchema.safeParse({ ...base, password: '12345' });
    expect(corta.success).toBe(false);
    if (!corta.success) {
      expect(corta.error.issues[0].message).toBe('Mínimo 6 caracteres.');
    }
  });
});

describe('contraseña opcional del perfil', () => {
  it('vacía significa "no cambiarla"', () => {
    expect(profilePasswordSchema.parse('')).toBeUndefined();
  });

  it('si viene, exige mínimo 6', () => {
    expect(profilePasswordSchema.safeParse('12345').success).toBe(false);
    expect(profilePasswordSchema.parse('123456')).toBe('123456');
  });
});

describe('foto de perfil', () => {
  it('acepta data URL JPEG razonable', () => {
    expect(photoSchema.safeParse('data:image/jpeg;base64,/9j/4AAQSkZJRg==').success).toBe(true);
  });

  it('rechaza otros formatos y tamaños excesivos', () => {
    expect(photoSchema.safeParse('data:image/png;base64,iVBORw0KGgo=').success).toBe(false);
    const enorme = 'data:image/jpeg;base64,' + 'A'.repeat(300_000);
    expect(photoSchema.safeParse(enorme).success).toBe(false);
  });
});

describe('resultado oficial', () => {
  it('en grupos no acepta ganador de penales', () => {
    expect(resultSchema(false).safeParse({ homeGoals: 1, awayGoals: 1, penWinner: null }).success).toBe(true);
    expect(resultSchema(false).safeParse({ homeGoals: 1, awayGoals: 1, penWinner: 'H' }).success).toBe(false);
  });

  it('en eliminatoria empatada exige ganador de penales', () => {
    expect(resultSchema(true).safeParse({ homeGoals: 1, awayGoals: 1, penWinner: null }).success).toBe(false);
    expect(resultSchema(true).safeParse({ homeGoals: 1, awayGoals: 1, penWinner: 'A' }).success).toBe(true);
  });

  it('en eliminatoria con ganador en el marcador no acepta penales', () => {
    expect(resultSchema(true).safeParse({ homeGoals: 2, awayGoals: 0, penWinner: 'H' }).success).toBe(false);
    expect(resultSchema(true).safeParse({ homeGoals: 2, awayGoals: 0, penWinner: null }).success).toBe(true);
  });
});
