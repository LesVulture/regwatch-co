# Estado as-built de regwatch-co

Mapa de **lo que está construido**, no de lo que el plan promete. Recorte: **2026-08-21** (capturas vivas ~2026-08-22T04:08Z ≈ 23:08 COT).

- **Capturas vivas (manda):** [`docs/verificacion-viva-2026-08-21.md`](verificacion-viva-2026-08-21.md). `sources.ts` no se tocó.
- **Árbol de código:** g2, embeddings en MCP, `INSERT` de `captura` y `collect.yml` están en `main` (merge `1a18751`, [PR #1](https://github.com/LesVulture/regwatch-co/pull/1), 2026-08-22).
- **CI (2026-08-22):** `collect.yml` **está** en `origin/main`. GitHub registra el workflow `collect` (activo). Secreto `SUPABASE_DB_URL` **existe** (lista de secretos; el valor no se lee). `latido` corrió hoy en `main` por `schedule` (2026-08-22T06:56Z). `workflow_dispatch` de `collect` ([run 32585307087](https://github.com/LesVulture/regwatch-co/actions/runs/32585307087)): Senado/Corte/piloto/g2 en verde; **`db:load` de Senado escribió** (1693 enviadas, 1694 en `proyecto_ley`) — el secreto inyecta y conecta; **`db:load-providencias` exit 1** con artefacto de Corte del año a 0 ventanas / 0 providencias. El cron de hoy (07:41 UTC) ya había pasado al mergear.
- Contrato de evidencia: [`GOVERNANCE.md`](../GOVERNANCE.md).
- Plan histórico (no se reescribe): [`PLAN-V2.md`](../PLAN-V2.md).
- Claim público: [`README.md`](../README.md).

Si este fichero y `PLAN-V2.md` discrepan sobre **qué existe**, manda aquí. Si discrepan sobre **qué debe ser cierto de un dato**, manda GOVERNANCE.

---

## Qué se midió el 2026-08-21 (fuentes)

| Superficie | Medido vivo | Qué sigue siendo del 20 / desconocido |
|---|---|---|
| `pnpm verify` | Exit **0**. Vitest **578/578**. Next **16.3.1** build ok (Turbopack). (Más temprano el 21: 506/506.) | — |
| Senado PDLY | **1.693** proyectos, 5 legislaturas, g0 ok en las cinco. 2024-2025 **470** (era 471). 2026-2027 194 filas, bytes distintos (134.492 → 134.693). 2 × `crosswalk-incompleto` estables (ids 8981, 9018) | El id de la fila perdida: el artefacto del 20 no está versionado. Si la base viva se cargó el 20, sigue en 1.694 hasta un `db:load` |
| Corte 2026 | Ventana 2026: **1.152 / 1.152** (era 1.145). `max(fechaPublicacion)=2026-08-21` (7 ese día; 0 nulos). `max(fechaSentencia)` sigue 2026-08-13. g0 ok | El `artefactos/corte-relatoria.json` en disco **se restauró** al backfill 2015–2026 del 20 (**21.665**, 17 ventanas). Su rebanada 2026 sigue en 1.145. Las 7 nuevas no están fusionadas |
| Articulado Ley 1616 | g0 ok por página. **45** chunks (el del 20 tenía 37). **Exit 1**: `antsig` página1 ↔ `_pr001`. El árbol **detecta el ciclo** (`ciclo-paginacion`): 2 fetches únicos, no 15. Un Siguiente que vuelve no certifica la ley completa. `sources.ts` sin cambio | No es un collect limpio. En base sigue el articulado del 20 (37 chunks) si nadie lo recargó |
| Basedoc HTTP | 200, 113.145 B, hash `d55c43dc…` **idéntico** al 20. Sello `#update_date`: **15 de agosto de 2026** (DO 53.578, 5 de agosto). `Last-Modified` 15 Aug 2026 02:29:12 GMT. HTTPS: timeout 15 s, 0 bytes | El sello no avanzó entre el 20 y el 21. Edad del hecho: 144 h < cadencia 168 h |
| Fallos silenciosos | Siguen: GET PDLY sin form-data → 100/100. `maxprov=10001` → HTTP 200, `text/html`, **2.882 B**, `div_alert_danger` | Contrato de `sources.ts` intacto |

PDLY **no trae** `fecha_del_hecho`. Su frescura se mide por captura, no por hecho.

Gold set: `gold/preguntas.yaml` `_meta.proyectos` = **1693** (remedido 2026-08-21; el test de tamaño no se salta). La corrida Q&A 1/18 sigue siendo `gold-run-2026-08-20.json` (0 fantasma, 0 no literales, G009 ilegible).

---

## Frescura vs `cadenciaHoras` (juicio del verificador, no de g2)

A 2026-08-21 23:08 COT. Holguras de `g2-pulso` (×2 captura, ×3 hecho) **no** se aplicaron en esa tabla: el verificador comparó cadencia cruda.

| Fuente | Cadencia | Señal | Edad | Veredicto del 21 |
|---|---:|---|---|---|
| `senado-pdly` | 24 h | `capturedAt` 2026-08-22T04:07:58Z. Listado no congelado (−1 fila; bytes 2026-2027) | ~0 h (captura) | **Dentro** |
| `corte-relatoria` 2026 vivo | 24 h | `max(fechaPublicacion)=2026-08-21` | Hecho: mismo día civil COT | **Dentro** |
| `corte-relatoria` disco 2015–2026 | 24 h | Captura 2026-08-20T17:28Z; rebanada 2026 = 1.145 | ~34–36 h | **Fuera** — no hay fusión; el disco no es la ventana viva |
| `senado-basedoc` Ley 1616 | 168 h | Sello y `Last-Modified` = 2026-08-15. Hash página 1 sin cambiar | 6 d = 144 h | **Dentro**. El sello **no** se movió |

Antes del re-fetch, Senado y Corte en disco llevaban ~1 día (límite o por encima de 24 h).

---

## Qué corre (árbol, 2026-08-21 noche)

Leído de los ficheros, no inferido del plan.

| Superficie | Qué hace | Cómo se invoca |
|---|---|---|
| Senado PDLY | Artefacto JSON; `g0` por corrida. Última corrida viva: 1.693 | `pnpm collect:senado` → `pnpm db:load` (ahora también escribe `captura`) |
| Corte | Relatoría Elasticsearch. Runner acepta rango de años | `pnpm collect:corte` → `pnpm db:load-providencias` |
| Articulado basedoc | HTTP only. `collect:articulado` / `collect:piloto`. Ley 1616: **exit 1** con `ciclo-paginacion` declarado (2 URLs; no gira 15 veces) | `pnpm collect:articulado` → `pnpm db:load-chunks` |
| Leads basedoc | Runner `collect:basedoc` existe | `pnpm collect:basedoc` → `pnpm db:load-afectaciones` |
| Embeddings | `nomic-embed-text` en Ollama, 256 dims | `pnpm embed:chunks` |
| Web | `/` (q+tipo+año+atajos), `/proyectos`, `/providencias`, fichas, `/vigencia/…`, `/cobertura`. Tailwind 4 + componentes estilo shadcn (radix). Filtros en SQL. Serwist | `pnpm web:dev` |
| TUI | Ink: mismos filtros que la URL, lista+ficha, banner si Ollama no está | `pnpm tui` |
| Q&A CLI | `claude -p` + OAuth. Citas literales. **No hay chat en la web** (gold 1/18) | `pnpm qa` / `pnpm gold:run` |
| MCP | `buscar_normatividad` **embebe** con `embeberConsulta` (misma degradación léxica que la web, y lo declara). `consultar_vigencia` | `pnpm mcp:start` |
| g2-pulso | Lee `cadenciaHoras`. Senado: sin fecha de hecho → `sin_fecha_del_hecho` (no tumba). Zombie / `captura_stale` sí tumba | `pnpm g2 -- artefactos/…` |
| CI | `verify.yml` push/PR. `gold.yml` lunes. `latido.yml` cada 3 días (activo en `main`). **`collect.yml`** en `main`: cron 07:41 UTC (Senado + Corte del año + piloto + g2 + load) | GitHub Actions |

`collect.yml` está en `main`. El evento `schedule` de GitHub **solo corre sobre la rama por defecto**. El secreto `SUPABASE_DB_URL` está puesto y **conectó** en el dispatch (Senado cargó). El job entero salió rojo porque `db:load-providencias` trata «nada que cargar» como exit 1 — no es un secreto ausente. Sin el secreto, collect dejaría artefactos en el runner (efímeros) y saldría 0.

Cámara, DNP, Función Pública y La Silla Vacía: **no se abrieron**. Siguen gated / excluidas. Peticiones en borrador.

---

## Gates

Existen [`g0-contrato`](../collectors/src/gates/g0-contrato.ts) y [`g2-pulso`](../collectors/src/gates/g2-pulso.ts) (`pnpm g2`, cableado en `collect.yml`). No hay `g1` / `g3`–`g6`.

No confundir con [`docs/gate2-verificacion.md`](gate2-verificacion.md): es la verificación de **extensiones** de la Fase 0, no el pulso.

---

## Última captura (dos capas)

`artefactos/` no se versiona.

### Vivo 2026-08-21 (verificacion-viva)

| Qué | Captura | Volumen | Gate / exit |
|---|---|---|---|
| Senado 2022–2027 | 2026-08-22T04:07Z | **1.693** (2024-2025: 470) | g0 ok · exit 0 · 2 crosswalk-incompleto |
| Corte solo 2026 | 2026-08-22T04:08:30Z | **1.152 / 1.152** | g0 ok · exit 0 |
| Ley 1616 articulado | misma noche (15 peticiones, pre-parche) | 45 chunks, 2 URLs | Árbol ahora: 2 fetches + `ciclo-paginacion` · **exit 1** |
| Basedoc p.1 Ley 1616 | hash = 2026-08-20 | 113.145 B | Sello **2026-08-15** · HTTPS timeout |

### Disco / base que no se re-midió

| Artefacto o claim | Fecha | Filas | Nota |
|---|---|---|---|
| `corte-relatoria.json` restaurado | 2026-08-20T17:26–17:28Z | 21.665 (17 ventanas) | Rebanada 2026 = 1.145, **desfasada en 7** |
| Gold | 2026-08-20 | 18 preguntas | 1 publicable (G014) |
| Articulados 1751, 1098, 2136, 1757, 2195, 1448 | 2026-08-20T17:59Z | 26+45+44+41+43+50 | No re-fetch |
| Ley 1581 / 1712 | 2026-08-20 | 55 / 36 | Siguen sin cargar (duplicados + artículos-monstruo) |
| Corpus en base (README 2026-08-20) | 2026-08-20 | 8 normas, 7 con articulado, 286 chunks | **No se recontó** contra Supabase esta noche |

---

## Esquema y `captura`

Ocho tablas: `captura`, `norma`, `norma_version`, `afectacion`, `proyecto_ley`, `providencia`, `chunk`, `suscripcion`.

`captured_at NOT NULL` en las siete de hechos. `suscripcion` usa `creada_en`.

`db/import-captura.ts` genera `INSERT … ON CONFLICT (url, content_hash)`. Lo llaman `db/load.ts`, `load-providencias.ts`, `load-chunks.ts` y `load-afectaciones.ts`. `blob_uri` va NULL (no hay R2). **No se midió** cuántas filas hay en la instancia viva.

Siguen sin existir las entidades FRBR/evento del §5.1: `tramite_evento`, `gaceta`, `articulo`, `cita`, `conpes`, `tema`.

---

## Biblioteca / slope (árbol)

| Pieza | Estado |
|---|---|
| `alertas/` | Sigue sin runner de tanda ni correo |
| `modelo/aprobacion.ts` | Sin CLI. Cámara gated |
| `escaneo-iterativo.ts` | Comprobar callers si se toca; no forma parte de la verificación viva |
| `crawlee` / `feedsmith` / `playwright` / `unpdf` | **Quitados** de `collectors/package.json` (`higiene-deps.test.ts` afirma la ausencia) |

---

## Stack real vs PLAN-V2 §9

Árbol al 2026-08-22 (UI): Next **16.3.1** sin `cacheComponents` en config, **sin** `proxy.ts`, **Tailwind CSS 4** (`@import "tailwindcss"` + `@tailwindcss/postcss`) y componentes shadcn a mano con `--base radix` (no AI SDK, no chat). `@serwist/turbopack@9.5.12` `swUrl="/~serwist/sw.js"`. TUI Ink **7.1.1** en `tui/`. pnpm **11.22.0** + `allowBuilds`/`strictDepBuilds`, MCP SDK `^1.24.1`, Vitest **3.2.4**, coste IA = 0 (Ollama + `claude -p`).

Los números de captura y el `web:build` de Next 16.3.1 siguen siendo los del recorte 2026-08-21. Esta pasada no re-midió el corpus.

Library ids: `/vercel/next.js`, `/websites/pnpm_io`, `/modelcontextprotocol/typescript-sdk`, `/websites/serwist_pages_dev`, `/websites/tailwindcss`.

---

## Q&A: 1 de 18 (corrida del 20; corpus gold = 1.693)

`preguntas.yaml` `_meta` remedido el 21: **1.693** proyectos. El 1/18 publicable es la corrida `gold-run-2026-08-20.json`, no una nueva tanda de `pnpm gold:run`.

---

## Flujos rotos medidos (no parcheados)

1. **Articulado Ley 1616:** el ciclo `antsig` se **declara** (`ciclo-paginacion`) y se corta a 2 URLs. **Exit 1** igual: un Siguiente que loopéa no certifica la ley. g0 no falló. `sources.ts` intacto.
2. **Corte disco ≠ Corte vivo:** 21.665 del 20 vs 1.152 de 2026 hoy. Quien cargue el JSON restaurado escribe la rebanada vieja.
3. **GET PDLY / `maxprov=10001`:** mismos éxitos falsos del 20. El colector no usa esos modos; una receta que sí, miente.

---

## Lo que el plan promete y el árbol aún no cierra

Dumps semanales a git · frescura por fuente en la UI · API JSON · timeline · perfiles · CONPES ingerido · prensa · Cámara en ejecución · OCR · alertas encadenadas · gates `g1`/`g3`–`g6` · Q&A en la UI · `proxy.ts` · fusionar la ventana 2026 viva al backfill · paginación basedoc · tabla `tema` / clasificador de 45 temas.

Ya **no** es hueco en el árbol (otra cosa es que haya corrido en prod): `g2-pulso`, embeddings MCP, `INSERT` de `captura` (meta + hash), `collect.yml` diario en `main` con `SUPABASE_DB_URL`, enlace búsqueda → vigencia, `collect:basedoc` / `db:load-afectaciones`, filtros de búsqueda en SQL (`legislatura`, `estado`, `camara` del trámite según Senado, `anio`, paginación `hay_mas`), browse `/proyectos` y `/providencias`, fichas, `/cobertura`, TUI Ink (`pnpm tui`), Tailwind 4 en `web/`. El dispatch del 22 **no** es un collect verde: `load-providencias` sale 1 si el artefacto de Corte del año viene vacío. Los filtros SQL **hay que desplegarlos** en la instancia (`DROP`+`CREATE`; `db:drift` revierte y no persiste).

**Instancia viva 2026-08-22 (PostgREST, no snapshot):** `hybrid_search` / `busqueda_lexica` / `consultar_vigencia` sí están. `ficha_proyecto`, `ficha_providencia`, `listar_proyectos`, `opciones_filtro_proyectos` **no** (PGRST202). Las tablas `proyecto_ley` y `providencia` sí se leen con anon (200). La web, ante PGRST202, proyecta la ficha/listado desde esas tablas — la misma forma que `10_listados.sql`, por la misma puerta de egreso. Un clic a un resultado ya no enseña el JSON de PostgREST. `filtro_anio` / `desplazamiento` en `hybrid_search` tampoco están: se reintenta sin ellos y se declara; no se filtra post-LIMIT.

---

## Cómo se mantiene este fichero

Tras un re-fetch: actualizar la tabla de «qué se midió» y citar `docs/verificacion-viva-AAAA-MM-DD.md`. El árbol de código se relee; no se asume el plan. No reescribir `PLAN-V2.md` ni `research/`.
