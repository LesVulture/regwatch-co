/**
 * TUI sin dependencias.
 *
 * Cero paquetes de terceros es una decisión de diseño, no una limitación: una
 * herramienta que se usa para consolidar evidencia normativa no debería arrastrar
 * un árbol de dependencias que nadie audita. Todo lo que hay aquí es ANSI y
 * `readline` de Node.
 */
const ESC = '\x1b[';
export const c = {
  reset: `${ESC}0m`, bold: `${ESC}1m`, dim: `${ESC}2m`, rev: `${ESC}7m`,
  red: `${ESC}31m`, green: `${ESC}32m`, yellow: `${ESC}33m`,
  blue: `${ESC}34m`, magenta: `${ESC}35m`, cyan: `${ESC}36m`, grey: `${ESC}90m`,
};

export const clear = () => process.stdout.write(`${ESC}2J${ESC}H`);
export const width = () => process.stdout.columns || 80;
export const height = () => process.stdout.rows || 24;

/** Longitud visible, ignorando secuencias ANSI. */
export const vlen = (s) => s.replace(/\x1b\[[0-9;]*m/g, '').length;

/** Trunca respetando ANSI (corta por caracteres visibles y cierra el estilo). */
export function trunc(s, max) {
  if (vlen(s) <= max) return s;
  let out = '', seen = 0, i = 0;
  while (i < s.length && seen < max - 1) {
    if (s[i] === '\x1b') {
      const m = /^\x1b\[[0-9;]*m/.exec(s.slice(i));
      if (m) { out += m[0]; i += m[0].length; continue; }
    }
    out += s[i]; seen++; i++;
  }
  return out + '…' + c.reset;
}

export function rule(ch = '─') { return c.grey + ch.repeat(width()) + c.reset; }

/** Envuelve texto plano a un ancho dado. */
export function wrap(text, w) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let cur = '';
  for (const word of words) {
    if (!cur.length) { cur = word; continue; }
    if (cur.length + 1 + word.length <= w) cur += ' ' + word;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  return lines;
}

const TIER_COLOR = { primaria: c.green, institucional: c.yellow, secundaria: c.red };
const STATUS_COLOR = {
  vigente: c.green, 'en-tramite': c.cyan, derogada: c.red,
  archivada: c.grey, desconocida: c.yellow,
};

export const tierBadge = (t) => `${TIER_COLOR[t] || c.grey}${t}${c.reset}`;
export const statusBadge = (s) => `${STATUS_COLOR[s] || c.grey}${s}${c.reset}`;

/**
 * Marca de integridad de procedencia. Es lo primero que se ve en cada fila, y esa
 * jerarquía visual es deliberada: antes de leer QUÉ dice un registro conviene
 * saber CUÁNTO se puede apoyar uno en él.
 */
export function provenanceMark(rec) {
  const complete = rec.source_url && rec.retrieved_at && rec.date && rec.status !== 'desconocida';
  if (complete && rec.tier === 'primaria') return `${c.green}●${c.reset}`;
  if (complete) return `${c.yellow}●${c.reset}`;
  return `${c.red}○${c.reset}`;
}
