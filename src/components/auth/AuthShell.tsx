import Link from 'next/link';
import { StadiumBackdrop } from '@/components/StadiumBackdrop';

// Marco de los formularios de auth (port de js/auth.jsx AuthShell).
export function AuthShell({
  title,
  kicker,
  backHref = '/',
  backLabel = '← Volver',
  children,
}: {
  title: string;
  kicker: string;
  backHref?: string;
  backLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="authwrap">
      <StadiumBackdrop dim allowToggle={false} />
      <div className="authcard">
        <Link className="authback linklike" href={backHref}>
          {backLabel}
        </Link>
        <div className="authkicker">{kicker}</div>
        <h2 className="authtitle">{title}</h2>
        {children}
      </div>
    </div>
  );
}
