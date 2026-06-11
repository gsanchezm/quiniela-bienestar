'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';

// Carrusel de noticias del login (js/auth.jsx). Cambios acordados:
// avance automático cada 6 s y SIN paginación numerada visible.
interface Slide {
  id: string;
  kicker: string;
  head: ReactNode;
  cta: string;
  image: string;
}

const SLIDES: Slide[] = [
  {
    id: 'apertura',
    kicker: '11 DE JUNIO · PARTIDO INAUGURAL',
    head: (
      <span>
        MÉXICO ABRE EL MUNDIAL ANTE <em>SUDÁFRICA</em> EN EL <u>AZTECA</u>
      </span>
    ),
    cta: 'LLENA TU QUINIELA',
    image: '/auth-carousel/apertura.svg',
  },
  {
    id: 'formato',
    kicker: 'MUNDIAL 2026 · MÉXICO / EE.UU. / CANADÁ',
    head: (
      <span>
        <em>104</em> PARTIDOS, <em>48</em> SELECCIONES Y UNA SOLA <u>QUINIELA</u> ENTRE AMIGOS
      </span>
    ),
    cta: 'CREAR CUENTA',
    image: '/auth-carousel/formato.svg',
  },
  {
    id: 'cierre',
    kicker: 'REGLAS DE LA CASA',
    head: (
      <span>
        TUS PICKS SE <em>CIERRAN</em> AL SILBATAZO INICIAL — <u>NO TE DUERMAS</u>
      </span>
    ),
    cta: 'CREAR CUENTA',
    image: '/auth-carousel/cierre.svg',
  },
  {
    id: 'puntos',
    kicker: 'TABLA EN VIVO',
    head: (
      <span>
        CADA ACIERTO VALE <em>1 PUNTO</em> Y EL MARCADOR EXACTO <em>3</em>: DEMUESTRA QUIÉN{' '}
        <u>SABE DE FUTBOL</u>
      </span>
    ),
    cta: 'CREAR CUENTA',
    image: '/auth-carousel/puntos.svg',
  },
];

export function NewsCarousel() {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % SLIDES.length), 6000);
    return () => clearInterval(t);
  }, [paused]);

  return (
    <div className="carousel" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {SLIDES.map((s, i) => (
        <div key={s.id} className={'car-slide' + (i === idx ? ' car-on' : '')} aria-hidden={i !== idx}>
          <div className="car-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.image} alt="" />
          </div>
          <div className="car-fade" />
          <div className="car-copy">
            <span className="car-kicker">{s.kicker}</span>
            <h3 className="car-head">{s.head}</h3>
            <Link className="btn btn-primary car-cta" href="/registro">
              {s.cta}
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
