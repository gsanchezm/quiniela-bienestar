import { flagUrl, flagUrl2x } from '@/data/worldcup2026';

// Bandera vía flagcdn (códigos en el dataset, incluye gb-eng/gb-sct).
// PNGs diminutos: <img> simple, como el prototipo.
export function Flag({ code, size = 22 }: { code: string | null | undefined; size?: number }) {
  if (!code) {
    return (
      <span className="flag flag-tbd" style={{ width: size * 1.45, height: size }}>
        ?
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="flag"
      alt=""
      draggable={false}
      src={flagUrl(code)}
      srcSet={`${flagUrl2x(code)} 2x`}
      style={{ height: size }}
    />
  );
}
