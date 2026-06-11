import Link from 'next/link';
import { redirect } from 'next/navigation';
import { logoutAction } from '@/app/actions/auth';
import { Avatar } from '@/components/Avatar';
import { getSessionUser } from '@/server/auth/session';
import { isAdmin } from '@/server/admin';
import { HeaderTabs } from './HeaderTabs';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getSessionUser();
  if (!me) redirect('/login');

  return (
    <div className="app">
      <header className="apphead">
        <div className="apphead-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="apphead-logo" src="/logo.png" alt="" />
          <span className="apphead-name">
            QUINIELA <em>DEL BIENESTAR</em>
          </span>
        </div>
        <HeaderTabs isAdmin={isAdmin(me.email)} />
        <div className="apphead-user">
          <Link className="apphead-profile" href="/perfil" title="Configuración de perfil">
            <Avatar user={me} size={32} />
            <span className="apphead-username">{me.nombre}</span>
          </Link>
          <form action={logoutAction}>
            <button className="linklike apphead-out" type="submit">
              Salir
            </button>
          </form>
        </div>
      </header>
      <main className="appmain">{children}</main>
      <footer className="appfoot">
        Copa Mundial 2026 · 1 punto por resultado acertado · 3 con marcador exacto · los picks cierran al
        silbatazo inicial
      </footer>
    </div>
  );
}
