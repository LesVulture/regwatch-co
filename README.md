# regwatch-co

**Monitor normativo y legislativo colombiano con procedencia obligatoria.** Ningún dato entra sin URL checkeable, fecha de captura y una declaración explícita de qué tan lejos llega su evidencia.

La consulta que el proyecto existe para responder no es «búscame esta ley», es **«¿qué decía esta norma el 3 de marzo de 2024?»** — y responderla exige un grafo de afectaciones tipadas, no un buscador.

```
$ regwatch → /vigencia/ley/1616/2013

ley 1616 de 2013 · Vigencia a día de hoy

AFECTADA — el cambio ya surtió efecto a la fecha consultada
  Artículo 1 · por ley 2460 de 2025 · Diario Oficial 53.153 · efecto 2025-06-18
  «ARTÍCULO 3o. Modifíquese el artículo 1o de la Ley 1616 de 2013, el cual quedará así:»
  Regla: «La presente ley entrará a regir a partir de su sanción, promulgación y
         publicación en el Diario Oficial…» (Ley 2460 de 2025, art. 39) + DO 53.153
  declarado_en_norma · tier primaria · verificar en la fuente ↗
```

Esa cláusula entre comillas no es decorativa: **es la prueba**. Sin ella la fila no existe — lo impide una restricción del esquema, no una convención.

El mapa de **lo construido** (qué corre, qué está gated, stack real vs el plan) vive en [`docs/ESTADO.md`](docs/ESTADO.md). [`PLAN-V2.md`](PLAN-V2.md) es el plan histórico de construcción; no se reescribe.

## Estado real

Esto es un proyecto en construcción y el README no va a decir otra cosa. El
recorte as-built del **2026-08-21** está en `docs/ESTADO.md` y
`docs/verificacion-viva-2026-08-21.md`. La **base cargada** sigue siendo la del
**2026-08-20** (no se recontó). El **re-fetch** de Senado de esa noche es 1.693.

| | |
|---|---|
| ✅ **Recolección** | Senado **1.693** proyectos el 2026-08-21 (5 legislaturas; 2024-2025 471→470). Corte: ventana 2026 viva 1.152; el artefacto 2015–2026 en disco sigue siendo el del 20 (21.665). Articulado por artículo. `collect:articulado Ley 1616 2013` **exit 1**: detecta `ciclo-paginacion` (2 fetches; no gira 15 páginas). Un Siguiente cíclico no certifica la ley |
| ✅ **Corpus cargado** | Instancia del **2026-08-20**, no recontada: 1.694 proyectos · 21.665 providencias · **8 normas registradas, 7 de ellas con articulado** (286 fragmentos). La octava, la Ley 2460 de 2025, existe como norma AFECTANTE —es la que prueba la vigencia de la 1616— y su texto no está capturado. 39 MB de los 500 del plan Free |
| ✅ **Vigencia a fecha arbitraria** | Funciona de punta a punta, con la cláusula probatoria y su Diario Oficial |
| ✅ **Búsqueda léxica** | FTS en español sobre normas, proyectos y providencias, con ensanchado declarado cuando el AND no casa nada |
| ✅ **Búsqueda semántica** | 282 de los 286 fragmentos tienen vector. **nomic-embed-text en Ollama local**, truncado a 256 dims — con la fidelidad del truncado medida (`docs/matryoshka-256.md`) |
| 🟡 **Q&A con citas** | `pnpm qa "…"`. El modelo se invoca por **Claude Code con la sesión OAuth** y cada cita se comprueba LITERAL contra el texto enviado. Medido contra el gold set (18 preguntas, 2026-08-20): **0 citas fantasma, 0 citas entrecomilladas falsas**, y 1 salida del modelo que no se pudo leer — declarada como fallo, no como ausencia de datos. Lo que no está resuelto es cuánto RESPONDE: 1 de 18 pasó el umbral de publicación — ver abajo |
| ⛔ **Preguntas de conteo** | «¿cuántos proyectos de ley hay?» **no la contesta ninguna superficie**. El `qa` declina por diseño (no hay fragmento citable que diga un agregado, y una frase sin cita se borra), y ni la búsqueda ni el MCP devuelven totales: devuelven filas, hasta su `limite`. El dato existe en la base y hoy solo se saca con SQL |
| ✅ **Servidor MCP** | Dos herramientas de solo lectura (`buscar_normatividad`, `consultar_vigencia`), con advertencia de procedencia en cada respuesta. La búsqueda **embebe** con `embeberConsulta` (igual que la web) y declara la degradación léxica si Ollama no está |
| ⛔ **Alertas por correo** | Las piezas están escritas y probadas por separado —construir el digest, decidir a quién va, y un transporte de fichero que escribe `SIN-ENVIAR-…` en vez de enviar— pero **nada las encadena todavía**: no hay comando que corra una tanda de alertas. Faltan las dos cosas: el proveedor de correo (la única pieza sin sustituto gratuito) y el runner que las una |
| 🟡 **Articulado, cobertura** | 8 normas de las miles que existen, y el troceador no saca todos los artículos de las leyes largas. Buscar y citar funciona sobre lo que hay; ampliarlo es correr `collect:articulado` más veces |
| ⛔ **OCR de escaneados** | Sin proveedor. §7 del plan lo tenía en Mistral, que factura |
| ⛔ **Cámara de Representantes** | El colector está escrito **con una guarda que impide correrlo** (`AUTORIZACION.concedida = false`). Los tres derechos de petición en `legal/peticiones/` son **borrador**, no radicados |
| 🟡 **Recolección diaria** | YAML en `main` (`.github/workflows/collect.yml`, `41 7 * * *` UTC: Senado + Corte del año + piloto + g2 + load). GitHub solo dispara `on.schedule` en la rama por defecto, y el fichero **ya está ahí**. Secreto `SUPABASE_DB_URL` puesto: el dispatch del 2026-08-22 **sí cargó Senado**. El job salió rojo en `db:load-providencias` (artefacto de Corte del año vacío → exit 1). El `schedule` de hoy (07:41 UTC) ya había pasado al mergear. Siguen `verify`, `gold` (lunes) y `latido` (cada 3 días) |
| 🟡 **Gates** | Existen `g0-contrato` y `g2-pulso` (`pnpm g2` lee `cadenciaHoras`). No hay `g1` / `g3`–`g6`. No hay `proxy.ts` |

### El 1 de 18, explicado (porque el número solo engaña)

La corrida del gold set del **2026-08-20** (`pnpm gold:run` →
`artefactos/gold-run-2026-08-20.json`, 18 preguntas) dio esto:

- **0 citas a fragmentos inexistentes** y **0 citas entrecomilladas que la
  fuente no diga**, en las 18.
- **1 salida ilegible** (G009): el modelo devolvió un JSON roto. Se reporta como
  FALLO del proveedor, con su motivo, y el sistema **no dice ni una palabra
  sobre el corpus** — antes ese caso se imprimía como «la evidencia citable del
  corpus no cubre esta pregunta», que es un fallo técnico disfrazado de hecho
  sobre los datos.
- **1 de 18 superó el umbral de publicación** (80 % de frases con cita válida).

Ese 1/18 **no** mide acierto, y conviene entender por qué es tan bajo antes de
leerlo como un suspenso:

1. El corpus de articulado son **7 normas**. Ante casi cualquier pregunta, la
   respuesta honesta es «no consta», y eso es lo que el sistema hace.
2. Una frase que dice «no consta en el corpus» **no tiene nada que citar**, así
   que la regla R2 la borra. Al arnés, «declinó correctamente» y «no produjo
   nada» le salen idénticos. Es una limitación de la MEDICIÓN, no del sistema —
   y hasta que se separen, este número no puede subir por buenos motivos.
3. El umbral es de respuesta COMPLETA: si de tres frases sobrevive una, no se
   publica un fragmento descontextualizado. G013 sacó una frase citada y
   correcta y aun así cuenta como «no responde».

Dicho de otro modo: lo que está medido y verde es que **no fabrica**. Lo que
está medido y rojo es **cuánto contesta**, y la palanca para eso es cargar más
articulado (`collect:articulado`), no tocar el validador.

> **Una corrección sobre la corrida anterior.** Este README publicó «1 cita
> entrecomillada falsa». No lo era: el validador metía en el mismo cubo la cita
> que la fuente NO dice y la que es literal pero demasiado corta para
> identificar nada. Las dos se descartan igual y significan cosas distintas —la
> primera es fabricar, la segunda es prudencia—, y confundirlas corrompe la
> única métrica que este arnés garantiza. Ahora cada descarte lleva su motivo.

### Cuesta cero, y eso es una decisión de diseño

**No hay ninguna clave de API de pago en este repo.** El plan (`PLAN-V2.md`
§8.2) presupuestaba ~$70/mes en Anthropic, Voyage y Mistral; la instrucción del
dueño del proyecto (2026-08-20) fue que no hubiera gasto más allá de Supabase y
de la suscripción de Claude Code que ya está pagada. Lo que se cambió:

| El plan | Lo que corre | Qué se perdió |
|---|---|---|
| Embeddings **voyage-4** | **nomic-embed-text** en Ollama local | La búsqueda semántica funciona **donde corre Ollama**. En un despliegue público sin Ollama al alcance no hay vector, y `hybrid_search` degrada a la léxica — sin error, y **diciéndolo** en la página |
| Q&A con **Citations API** | `claude -p` con OAuth | La API garantizaba que la cita era texto literal del bloque. Ahora lo comprueba `verificarTextualidad()` contra el texto enviado: es **más** fuerte. Lo que gasta es cuota de la suscripción, que es finita |
| Rerank **voyage-2.5** | nada | El orden final es el de RRF, sin reordenar |
| OCR **Mistral** | nada | No hay OCR |

Lo que NINGUNA de las dos versiones cubre —y no se va a fingir que sí— es que
citas literales y correctas se hilen en una inferencia que la fuente no
sostiene. Eso lo mide el gold set (R7), no el validador.

**Lo que este proyecto no promete, y no lo va a prometer:** que los datos sean
*ciertos*. Puede probar que son consistentes con lo que la fuente publicó, que
la procedencia es la declarada y que nada llegó por un camino roto. Si la fuente
oficial publica un dato equivocado, ningún gate lo ve. Por eso está prohibido en
este repo el claim «datos validados» a secas — y el de «sin alucinaciones».

**Esto no es asesoría jurídica.** Es un índice con procedencia; la lectura
jurídica se hace sobre el texto oficial, y cada resultado enlaza al suyo.

## Cómo se usa

Requiere **Node ≥ 24** (usa el *stripping* nativo de TypeScript, por eso los
`import` llevan extensión `.ts`) y **pnpm 11**. `.nvmrc` fija 24; se desarrolla y
verifica sobre 26.

```bash
git clone https://github.com/LesVulture/regwatch-co.git
cd regwatch-co
pnpm install
git config core.hooksPath .githooks   # ver más abajo: no es opcional si vas a empujar

cp .env.example .env      # y rellena SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_DB_URL
pnpm web:dev              # http://localhost:3000  — filtros en la URL (?q=&tipo=&anio=)
pnpm tui                  # TUI Ink (mismos filtros; q sale, Ctrl+C también)
```

**El hook de `pre-push` no es burocracia.** `git config core.hooksPath .githooks`
activa `.githooks/pre-push`, que se niega a empujar cualquier rama `backup/*`.
`backup/pre-redaccion` conserva 8 commits que **no** están en `main`: la historia
anterior a la redacción de rutas locales del 2026-08-19 (home del usuario, UUID
de sesión) dentro de varios JSON de `research/`. Un `git push --all` los
republica de golpe en un repositorio público, y de ahí ya no se retiran.

El `.env` va en la **raíz** del monorepo. La aplicación de Next vive en `web/` y
no lo leería sola; `web/next.config.ts` lo carga explícitamente. Los scripts de
Node lo cargan con `--env-file-if-exists=.env`, así que **no hace falta exportar
nada a mano**.

Para la búsqueda semántica y el Q&A hacen falta dos cosas más, las dos gratis:

```bash
ollama pull nomic-embed-text     # embeddings locales (~270 MB)
claude                           # iniciar sesión en Claude Code, una vez
```

Sin Ollama el sistema **no se rompe**: `hybrid_search` degrada a la búsqueda
léxica y la página lo dice. Sin `claude`, `pnpm qa` falla con un mensaje claro;
lo demás sigue funcionando.

```bash
pnpm verify                   # lint + typecheck + tests + build de la web
pnpm db:drift                 # ¿los .sql del repo reconstruyen las funciones vivas? (necesita credenciales)

pnpm collect:senado           # proyectos de ley       → artefactos/senado-pdly.json
pnpm collect:corte            # providencias           → artefactos/corte-relatoria.json
pnpm collect:articulado Ley 1616 2013   # exit 1: ciclo-paginacion (2 URLs; no es collect limpio)

pnpm db:load                  # carga proyectos de ley
pnpm db:load-providencias     # carga providencias
pnpm db:load-chunks artefactos/articulado-ley_1616_2013.json --crear-norma
pnpm embed:chunks             # rellena los vectores que falten (necesita Ollama)

pnpm qa "¿Qué obligaciones tiene el Estado en política migratoria?"
pnpm gold:run                 # pasa el gold set por el Q&A y escribe la corrida
pnpm mcp:start                # servidor MCP por stdio
pnpm tui                      # TUI: misma capa de consulta que web y MCP
```

Los colectores **no escriben nunca directo a la base**: producen un artefacto
validado y un segundo paso lo importa. Es lo que permite mirar una corrida antes
de que toque datos. `--crear-norma` da de alta la norma usando **su epígrafe**
—el título oficial, que va dentro del propio texto de la ley— y se niega a
crearla si no lo encuentra, en vez de escribir uno aproximado.

### Ampliar el corpus de articulado

Las **7** normas con articulado cargado hoy son estas, y se eligieron por los
ejes del proyecto (salud, infancia, datos y transparencia, migración,
participación, víctimas). La tabla de arriba cuenta 8 filas en `norma` porque la
Ley 2460 de 2025 está registrada como norma afectante, sin articulado:

```bash
for L in "Ley 1616 2013" "Ley 1751 2015" "Ley 1098 2006" "Ley 2136 2021" \
         "Ley 1757 2015" "Ley 2195 2022" "Ley 1448 2011"; do
  pnpm collect:articulado $L && \
  pnpm db:load-chunks "artefactos/articulado-$(echo $L | tr 'A-Z ' 'a-z_').json" --crear-norma
  sleep 3          # cortesía con la fuente
done
pnpm embed:chunks
```

**Dos normas de esa tanda NO se pudieron cargar, y el sistema se negó solo:** la
Ley 1581 de 2012 (protección de datos) trae 2 fragmentos con aparato editorial
de la compilación y 24 identificadores duplicados; la Ley 1712 de 2014
(transparencia) trae 3 duplicados. Las dos dan además «artículos» de decenas de miles de
caracteres —hasta 19.893 en la Ley 1712—, que es la señal de que el troceador no
supo partir esa página. Son fallos del troceador, no de la fuente, y están abiertos.

### Servidor MCP

```json
{
  "mcpServers": {
    "regwatch-co": {
      "command": "node",
      "args": ["/ruta/a/regwatch-co/mcp/src/server.ts"],
      "env": {
        "SUPABASE_URL": "https://TU-PROYECTO.supabase.co",
        "SUPABASE_ANON_KEY": "sb_publishable_..."
      }
    }
  }
}
```

Expone `buscar_normatividad` y `consultar_vigencia`. Las dos son de solo lectura y ninguna afirma vigencia sin fuente primaria. **La búsqueda embebe** con `embeberConsulta`, igual que `/`: si Ollama no está, `hybrid_search` degrada a léxico y la respuesta lo dice. Los filtros opcionales (`tipo`, `legislatura`, `estado`, `camara`, `anio`, `tipo_providencia`) son los mismos que la web y el TUI.

## Cómo está hecho

Monorepo pnpm: `collectors/` (recolección, gates y RAG), `db/` (esquema e importadores), `web/` (Next 16, Tailwind 4), `mcp/` y `tui/` (Ink). Postgres 17 con pgvector en Supabase. La búsqueda web acepta `tipo`, `legislatura`, `estado`, `camara` (trámite según el Senado, no el corpus de la Cámara), `anio` y `page`; un recorte que no aplica a un tipo lo excluye. `hay_mas` no es un total.

Tres cosas que no son detalles de implementación:

1. **La vigencia nunca sale de un modelo de lenguaje.** `afectacion.fecha_derivation` lo hace cumplir con restricciones `CHECK`: una fecha sin procedencia no entra, y si se derivó por regla, la regla tiene que estar escrita.
2. **Cero filas no significa «vigente para siempre».** Significa que no consta ninguna afectación capturada. La interfaz lo dice con esas palabras.
3. **El aparato editorial de terceros no se republica.** El articulado es dominio público (art. 41 de la Ley 23 de 1982); las notas de vigencia y del editor de las compilaciones privadas **no lo son**, y hay un saneado estructural con tests que lo impide.

Las reglas completas están en **[GOVERNANCE.md](GOVERNANCE.md)**, que dice de cada una *dónde se hace cumplir*. Lo construido, en [`docs/ESTADO.md`](docs/ESTADO.md). El plan histórico y sus correcciones medidas, en `PLAN-V2.md`.

## Licencia

MIT — ver [LICENSE](LICENSE). El código es MIT; el texto normativo que indexa es de sus fuentes oficiales y cada registro enlaza a la suya.
