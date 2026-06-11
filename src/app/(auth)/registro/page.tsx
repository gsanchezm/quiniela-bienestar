import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/AuthShell';
import { getSessionUser } from '@/server/auth/session';
import { SignupForm } from './SignupForm';

export const dynamic = 'force-dynamic';

export default async function RegistroPage() {
  if (await getSessionUser()) redirect('/partidos');
  return (
    <AuthShell title="Crear cuenta" kicker="ÚNETE A LA QUINIELA">
      <SignupForm />
    </AuthShell>
  );
}
