import { redirect } from 'next/navigation';
import { getSessionUser } from '@/server/auth/session';
import { ProfileForm } from './ProfileForm';

export const dynamic = 'force-dynamic';

export default async function PerfilPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>;
}) {
  const me = await getSessionUser();
  if (!me) redirect('/login');
  const { aviso } = await searchParams;

  return (
    <ProfileForm
      me={{ nombre: me.nombre, apellido: me.apellido, email: me.email, photo: me.photo }}
      aviso={aviso}
    />
  );
}
