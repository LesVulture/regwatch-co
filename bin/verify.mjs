#!/usr/bin/env node
/**
 * verify — puerta de calidad del expediente.
 *
 * Sale con código 1 si algún registro no cumple el contrato de procedencia. Está
 * pensado para correr en CI: la garantía de que "todo registro es checkeable" no
 * es una promesa del README, es un test que falla.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readAll } from '../lib/store.mjs';
import { validateRecord } from '../lib/record.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { sources } = JSON.parse(readFileSync(join(ROOT, 'config', 'sources.json'), 'utf8'));
const records = readAll(join(ROOT, 'data', 'seed.jsonl'));

let errors = 0, incomplete = 0;
for (const r of records) {
  const errs = validateRecord(r, { sources });
  if (errs.length) { errors += errs.length; console.error(`❌ ${r.id}`); errs.forEach((e) => console.error(`   ${e}`)); }
  if (!r.date || r.status === 'desconocida') incomplete++;
}

const ids = records.map((r) => r.id);
for (const r of records) {
  for (const a of r.antecedents || []) {
    if (!ids.includes(a)) { errors++; console.error(`❌ ${r.id}: antecedente '${a}' no existe en el índice`); }
  }
}

console.log(`\n📚 ${records.length} registro(s) · ${new Set(ids).size} único(s)`);
console.log(`🔎 ${incomplete} con procedencia declarada como incompleta (fecha ausente o estado desconocido)`);
console.log(errors ? `\n❌ ${errors} violación(es) del contrato de procedencia` : `\n✅ Contrato de procedencia: sin violaciones`);
process.exit(errors ? 1 : 0);
