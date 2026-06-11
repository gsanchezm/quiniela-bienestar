import { redirect } from 'next/navigation';
import { confirmEmailChange } from '@/server/services/auth';
import { realAuthDeps } from '@/server/services/auth-deps';

export const dynamic = 'force-dynamic';

// Enlace del correo de cambio de dirección: aplica el cambio y avisa.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ok = await confirmEmailChange(realAuthDeps(), token);
  redirect(ok ? '/perfil?aviso=correo-actualizado' : '/login?aviso=enlace-invalido');
}
