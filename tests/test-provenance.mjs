#!/usr/bin/env node
/** Pruebas del contrato de procedencia. Sin framework: assert de Node. */
import assert from 'node:assert/strict';
import { validateRecord, slugId } from '../lib/record.mjs';
import { classify } from '../lib/topics.mjs';

const sources = { oficial: { tier: 'primaria' }, prensa: { tier: 'institucional' } };
const base = {
  id: 'ley:1-2020', kind: 'ley', title: 'x', source: 'oficial',
  source_url: 'https://ejemplo.gov.co/n', retrieved_at: '2026-08-15',
  tier: 'primaria', capture: 'resumen', status: 'vigente',
};
let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };

console.log('contrato de procedencia');
t('un registro completo pasa', () => assert.equal(validateRecord(base, { sources }).length, 0));
t('exige source_url checkeable', () =>
  assert.match(validateRecord({ ...base, source_url: 'ver archivo local' }, { sources })[0], /URL http/));
t('un registro no puede superar el tier de su fuente', () =>
  assert.match(validateRecord({ ...base, source: 'prensa' }, { sources })[0], /supera al de su fuente/));
t('vigencia exige fuente primaria', () =>
  assert.ok(validateRecord({ ...base, source: 'prensa', tier: 'institucional' }, { sources })
    .some((e) => /exige tier='primaria'/.test(e))));
t('solo se cita lo capturado verbatim', () =>
  assert.ok(validateRecord({ ...base, quote: 'texto' }, { sources }).some((e) => /verbatim/.test(e))));
t('acepta cita cuando la captura es verbatim', () =>
  assert.equal(validateRecord({ ...base, quote: 'texto', capture: 'verbatim' }, { sources }).length, 0));
t('rechaza fuente no declarada', () =>
  assert.match(validateRecord({ ...base, source: 'inventada' }, { sources })[0], /no está en config/));
t('el id es estable y sin acentos', () =>
  assert.equal(slugId('ley', 'Protección de Datos', 2012), 'ley:proteccion-de-datos-2012'));

console.log('clasificación temática');
const topics = { 'ia-tech': { label: 'IA', terms: ['inteligencia artificial', 'habeas data'] } };
t('clasifica y reporta el término que disparó', () => {
  const r = classify('Regula la Inteligencia Artificial en Colombia', topics);
  assert.equal(r[0].topic, 'ia-tech');
  assert.deepEqual(r[0].hits, ['inteligencia artificial']);
});
t('es insensible a acentos y mayúsculas', () =>
  assert.equal(classify('HÁBEAS DATA financiero', topics).length, 1));
t('no clasifica lo que no corresponde', () =>
  assert.equal(classify('Reforma pensional', topics).length, 0));

console.log(`\n✅ ${n} pruebas`);
