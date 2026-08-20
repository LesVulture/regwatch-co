# regwatch-co — Monitor normativo y legislativo colombiano

Motor de búsqueda y monitoreo de la normatividad y la actividad legislativa de Colombia, con datos actualizados a diario desde fuentes oficiales, consultable desde el móvil, capaz de responder preguntas en lenguaje natural **con cada afirmación anclada a fuente primaria con URL y fecha de captura**.

**El plan de construcción es `PLAN-V2.md`. Léelo antes de tocar nada.** Este fichero no lo resume: fija el contrato de trabajo y apunta allí. Si los dos discrepan, manda el plan.

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

**Fase 0 en curso.** El v1 fue un intento fallido: cero recolección, clasificación léxica pura, JSONL sin motor de consulta, sin modelo de vigencia. Se conserva de él únicamente el contrato de evidencia.

Roadmap completo en `PLAN-V2.md` §11. Presupuesto en §11 bis.

---

## Mapa del repo

| Ruta | Qué es |
|---|---|
| `PLAN-V2.md` | **El plan.** 15 secciones. Fuente de verdad de la arquitectura |
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

Validar **content-type y parseo**, no status. Frescura por `max(fecha_del_hecho)` contra cadencia esperada, nunca por status. El diseño completo de la capa que atrapa cada uno está en §14.

---

## Restricciones legales que condicionan el código

Detalle en `PLAN-V2.md` §15. Lo que hay que tener presente al escribir un colector:

- **Tres portales prohíben en sus términos de uso lo que su `robots.txt` permite**: camara.gov.co, funcionpublica.gov.co y dnp.gov.co. Hay derechos de petición pendientes. Hasta que respondan: UA identificado, cadencias conservadoras y sin republicación masiva.
- **La Silla Vacía bloquea `ClaudeBot`, `anthropic-ai` y `GPTBot`** en su `robots.txt`. **Se acata**: fuera de la ingesta automatizada. Una exclusión no se rodea.
- **`robots.txt` se audita por fuente ANTES** de meterla en la canasta.
- El **correo institucional** de los congresistas se almacena y se muestra en la ficha individual, pero **nunca** en dumps, API en bloque ni MCP server.
- Todo lo que sale por API, dumps o MCP pasa por la **lista de egreso por procedencia** de §15.3, exigida en código.

---

## Convenciones

- **Monorepo pnpm**: `collectors/`, `db/`, `web/`
- TypeScript. Node fijado en `.nvmrc`
- Un colector = un pipeline CLI + **fixtures versionados con tests de snapshot**
- Los colectores usan el `$` que inyecta Crawlee y **no declaran `cheerio` propio** (conflicto de versión latente)
- `raw bytes + url + captured_at + content_hash` se persisten **antes** de cualquier parseo. Parseo y OCR son derivados reproducibles
- Toda rama de manejo de error **cita la evidencia de que ese error ocurre**. Mantenimiento sin contrapartida también es deuda

---

## Este repo es standalone

**No se acopla con career-ops ni importa nada de él, en ninguna dirección.** career-ops puede consultar los registros públicos de regwatch-co; regwatch-co nunca depende de career-ops.

Es el único repo público del usuario. Todo lo que se commitea aquí es visible: nada de datos personales, credenciales, ni volcados de trabajo de sesión.
