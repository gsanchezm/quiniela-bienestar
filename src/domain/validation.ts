import { z } from 'zod';

// Marcadores: enteros 0–99, sin negativos (regla del spec §4.1/§4.4).
export const goalSchema = z
  .number({ invalid_type_error: 'Captura un número.' })
  .int('Solo enteros.')
  .min(0, 'No se permiten negativos.')
  .max(99, 'Máximo 99.');

export const scorePredictionSchema = z.object({
  predHome: goalSchema,
  predAway: goalSchema,
});

// Picks: H/D/A en grupos, solo H/A en eliminatoria.
export function outcomeSchema(isKnockout: boolean) {
  return isKnockout ? z.enum(['H', 'A']) : z.enum(['H', 'D', 'A']);
}

const nombreSchema = z.string().trim().min(1, 'Escribe tu nombre.').max(60);
const apellidoSchema = z.string().trim().min(1, 'Escribe tu apellido.').max(60);
export const emailSchema = z.string().trim().toLowerCase().email('Correo inválido.').max(254);
const passwordSchema = z.string().min(6, 'Mínimo 6 caracteres.').max(100);

export const signupSchema = z.object({
  nombre: nombreSchema,
  apellido: apellidoSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Escribe tu contraseña.'),
});

// En el perfil, contraseña vacía = "no cambiarla".
export const profilePasswordSchema = z
  .string()
  .max(100)
  .transform((v) => (v === '' ? undefined : v))
  .refine((v) => v === undefined || v.length >= 6, 'Mínimo 6 caracteres.');

// Foto: data URL JPEG (el cliente recorta a 128×128); tope ~200 KB.
export const photoSchema = z
  .string()
  .max(200_000, 'La foto es demasiado grande.')
  .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, 'Formato de foto inválido.');

export const profileSchema = z.object({
  nombre: nombreSchema,
  apellido: apellidoSchema,
  email: emailSchema,
  password: profilePasswordSchema,
  photo: photoSchema.nullable(),
});

// Resultado oficial: KO empatado exige penales; en cualquier otro caso, sobran.
export function resultSchema(isKnockout: boolean) {
  return z
    .object({
      homeGoals: goalSchema,
      awayGoals: goalSchema,
      penWinner: z.enum(['H', 'A']).nullable(),
    })
    .superRefine((r, ctx) => {
      const empate = r.homeGoals === r.awayGoals;
      if (isKnockout && empate && r.penWinner === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['penWinner'], message: 'Falta el ganador en penales.' });
      }
      if ((!isKnockout || !empate) && r.penWinner !== null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['penWinner'], message: 'Penales no aplican aquí.' });
      }
    });
}
