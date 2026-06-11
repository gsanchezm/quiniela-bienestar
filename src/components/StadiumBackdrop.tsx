'use client';

import { useEffect, useState } from 'react';

// Fondo animado de estadio + video oficial de YouTube (apagable).
// Port de js/auth.jsx con el video parametrizado por pantalla.
export function StadiumBackdrop({
  dim,
  videoId,
  allowToggle = true,
  loopAtSeconds = 24,
}: {
  dim?: boolean;
  videoId?: string | null;
  allowToggle?: boolean;
  loopAtSeconds?: number;
}) {
  const [videoOn, setVideoOn] = useState(true);
  const [videoKey, setVideoKey] = useState(0);
  const showVideo = Boolean(videoId) && videoOn;

  useEffect(() => {
    if (!showVideo) return;
    const timer = setInterval(() => setVideoKey((key) => key + 1), loopAtSeconds * 1000);
    return () => clearInterval(timer);
  }, [loopAtSeconds, showVideo]);

  return (
    <>
      <div className={'stadium' + (dim ? ' stadium-dim' : '')} aria-hidden="true">
        <div className="stadium-grass" />
        {showVideo ? (
          <div className="stadium-video">
            <iframe
              key={videoKey}
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${videoId}&start=0&end=${loopAtSeconds}&playsinline=1&rel=0&iv_load_policy=3&disablekb=1&modestbranding=1`}
              title="Video oficial Mundial 2026"
              tabIndex={-1}
              allow="autoplay; encrypted-media"
            />
          </div>
        ) : null}
        <div className="stadium-sweep" />
        <div className="stadium-line-mid" />
        <div className="stadium-circle" />
        <div className="stadium-vignette" />
      </div>
      {videoId && allowToggle ? (
        <button type="button" className="video-toggle" onClick={() => setVideoOn((v) => !v)}>
          {videoOn ? '⏸ APAGAR VIDEO' : '▶ ENCENDER VIDEO'}
        </button>
      ) : null}
    </>
  );
}
