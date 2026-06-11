'use client';

import { useRef, useState } from 'react';

// Selector de foto con recorte cuadrado a 128px en el cliente (port de
// js/ui.jsx). El resultado viaja como data URL JPEG en un input oculto.
export function PhotoPicker({ initial }: { initial: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(initial);
  const [error, setError] = useState<string | null>(null);

  const handle = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const fail = () => setError('No pudimos leer esa imagen. Prueba con un JPG o PNG.');
    const reader = new FileReader();
    reader.onerror = fail;
    reader.onload = () => {
      const img = new Image();
      img.onerror = fail;
      img.onload = () => {
        const c = document.createElement('canvas');
        const s = 128;
        c.width = s;
        c.height = s;
        const ctx = c.getContext('2d')!;
        const min = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, s, s);
        setPhoto(c.toDataURL('image/jpeg', 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="photopicker">
      <input type="hidden" name="photo" value={photo ?? ''} />
      <button type="button" className="photopicker-circle" onClick={() => inputRef.current?.click()}>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" />
        ) : (
          <span className="photopicker-empty">
            <span className="photopicker-plus">+</span>FOTO
          </span>
        )}
      </button>
      <div className="photopicker-side">
        <span className="photopicker-hint">
          Foto de perfil <em>(opcional)</em>
        </span>
        {photo ? (
          <button type="button" className="linklike" onClick={() => setPhoto(null)}>
            Quitar
          </button>
        ) : null}
        {error ? <span className="field-msg">{error}</span> : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => handle(e.target.files?.[0])}
      />
    </div>
  );
}
