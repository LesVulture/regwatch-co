# regwatch-co — Monitor normativo y legislativo colombiano

Motor de búsqueda y monitoreo de la normatividad y la actividad legislativa de Colombia, consultable desde el móvil, capaz de responder preguntas en lenguaje natural **con cada afirmación anclada a fuente primaria con URL y fecha de captura**. La tesis pide datos frescos desde fuentes oficiales. **`collect.yml` está programado a diario** (Senado + Corte del año + piloto); **no se ha observado** que esa corrida de Actions haya terminado bien (ver `docs/ESTADO.md`).

**As-built:** [`docs/ESTADO.md`](docs/ESTADO.md) y el [`README.md`](README.md). **Contrato de evidencia:** [`GOVERNANCE.md`](GOVERNANCE.md). **Plan histórico de construcción:** [`PLAN-V2.md`](PLAN-V2.md) (no se reescribe el cuerpo). Si ESTADO y el plan discrepan sobre **qué existe**, manda ESTADO. Si discrepan sobre **qué debe ser cierto de un dato**, manda GOVERNANCE.

---

## La regla que define el proyecto (CRÍTICA)

**Ningún dato entra sin procedencia checkeable.** No es una preferencia de estilo: es la tesis del producto y lo único que lo diferencia de lo que ya existe.

- Todo registro lleva **URL de fuente primaria + fecha de captura**.
- Jerarquía probatoria: `primaria > institucional > secundaria`. El campo se declara, no se infiere.
- `vigente` **exige fuente primaria**. Sin cadena de evidencia completa, la respuesta es literalmente «vigencia no confirmada con fuente primaria».
- **La incertidumbre se declara, nunca se rellena.** Un `NULL` honesto vale más que una fecha plausible.
- Nunca se guarda prosa editorial de terceros como registro. Se guarda **el hecho**, y la prosa se descarta (`PLAN-V2.md` §5.2).

### Prohibido inventar datos

No completes un campo porque «probablemente sea así». No infieras una fecha de vigencia. No supongas que un endpoint devuelve lo que su documentación dice. **Ábrelo y compruébalo.**

Precedente vivo, y por eso esta regla existe: en la investigación previa, el **15 % de lo que los especialistas reportaron resultó falso** al auditarse — incluida una receta de scraping que devolvía cero filas, un endpoint que fallaba en silencio con HTTP 200, y una defensa contra un modo de fallo que no existe.

---

## Estado del proyecto

**Operativo de punta a punta, con el corpus cargado** (2026-08-20; recorte as-built 2026-08-21 en `docs/ESTADO.md`). El v1 fue un intento fallido: cero recolección, clasificación léxica pura, JSONL sin motor de consulta, sin modelo de vigencia. Se conserva de él únicamente el contrato de evidencia.

La **base cargada** (2026-08-20, no recontada) tiene 1.694 proyectos, 21.665 providencias y 286 fragmentos de articulado de **7 normas** (8 filas en `norma`: la Ley 2460 de 2025 es afectante, sin texto). El re-fetch de Senado del **2026-08-21** es **1.693**. Se busca, se consulta vigencia y el Q&A ancla citas. El MCP **embebe** con `embeberConsulta` (degrada a léxico si no hay Ollama, y lo declara). Gates: `g0-contrato` y `g2-pulso`. Cámara está gated; las peticiones en `legal/peticiones/` son borrador, no radicadas. No hay `proxy.ts`. `collect:articulado Ley 1616 2013` sale **exit 1**: declara `ciclo-paginacion` y para a las 2 URLs (no pide 15). No es un collect limpio. El estado real y sus límites, en el README.

**Y una advertencia contra el optimismo, que es el sesgo de este fichero:** «se responde con citas comprobadas» describe la MECÁNICA, no la cobertura. En la corrida del gold set del 2026-08-20, 1 de 18 preguntas superó el umbral de publicación — con 0 citas fantasma y 0 citas falsas, que es lo que la mecánica sí garantiza. El cuello de botella es el corpus (7 normas con articulado) y el hecho de que una negativa honesta no tiene nada que citar y por tanto se borra. Antes de escribir en ningún sitio que el Q&A «funciona», leer README §«El 1 de 18, explicado».

**Y cuesta cero:** no hay ninguna clave de API de pago. Embeddings con **nomic-embed-text en Ollama local**, Q&A con **`claude -p` y la sesión OAuth del usuario**. Eso SUPERA el presupuesto de `PLAN-V2.md` §8.2, que está anotado como tal en el propio plan. Antes de reintroducir un proveedor de pago, es una decisión del dueño, no un detalle de implementación.

Roadmap histórico en `PLAN-V2.md` §11; lo que de eso está hecho, en `docs/ESTADO.md`. Presupuesto en §11 bis (superado en su partida de IA).

---

## Mapa del repo

| Ruta | Qué es |
|---|---|
| `docs/ESTADO.md` | **As-built.** Qué corre, qué está gated, stack real vs §9, fechas de captura |
| `PLAN-V2.md` | Plan histórico de construcción (15 secciones). No se reescribe el cuerpo |
| `research/` | **Anexo de procedencia, auditable.** 13 informes de especialidad + 12 refutaciones adversariales + 4 verificaciones de documentación viva + el panel de diseño de §14. No es un dataset: nada de aquí alimenta la base |
| `research/README.md` | Estatuto del anexo: estado de auditoría, citas de terceros, datos personales |
| `GOVERNANCE.md` | Contrato de evidencia (heredado de v1, se amplía con §10) |

### Cómo leer `research/*.json`

**No uses `grep -o` con ventana fija de caracteres.** Son ficheros JSON de una sola línea muy larga y ese `grep` **falla en silencio**, devolviendo vacío para cadenas que sí están. Un auditor estuvo a punto de publicar dos refutaciones falsas por eso. Usa `python3` con `json.load()` y recorre campo por campo.

Los ficheros `refute2-*.json` y `docs-*.json` son los más recientes y **corrigen** a los informes de especialidad que auditan. Ante conflicto, manda la refutación.

---

## Verificación de fuentes (OBLIGATORIO)

**Nunca confíes en el código HTTP para decidir si una fuente respondió bien.** Los siete modos de fallo medidos en campo, todos silenciosos:

| Modo | Caso real |
|---|---|
| Feed zombie | W Radio: HTTP 200 con XML válido, congelado desde oct-2025 |
| Éxito falso | Corte Constitucional `maxprov=10001`: HTTP 200 con fragmento HTML, no JSON |
| Parser roto | Cámara `div.profile-card`: cero filas, el HTML no se renderiza en servidor |
| Fuente podrida | Gestor Normativo `i=53646`: sin refrescar desde 2015-12-01, y la página se autodesautoriza |
| OCR degradado | DAPRE: «Galopa» por «Galapa» |
| Procedencia falsificada | Afectación inferida de un tercero, presentada como declarada en la norma |
| Defensa imaginaria | Manejo de rotación del `_ajax_nonce` de la Cámara, que **no se valida** |

Validar **content-type y parseo**, no status. Frescura por `max(fecha_del_hecho)` contra cadencia esperada, nunca por status. El diseño está en §14. **`g2-pulso` existe** (`pnpm g2`; lee `cadenciaHoras`). No hay `g1` / `g3`–`g6`.

---

## Restricciones legales que condicionan el código

Detalle en `PLAN-V2.md` §15. Lo que hay que tener presente al escribir un colector:

- **Tres portales prohíben en sus términos de uso lo que su `robots.txt` permite**: camara.gov.co, funcionpublica.gov.co y dnp.gov.co. Los escritos están en `legal/peticiones/` como **borrador** (no radicados). Hasta que haya respuesta favorable: UA identificado, cadencias conservadoras y sin republicación masiva. Cámara no se ejecuta (`AUTORIZACION.concedida = false`).
- **La Silla Vacía bloquea `ClaudeBot`, `anthropic-ai` y `GPTBot`** en su `robots.txt`. **Se acata**: fuera de la ingesta automatizada. Una exclusión no se rodea.
- **`robots.txt` se audita por fuente ANTES** de meterla en la canasta.
- El **correo institucional** de los congresistas se almacena y se muestra en la ficha individual, pero **nunca** en dumps, API en bloque ni MCP server.
- Todo lo que sale por API, dumps o MCP pasa por la **lista de egreso por procedencia** de §15.3, exigida en código.

---

## Convenciones

- **Monorepo pnpm**: `collectors/`, `web/`, `mcp/`. **`db/` NO es un paquete del workspace** —no tiene `package.json` y pnpm lo ignoraba en silencio, así que declararlo era una promesa vacía—: sus scripts se corren desde la raíz (`pnpm db:load`) y sus tests los recoge el vitest de la raíz. El motivo está escrito en `pnpm-workspace.yaml`
- **Ningún proveedor de pago.** Los embeddings salen de Ollama local y el modelo de Q&A de `claude -p`. Si una tarea parece necesitar una clave de API, la respuesta por defecto es que NO, y se pregunta
- TypeScript. Node fijado en `.nvmrc`
- Un colector = un pipeline CLI + **fixtures versionados con tests de snapshot**
- Los colectores vivos piden bytes con `fetch` en `collectors/src/http.ts` y parsean JSON/HTML a mano. `collectors/package.json` ya no declara `crawlee` / `feedsmith` / `playwright` / `unpdf`
- El contrato pide `raw bytes + url + captured_at + content_hash` **antes** de parsear. Los loaders (`db/load.ts` y hermanos) **escriben** `captura` (`blob_uri` NULL; no hay R2). El cuerpo sigue siendo el JSON de `artefactos/`
- Toda rama de manejo de error **cita la evidencia de que ese error ocurre**. Mantenimiento sin contrapartida también es deuda

---

## Este repo es standalone

**No se acopla con career-ops ni importa nada de él, en ninguna dirección.** career-ops puede consultar los registros públicos de regwatch-co; regwatch-co nunca depende de career-ops.

Es el único repo público del usuario. Todo lo que se commitea aquí es visible: nada de datos personales, credenciales, ni volcados de trabajo de sesión.
