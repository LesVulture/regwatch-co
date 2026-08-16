#!/usr/bin/env node
/**
 * regwatch — monitor TUI de normatividad colombiana.
 *
 * Uso:  node bin/regwatch.mjs            (TUI interactiva)
 *       node bin/regwatch.mjs --list     (volcado no interactivo, para pipes y CI)
 *       node bin/regwatch.mjs --topic ia-tech
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import readline from 'node:readline';
import { readAll, latest } from '../lib/store.mjs';
import { classify, indexableText } from '../lib/topics.mjs';
import { validateRecord } from '../lib/record.mjs';
import * as ui from '../lib/tui.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = (f) => JSON.parse(readFileSync(join(ROOT, 'config', f), 'utf8'));
const { topics } = cfg('topics.json');
const { sources } = cfg('sources.json');

const records = latest(readAll(join(ROOT, 'data', 'seed.jsonl')))
  .map((r) => ({ ...r, _topics: classify(indexableText(r), topics) }))
  .sort((a, b) => String(b.date || '0000').localeCompare(String(a.date || '0000')));

const args = process.argv.slice(2);
const argOf = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };

let filter = argOf('--topic');
let view = 'list';
let cursor = 0;

const visible = () => (filter ? records.filter((r) => r._topics.some((t) => t.topic === filter)) : records);

// ─── Modo no interactivo ─────────────────────────────────────────────────────
if (args.includes('--list') || !process.stdout.isTTY) {
  const rows = visible();
  console.log(`regwatch — ${rows.length} registro(s)${filter ? ` · tema: ${filter}` : ''}\n`);
  for (const r of rows) {
    console.log(`${ui.provenanceMark(r)} ${r.date || '    ?    '}  ${r.title}`);
    console.log(`   ${ui.tierBadge(r.tier)} · ${ui.statusBadge(r.status)} · ${ui.c.grey}${r.source_url}${ui.c.reset}`);
  }
  const bad = rows.flatMap((r) => validateRecord(r, { sources }).map((e) => `${r.id}: ${e}`));
  if (bad.length) console.log(`\n${ui.c.red}${bad.length} problema(s) de procedencia — corre bin/verify.mjs${ui.c.reset}`);
  process.exit(0);
}

// ─── TUI ─────────────────────────────────────────────────────────────────────
function header() {
  const t = filter ? `${topics[filter]?.label || filter}` : 'todos los temas';
  console.log(`${ui.c.bold}regwatch${ui.c.reset} ${ui.c.grey}· monitor normativo Colombia${ui.c.reset}  ${ui.c.dim}[${t}]${ui.c.reset}`);
  console.log(ui.rule());
}

function footer(extra = '') {
  console.log(ui.rule());
  const keys = view === 'list'
    ? '↑↓ mover · ⏎ detalle · t tema · / buscar · v verificar · q salir'
    : '← volver · q salir';
  console.log(`${ui.c.grey}${keys}${extra ? '  ·  ' + extra : ''}${ui.c.reset}`);
}

function renderList() {
  ui.clear(); header();
  const rows = visible();
  if (!rows.length) { console.log(`${ui.c.yellow}Sin registros para este filtro.${ui.c.reset}`); footer(); return; }
  const room = Math.max(3, ui.height() - 6);
  const start = Math.max(0, Math.min(cursor - Math.floor(room / 2), rows.length - room));
  rows.slice(start, start + room).forEach((r, i) => {
    const idx = start + i;
    const sel = idx === cursor;
    const line = `${ui.provenanceMark(r)} ${ui.c.grey}${(r.date || '?').padEnd(10)}${ui.c.reset} ${r.title}`;
    console.log(sel ? `${ui.c.rev}${ui.trunc(line, ui.width() - 1)}${ui.c.reset}` : ui.trunc(line, ui.width() - 1));
  });
  footer(`${cursor + 1}/${rows.length}`);
}

function renderDetail() {
  ui.clear(); header();
  const r = visible()[cursor];
  if (!r) { footer(); return; }
  const w = Math.min(ui.width() - 2, 100);
  const field = (k, v) => console.log(`${ui.c.grey}${k.padEnd(13)}${ui.c.reset}${v}`);

  console.log(`${ui.c.bold}${ui.trunc(r.title, w)}${ui.c.reset}\n`);
  field('tipo', r.kind);
  field('fecha', r.date || `${ui.c.yellow}no verificada${ui.c.reset}`);
  field('autoridad', r.authority || '—');
  field('evidencia', `${ui.tierBadge(r.tier)} · captura ${r.capture}`);
  field('estado', ui.statusBadge(r.status));
  field('fuente', `${sources[r.source]?.label || r.source}`);
  field('url', `${ui.c.cyan}${r.source_url}${ui.c.reset}`);
  field('capturado', r.retrieved_at);

  if (r._topics.length) {
    console.log(`\n${ui.c.bold}Temas${ui.c.reset} ${ui.c.grey}(y el término exacto que los disparó)${ui.c.reset}`);
    for (const t of r._topics) {
      console.log(`  ${ui.c.magenta}${t.topic}${ui.c.reset} ${ui.c.grey}← ${t.hits.slice(0, 4).join(', ')}${ui.c.reset}`);
    }
  }
  if (r.summary) {
    console.log(`\n${ui.c.bold}Resumen${ui.c.reset}`);
    ui.wrap(r.summary, w).forEach((l) => console.log('  ' + l));
  }
  if (r.antecedents?.length) {
    console.log(`\n${ui.c.bold}Antecedentes${ui.c.reset}`);
    r.antecedents.forEach((a) => {
      const found = records.find((x) => x.id === a);
      console.log(`  ${ui.c.grey}→${ui.c.reset} ${found ? found.title : `${a} ${ui.c.red}(no está en el índice)${ui.c.reset}`}`);
    });
  }
  if (r.note) {
    console.log(`\n${ui.c.bold}${ui.c.yellow}Nota de procedencia${ui.c.reset}`);
    ui.wrap(r.note, w).forEach((l) => console.log('  ' + ui.c.yellow + l + ui.c.reset));
  }
  const errs = validateRecord(r, { sources });
  if (errs.length) {
    console.log(`\n${ui.c.red}${ui.c.bold}Procedencia incompleta${ui.c.reset}`);
    errs.forEach((e) => console.log(`  ${ui.c.red}✗ ${e}${ui.c.reset}`));
  }
  footer();
}

const render = () => (view === 'list' ? renderList() : renderDetail());

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);
render();

process.stdin.on('keypress', (str, key) => {
  const rows = visible();
  if (key.ctrl && key.name === 'c') { ui.clear(); process.exit(0); }
  if (view === 'detail') {
    if (['left', 'escape', 'backspace', 'return'].includes(key.name)) view = 'list';
    else if (str === 'q') { ui.clear(); process.exit(0); }
    return render();
  }
  switch (key.name) {
    case 'up': cursor = Math.max(0, cursor - 1); break;
    case 'down': cursor = Math.min(rows.length - 1, cursor + 1); break;
    case 'return': if (rows.length) view = 'detail'; break;
    default:
      if (str === 'q') { ui.clear(); process.exit(0); }
      if (str === 't') {
        const keys = [null, ...Object.keys(topics)];
        filter = keys[(keys.indexOf(filter) + 1) % keys.length];
        cursor = 0;
      }
      if (str === 'v') {
        ui.clear();
        const bad = records.flatMap((r) => validateRecord(r, { sources }).map((e) => `${r.id}: ${e}`));
        console.log(bad.length
          ? `${ui.c.red}${bad.length} problema(s):${ui.c.reset}\n` + bad.map((b) => '  ' + b).join('\n')
          : `${ui.c.green}Procedencia completa en los ${records.length} registros.${ui.c.reset}`);
        console.log(`\n${ui.c.grey}cualquier tecla para volver${ui.c.reset}`);
        return process.stdin.once('keypress', render);
      }
  }
  render();
});
