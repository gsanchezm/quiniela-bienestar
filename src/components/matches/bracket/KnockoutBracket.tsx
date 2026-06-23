'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { Flag } from '@/components/Flag';
import type { MatchView } from '@/server/queries';
import { BracketBox } from './BracketBox';
import { BracketConn } from './BracketConn';
import { ScoreSheet } from './ScoreSheet';
import { CENTERW, COLW, CONNW, H, finalAndThird, stageSide } from './layout';

interface Head {
  w: number;
  label?: string;
  stage?: string;
}

const HEADS: Head[] = [
  { w: COLW, label: '16vos', stage: 'R32' },
  { w: CONNW },
  { w: COLW, label: 'Octavos', stage: 'R16' },
  { w: CONNW },
  { w: COLW, label: 'Cuartos', stage: 'QF' },
  { w: CONNW },
  { w: COLW, label: 'Semis', stage: 'SF' },
  { w: CONNW },
  { w: CENTERW, label: 'Final', stage: 'FIN' },
  { w: CONNW },
  { w: COLW, label: 'Semis', stage: 'SF' },
  { w: CONNW },
  { w: COLW, label: 'Cuartos', stage: 'QF' },
  { w: CONNW },
  { w: COLW, label: 'Octavos', stage: 'R16' },
  { w: CONNW },
  { w: COLW, label: '16vos', stage: 'R32' },
];

// Cuadro de eliminatorias (port de KnockoutBracket en js/bracket.jsx):
// árbol espejo 16vos→Final con trofeo central, escala para caber y desplaza
// en pantallas chicas, auto-centrado al montar.
export function KnockoutBracket({
  matches,
  highlight,
  nowMs,
}: {
  matches: MatchView[];
  highlight: string;
  nowMs: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const totalW = (COLW * 4 + CONNW * 4) * 2 + CENTERW;
  const [scale, setScale] = useState(1);
  const [natH, setNatH] = useState(H + 44);
  const [sheetId, setSheetId] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (innerRef.current) setNatH(innerRef.current.offsetHeight);
    function fit() {
      const wrap = wrapRef.current;
      if (!wrap) return;
      let s = wrap.clientWidth / totalW;
      if (s > 1) s = 1;
      if (s < 0.58) s = 0.58; // por debajo: deja desplazar en vez de encoger más
      setScale(s);
    }
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollWidth > el.clientWidth + 1) {
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    }
  }, [scale]);

  const { final, third } = finalAndThird(matches);
  const champTeam =
    final && final.outcome ? (final.outcome === 'H' ? final.home : final.away) : null;

  const open = (id: number) => setSheetId(id);
  const close = () => setSheetId(null);
  const sheetMatch = sheetId != null ? (matches.find((m) => m.id === sheetId) ?? null) : null;

  const col = (stage: string, side: 'L' | 'R', n: number) => {
    const list = stageSide(matches, stage, side, n);
    const dim = stage !== highlight;
    return (
      <div className="bk-col">
        {list.map((m) => (
          <BracketBox key={m.id} m={m} nowMs={nowMs} side={side} dim={dim} onOpenSheet={open} />
        ))}
      </div>
    );
  };

  return (
    <div className="bk-wrap" ref={wrapRef} data-screen-label="Cuadro eliminatorias">
      <div className="bk-hint">
        Toca un equipo para elegir al ganador · toca el encabezado de la llave para el marcador exacto
        (+2) · desliza para ver todo el cuadro
      </div>
      <div className="bk-scroll" ref={scrollRef}>
        <div className="bk-sizer" style={{ width: totalW * scale, height: natH * scale }}>
          <div
            className="bk-inner"
            ref={innerRef}
            style={{ width: totalW, transform: `scale(${scale})`, transformOrigin: 'top left' }}
          >
            <div className="bk-heads">
              {HEADS.map((h, i) => (
                <div
                  key={i}
                  className={
                    'bk-head' +
                    (h.label ? '' : ' bk-head-sp') +
                    (h.stage && h.stage === highlight ? ' bk-head-on' : '')
                  }
                  style={{ width: h.w }}
                >
                  {h.label ?? ''}
                </div>
              ))}
            </div>
            <div className="bk" style={{ height: H }}>
              {/* IZQUIERDA */}
              {col('R32', 'L', 8)}
              <BracketConn feeders={8} dir="l2r" />
              {col('R16', 'L', 4)}
              <BracketConn feeders={4} dir="l2r" />
              {col('QF', 'L', 2)}
              <BracketConn feeders={2} dir="l2r" />
              {col('SF', 'L', 1)}
              <BracketConn straight dir="l2r" />

              {/* CENTRO — final + campeón + 3er lugar */}
              <div className="bk-center" style={{ width: CENTERW }}>
                <div className="bk-champ">
                  <div className={'bk-champ-emblem' + (champTeam ? ' bk-champ-emblem-won' : '')}>
                    {champTeam ? (
                      <Flag code={champTeam.flag} size={40} />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="bk-champ-logo" src="/logo.png" alt="" />
                    )}
                  </div>
                  <span className="bk-champ-label">{champTeam ? champTeam.name : 'Campeón 2026'}</span>
                </div>
                <BracketBox m={final} nowMs={nowMs} side="C" variant="final" onOpenSheet={open} />
                {third ? (
                  <div className="bk-third">
                    <span className="bk-third-label">Tercer lugar</span>
                    <BracketBox m={third} nowMs={nowMs} side="C" variant="third" onOpenSheet={open} />
                  </div>
                ) : null}
              </div>

              <BracketConn straight dir="r2l" />
              {/* DERECHA */}
              {col('SF', 'R', 1)}
              <BracketConn feeders={2} dir="r2l" />
              {col('QF', 'R', 2)}
              <BracketConn feeders={4} dir="r2l" />
              {col('R16', 'R', 4)}
              <BracketConn feeders={8} dir="r2l" />
              {col('R32', 'R', 8)}
            </div>
          </div>
        </div>
      </div>
      {sheetMatch ? <ScoreSheet m={sheetMatch} nowMs={nowMs} onClose={close} /> : null}
    </div>
  );
}
