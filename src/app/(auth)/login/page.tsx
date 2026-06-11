import { redirect } from 'next/navigation';
import { StadiumBackdrop } from '@/components/StadiumBackdrop';
import { NewsCarousel } from '@/components/auth/NewsCarousel';
import { getSessionUser } from '@/server/auth/session';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

// Login con el video oficial del Mundial de fondo (fcnDmrtj6Sk, acordado)
// y el carrusel de noticias a la izquierda (arriba en móvil).
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>;
}) {
  if (await getSessionUser()) redirect('/partidos');
  const { aviso } = await searchParams;

  return (
    <div className="authwrap authwrap-login">
      <StadiumBackdrop dim videoId="fcnDmrtj6Sk" />
      <div className="loginsplit">
        <NewsCarousel />
        <LoginForm aviso={aviso} />
      </div>
    </div>
  );
}
