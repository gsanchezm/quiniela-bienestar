'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { profileSchema } from '@/domain/validation';
import { db } from '@/server/db';
import { getSessionUser } from '@/server/auth/session';
import { hashPassword } from '@/server/auth/password';
import { AuthError, requestEmailChange } from '@/server/services/auth';
import { realAuthDeps } from '@/server/services/auth-deps';

export interface ProfileFormState {
  ok?: boolean;
  error?: string;
  emailPending?: boolean; // se mandó confirmación al correo nuevo
}

export async function updateProfileAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const rawPhoto = String(formData.get('photo') ?? '');
  const parsed = profileSchema.safeParse({
    nombre: String(formData.get('nombre') ?? ''),
    apellido: String(formData.get('apellido') ?? ''),
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    photo: rawPhoto === '' ? null : rawPhoto,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;

  let emailPending = false;
  try {
    if (data.email !== user.email) {
      await requestEmailChange(realAuthDeps(), user.id, data.email);
      emailPending = true; // el email actual no cambia hasta confirmar
    }
    await db.user.update({
      where: { id: user.id },
      data: {
        nombre: data.nombre,
        apellido: data.apellido,
        photo: data.photo,
        ...(data.password ? { passwordHash: await hashPassword(data.password) } : {}),
      },
    });
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }

  revalidatePath('/perfil');
  revalidatePath('/tabla');
  return { ok: true, emailPending };
}
