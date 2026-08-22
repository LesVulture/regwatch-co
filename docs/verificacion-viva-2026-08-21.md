# Verificación viva — 2026-08-21

Re-fetch contra fuentes oficiales y contraste con `collectors/src/sources.ts`.
No se tocó Cámara, DNP, Función Pública ni La Silla Vacía. UA identificado:
`regwatch-co/0.1 (+https://github.com/LesVulture/regwatch-co)`. Cortesía 2 s
entre peticiones al mismo host. Sin APIs de pago.

Hora de las capturas: **2026-08-22T04:08Z** ≈ 2026-08-21 23:08 COT.

`sources.ts` **no se modificó**: content-type, envelope, tope silencioso y
marcadores de error siguen siendo los medidos el 2026-08-20.

---

## 1. `pnpm verify`

| | |
|---|---|
| Comando | `pnpm verify` (`lint` + `typecheck` + `test` + `web:build`) |
| Exit | **0** |
| Biome | 91 ficheros. 1 *info* (`lint/style/useTemplate` en `collectors/src/rag/qa.test.ts:63`). No es error. |
| `tsc --noEmit` | ok |
| Vitest | 31 ficheros, **506/506** tests |
| `web:build` | Next.js 16.3.1 (Turbopack), compile ok |

---

## 2. Senado — `pnpm collect:senado`

Ventana completa 2022–2027 (5 legislaturas). POST form-data a
`https://leyes.senado.gov.co/api/search_pdly.php`. g0 **ok** en las cinco.

| Legislatura | Gate | Filas | `total_results` | Bytes | Anomalías |
|---|---|---:|---:|---:|---|
| 2022-2023 | ok | 345 | 345 | 253 348 | — |
| 2023-2024 | ok | 304 | 304 | 220 529 | 2 × `crosswalk-incompleto` (ids 8981, 9018; iguales que el 2026-08-20) |
| 2024-2025 | ok | 470 | 470 | 349 516 | — |
| 2025-2026 | ok | 380 | 380 | 256 846 | — |
| 2026-2027 | ok | 194 | 194 | 134 693 | — |
| **Total** | | **1 693** | | | 0 bloqueadas |

Exit del colector: **0**. Artefacto: `artefactos/senado-pdly.json` (esta corrida).

Delta vs artefacto 2026-08-20 (1 694 filas): **2024-2025 471 → 470**. 2022-2023,
2023-2024 y 2025-2026, mismos bytes. 2026-2027 sigue en 194 filas pero los bytes
cambiaron (134 492 → 134 693): el listado se movió sin cambiar el conteo.

PDLY **no trae** `fecha_del_hecho`. La frescura se mide por captura.

Sonda extra (GET `?legislatura=2026-2027`, no form-data): HTTP 200,
`Content-Type: application/json; charset=utf-8`, **100 filas y
`total_results=100`**. El tope silencioso documentado el 2026-08-20 sigue activo.
El colector no usa este modo.

---

## 3. Corte — `pnpm collect:corte 2026 2026`

Año 2026 entero (el backfill 2015–2026 tardaría de más). Fetch real, no fixture.
g0 **ok**. Sin partición: 1 152 ≤ `maxprov` 2 000.

| | 2026-08-20 (artefacto completo) | Esta corrida (solo 2026) |
|---|---|---|
| Ventana | 2026-01-01..2026-12-31 | igual |
| Gate | ok | ok |
| Providencias / declarado | 1 145 / 1 145 | **1 152 / 1 152** |
| Bytes | 2 283 091 | 2 309 910 |
| Anomalías | 0 | 0 |
| `max(fechaPublicacion)` | 2026-08-20 | **2026-08-21** (7 ese día; 0 nulos de 1 152) |
| `max(fechaSentencia)` | 2026-08-13 | 2026-08-13 |
| `capturedAt` | 2026-08-20T17:28:51Z | 2026-08-22T04:08:30Z |

Exit: **0**. El fichero `artefactos/corte-relatoria.json` **se restauró** al
backfill 2015–2026 del 2026-08-20 (21 665 providencias, 17 ventanas) para no
tirar 2015–2025. En disco, la rebanada 2026 de ese artefacto sigue en 1 145; lo
vivo de hoy es 1 152.

Sonda `maxprov=10001` (misma ventana 2026): HTTP 200, `Content-Type:
text/html; charset=UTF-8`, **2 882 bytes**, fragmento HTML con
`id="div_alert_danger"` / `alert-danger`. No parsea como JSON. El cuerpo bueno
y el de error siguen llegando con el mismo content-type. Contrato intacto.

---

## 4. Articulado piloto — `pnpm collect:articulado Ley 1616 2013`

HTTP `http://www.secretariasenado.gov.co/senado/basedoc/ley_1616_2013.html`.
g0 **ok** en cada página pedida.

| | |
|---|---|
| Título extraído | Por medio de la cual se expide la ley de Salud Mental y se dictan otras disposiciones. |
| Chunks | 45 (el artefacto 2026-08-20 tenía 37; era una sola página) |
| Contaminados / ids duplicados | 0 / 0 |
| Páginas pedidas | 15 (`MAX_PAGINAS`) |
| URLs distintas | 2: `ley_1616_2013.html` (113 145 B, hash `d55c43dc…` **idéntico** al 2026-08-20) y `ley_1616_2013_pr001.html` (28 731 B) |
| `paginacionIncompleta` | **true** |
| Exit | **1** |

El ancla `antsig` de la página 1 apunta a `_pr001.html`. Esa segunda página
vuelve a la primera: el colector entra en un ciclo de dos URLs, toca el techo
de 15 y se niega a cargar. No se parcheó el parser (otro hilo). No es cambio de
contrato de `sources.ts`.

`Content-Type` observado en el artefacto: `text/html` (sin charset en el
header). El HTML declara `charset=ISO-8859-1`. Byte 303 = `0xed`, igual que la
medición previa.

---

## 5. Basedoc por HTTP — sello «Última actualización»

GET (no HTTPS) de la misma URL, UA identificado.

| | |
|---|---|
| Status | 200 |
| `Content-Type` | `text/html` (Apache/2.2.22; el header **no** declara charset) |
| `Content-Length` | 113 145 |
| `Last-Modified` | Sat, 15 Aug 2026 02:29:12 GMT |
| SHA-256 | `d55c43dcb3763c5c0dcdf51580b833a38067b03063c159b013b026079f32988a` |

Sello en `#update_date` (entidades HTML resueltas):

> Última actualización: **15 de agosto de 2026** — (Diario Oficial No. **53.578** — 5 de agosto de 2026)

ISO del sello: **2026-08-15**. No se ha movido respecto de la captura del
2026-08-20 ni del `Last-Modified`.

HTTPS a la misma ruta: `curl` exit 28, timeout a los 15 s, 0 bytes. `httpOnly`
sigue siendo cierto.

---

## 6. Frescura vs `cadenciaHoras`

| Fuente | `cadenciaHoras` | Señal | Edad a 2026-08-21 23:08 COT | Veredicto |
|---|---:|---|---|---|
| `senado-pdly` | 24 | `capturedAt` 2026-08-22T04:07:58Z. No hay fecha de hecho en el envelope. | ~0 h (captura). El listado no está congelado: −1 fila en 2024-2025; bytes distintos en 2026-2027. | **Dentro.** |
| `corte-relatoria` (2026 vivo) | 24 | `max(fechaPublicacion)=2026-08-21`; captura 2026-08-22T04:08:30Z. +7 providencias vs 2026-08-20. | Hecho más reciente: mismo día civil COT. Captura ~0 h. | **Dentro.** |
| `corte-relatoria` (artefacto 2015–2026 en disco) | 24 | Captura 2026-08-20T17:28Z; rebanada 2026 = 1 145 (desfasada en 7). | ~34–36 h | **Fuera de cadencia** — no hay cron; el disco no se actualizó en el backfill completo. |
| `senado-basedoc` Ley 1616 | 168 (7 d) | Sello y `Last-Modified` = 2026-08-15. Hash de página 1 sin cambiar. | 6 d = 144 h | **Dentro** de 168 h. El sello **no** avanzó entre el 20 y el 21. |

Antes de este re-fetch, Senado y Corte en disco llevaban ~1 día (límite o
por encima de 24 h). Basedoc ya estaba dentro de la semana.

---

## 7. Contrato vs `sources.ts`

Nada que actualizar. Remedido:

| Clave | Declarado | Observado 2026-08-21 |
|---|---|---|
| `senado-pdly` | `application/json`, form-data filtra, GET/JSON topa en 100 | `application/json; charset=utf-8`. Form-data: filas = `total_results` (194 en 2026-2027). GET: 100/100. |
| `corte-relatoria` | `text/html`, JSON en el cuerpo bueno, `maxprov=10001` → fragmento con `div_alert_danger` | Bueno: g0 ok, envelope `{data, parametros}`. Error: 2 882 B, mismos marcadores, mismo CT. |
| `senado-basedoc` | HTML, HTTP-only, ISO-8859-1, `minBytes` 20 000 | HTTP 200 `text/html`, HTTPS timeout, meta ISO-8859-1, 113 145 B y 28 731 B. |

---

## 8. Anomalías (hechos, no inflados)

1. Senado 2024-2025 perdió 1 proyecto (471 → 470) entre el 20 y el 21. No se
   identificó el id: el artefacto anterior no está versionado.
2. Dos `crosswalk-incompleto` estables en 2023-2024 (acumulados sin año).
3. Articulado Ley 1616: paginación `antsig` cíclica (2 URLs × techo 15). Exit 1.
   g0 no falló. El piloto **no es cargable** en esta corrida.
4. Artefacto completo de Corte en disco sigue siendo el del 20; la ventana 2026
   viva (1 152) no está fusionada.
5. No hay cron de recolección. `cadenciaHoras` no lo lee ningún gate (sigue
   siendo solo `g0`).

`sources.ts` cambió: **no**.
