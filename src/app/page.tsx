import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Countdown } from '@/components/Countdown';
import { StadiumBackdrop } from '@/components/StadiumBackdrop';
import { Ticker } from '@/components/landing/Ticker';
import { KICKOFF } from '@/data/worldcup2026';
import { getSessionUser } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

const FEATURES = [
  { n: '01', title: 'Llena tu quiniela', body: 'Gana, empata o gana en los 104 partidos del Mundial.' },
  { n: '02', title: 'Cierra al silbatazo', body: 'Los picks se bloquean cuando inicia cada partido.' },
  { n: '03', title: 'Sube en la tabla', body: '1 punto por acierto y posiciones en vivo contra tus rivales.' },
] as const;

export default async function LandingPage() {
  if (await getSessionUser()) redirect('/partidos');

  return (
    <div className="landing">
      <StadiumBackdrop videoId="smiF90YexLY" loopAtSeconds={60} />
      <div className="landing-top">
        <span className="landing-badge">COPA MUNDIAL 2026 · MÉXICO / EE.UU. / CANADÁ</span>
      </div>
      <div className="landing-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="landing-logo"
          src="/logo.png"
          alt="Quiniela del Bienestar 2026 — jugamos, predicimos, ganamos todos"
        />
        <p className="landing-sub">104 partidos · 48 selecciones · una sola quiniela entre amigos</p>
        <Countdown to={KICKOFF} label="EL BALÓN RUEDA EN" />
        <div className="landing-actions">
          <Link className="btn btn-primary" href="/login">
            INICIAR SESIÓN
          </Link>
          <Link className="btn btn-ghost" href="/registro">
            CREAR CUENTA
          </Link>
        </div>
        <div className="landing-features">
          {FEATURES.map((f) => (
            <div className="lfcard" key={f.n}>
              <span className="lfcard-n led">{f.n}</span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </div>
      <Ticker />
    </div>
  );
}
