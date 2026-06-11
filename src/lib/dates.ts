// Formato de fechas del prototipo (js/store.js) — siempre en hora LOCAL del
// navegador; por eso estos helpers solo se usan en componentes de cliente.
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export function fmtDate(utc: string): string {
  const d = new Date(utc);
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

export function fmtTime(utc: string): string {
  const d = new Date(utc);
  const p2 = (n: number) => (n < 10 ? '0' : '') + n;
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

export function dateKey(utc: string): string {
  const d = new Date(utc);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export const pad2 = (n: number) => (n < 10 ? '0' : '') + n;
