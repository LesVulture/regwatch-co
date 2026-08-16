/**
 * Almacén append-only en JSONL.
 *
 * Append-only a propósito: el historial de cómo se vio una norma en el tiempo ES
 * el dato. Si un registro cambia (una ley se deroga, un proyecto se archiva), se
 * añade una versión nueva; no se sobrescribe la anterior. `latest()` resuelve la
 * versión vigente por id, y el resto queda como rastro auditable.
 */
import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function readAll(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.trimStart().startsWith('//'))
    .map((l, i) => {
      try { return JSON.parse(l); } catch { throw new Error(`${path}:${i + 1} no es JSON válido`); }
    });
}

export function append(path, records) {
  const list = Array.isArray(records) ? records : [records];
  if (!list.length) return 0;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, list.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return list.length;
}

/** Última versión de cada id, conservando el orden de primera aparición. */
export function latest(records) {
  const byId = new Map();
  for (const r of records) byId.set(r.id, r);
  return [...byId.values()];
}

/** Todas las versiones de un id, en orden de captura. */
export function history(records, id) {
  return records.filter((r) => r.id === id);
}
