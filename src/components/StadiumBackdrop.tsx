'use client';

import { useState } from 'react';

// Fondo animado de estadio + video oficial de YouTube (apagable).
// Port de js/auth.jsx con el video parametrizado por pantalla.
export function StadiumBackdrop({
  dim,
  videoId,
  allowToggle = true,
}: {
  dim?: boolean;
  videoId?: string | null;
  allowToggle?: boolean;
}) {
  const [videoOn, setVideoOn] = useState(true);
  const showVideo = Boolean(videoId) && videoOn;

  return (
    <>
      <div className={'stadium' + (dim ? ' stadium-dim' : '')} aria-hidden="true">
        <div className="stadium-grass" />
        {showVideo ? (
          <div className="stadium-video">
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${videoId}&playsinline=1&rel=0&iv_load_policy=3&disablekb=1`}
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
