# regwatch-co

Monitor de **normatividad y actividad legislativa de Colombia**, consultable desde el móvil o la terminal, con una regla que no se negocia:

> Ningún dato entra sin URL de fuente primaria y fecha de captura.

No es un buscador genérico de leyes. Existe para responder preguntas como *«¿qué decía esta norma el 3 de marzo de 2024?»* — y para anclar cada afirmación a una fuente oficial checkeable.

```
ley 1616 de 2013 · Vigencia a día de hoy

AFECTADA — el cambio ya surtió efecto a la fecha consultada
  Artículo 1 · por ley 2460 de 2025 · Diario Oficial 53.153 · efecto 2025-06-18
  «ARTÍCULO 3o. Modifíquese el artículo 1o de la Ley 1616 de 2013…»
  declarado_en_norma · tier primaria · verificar en la fuente ↗
```

Esa cláusula entre comillas **es la prueba**. Sin ella la fila no existe: lo impone el esquema, no una convención de estilo.

---

## ¿Para qué sirve?

| Si quieres… | regwatch-co te da… |
|---|---|
| Ver si un artículo sigue vigente | Consulta de vigencia a una fecha, con la afectación tipada y el enlace al Diario Oficial |
| Buscar normas, proyectos o jurisprudencia | Búsqueda en lenguaje natural sobre lo capturado (léxica; semántica si hay Ollama) |
| Preguntar en prosa y exigir citas | Q&A CLI que comprueba cada cita **literal** contra el texto enviado |
| Usarlo desde un agente / IDE | Servidor MCP de solo lectura (`buscar_normatividad`, `consultar_vigencia`) |
| Auditar de dónde salió un dato | Procedencia en cada registro: URL + `captured_at` + jerarquía de evidencia |

**No es asesoría jurídica.** Es un índice con procedencia. La lectura jurídica se hace sobre el texto oficial; cada resultado enlaza al suyo.

---

## Casos de uso

### 1. Vigencia de una norma

Abre la ficha de vigencia (web) o pregunta por MCP/CLI:

```text
/vigencia/ley/1616/2013
```

Qué ves: artículos afectados, norma que los cambió, fecha de efecto y la cláusula que lo demuestra — con enlace a la fuente.

### 2. Búsqueda en lenguaje natural

En la web (`pnpm web:dev` → http://localhost:3000) o en la TUI:

```bash
pnpm tui
```

Ejemplos de consultas:

- «salud mental» → normas y fragmentos del corpus
- «protección de datos» → lo indexado sobre esa materia
- filtros por origen (norma / proyecto / providencia) cuando no quieres mezclar tipos

Sin Ollama la búsqueda **sigue funcionando** en modo léxico y lo declara. Con Ollama (`nomic-embed-text`) añade semántica.

### 3. Pregunta con citas comprobadas

```bash
pnpm qa "¿Qué obligaciones tiene el Estado en política migratoria?"
```

Cada cita se verifica contra el texto del corpus. Si el modelo inventa o parafrasea de más, la frase no se publica. Si el corpus no cubre la pregunta, el sistema declina en lugar de rellenar.

### 4. Integración MCP (Claude Desktop, Cursor, etc.)

```json
{
  "mcpServers": {
    "regwatch-co": {
      "command": "node",
      "args": ["/ruta/absoluta/a/regwatch-co/mcp/src/server.ts"],
      "env": {
        "SUPABASE_URL": "https://TU-PROYECTO.supabase.co",
        "SUPABASE_ANON_KEY": "sb_publishable_..."
      }
    }
  }
}
```

Herramientas: `buscar_normatividad` y `consultar_vigencia` (solo lectura; ninguna afirma vigencia sin fuente primaria).

---

## Arranque rápido

Requisitos: **Node ≥ 24** (`.nvmrc` fija 24), **pnpm 11**, cuenta de [Supabase](https://supabase.com) (Postgres + pgvector).

```bash
git clone https://github.com/LesVulture/regwatch-co.git
cd regwatch-co
pnpm install
git config core.hooksPath .githooks   # bloquea push de ramas backup/* (ver abajo)

cp .env.example .env
# Rellena SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_DB_URL

pnpm web:dev                          # http://localhost:3000
```

Opcionales (gratis):

```bash
ollama pull nomic-embed-text          # búsqueda semántica (~270 MB)
claude                                # una vez: sesión OAuth para `pnpm qa`
```

El `.env` vive en la **raíz** del monorepo. Next lo carga desde ahí; los scripts de Node usan `--env-file-if-exists=.env`.

### Verificar que el árbol está sano

```bash
pnpm verify                           # lint + types + tests + build web
```

---

## Cómo se usa (flujos habituales)

### Consultar lo ya cargado

Si ya tienes base y datos:

| Acción | Comando / ruta |
|---|---|
| Web | `pnpm web:dev` |
| TUI | `pnpm tui` |
| Q&A | `pnpm qa "tu pregunta"` |
| MCP | `pnpm mcp:start` |
| Vigencia (web) | `/vigencia/ley/1616/2013` |
| Listados | `/proyectos`, `/providencias`, `/cobertura` |

### Recolectar e importar

Los colectores **nunca** escriben directo a la base: producen un artefacto JSON y un segundo paso lo importa.

```bash
pnpm collect:senado                   # → artefactos/senado-pdly.json
pnpm collect:corte                    # → artefactos/corte-relatoria.json  (años: opcional)
pnpm collect:articulado Ley 1616 2013 # → artefactos/articulado-….json

pnpm db:load                          # proyectos de ley
pnpm db:load-providencias             # providencias
pnpm db:load-chunks artefactos/articulado-ley_1616_2013.json --crear-norma
pnpm embed:chunks                     # vectores (necesita Ollama)
pnpm g2 -- artefactos/senado-pdly.json artefactos/corte-relatoria.json
```

Hay un cron diario en GitHub Actions (`.github/workflows/collect.yml`) que corre Senado + Corte del año + piloto + g2 + carga cuando `SUPABASE_DB_URL` está configurado como secreto.

### Ampliar el articulado del piloto

Hoy el corpus de texto articulado es pequeño a propósito (piloto). Para sumar una norma:

```bash
pnpm collect:articulado Ley 1751 2015
pnpm db:load-chunks artefactos/articulado-ley_1751_2015.json --crear-norma
pnpm embed:chunks
```

`--crear-norma` usa el **epígrafe oficial** del texto; si no lo encuentra, se niega a inventar un título.

---

## Qué hay hoy (resumen honesto)

Detalle medido y fechas de captura: [`docs/ESTADO.md`](docs/ESTADO.md).

| Capacidad | Estado |
|---|---|
| Proyectos de ley (Senado) | Operativo; recolección diaria |
| Providencias (Corte) | Operativo; ventana del año en el cron |
| Vigencia a fecha | Operativo de punta a punta |
| Búsqueda léxica / semántica | Operativo (semántica con Ollama) |
| Web + TUI + MCP | Operativos |
| Q&A con citas literales | Operativo; cobertura limitada por el corpus |
| Articulado completo | Piloto (~7 normas con texto) |
| Cámara de Representantes | Colector escrito, **gated** hasta autorización |
| Alertas por correo | Piezas listas; aún sin runner ni proveedor de mail |
| OCR de escaneados | No hay proveedor |

Sobre el Q&A: lo medido y verde es que **no fabrica citas**. Cuánto responde depende de cuánto articulado esté cargado — ampliar el corpus es la palanca, no relajar el validador.

**Cero claves de API de pago.** Embeddings con Ollama local; Q&A con la sesión OAuth de Claude Code. Solo Supabase (y la suscripción de Claude Code, si usas Q&A).

---

## Cómo está hecho

Monorepo pnpm:

| Paquete / carpeta | Rol |
|---|---|
| `collectors/` | Recolección, gates de evidencia, RAG/Q&A |
| `db/` | Esquema SQL e importadores |
| `web/` | Next.js (búsqueda, vigencia, listados) |
| `tui/` | Cliente de terminal (Ink) |
| `mcp/` | Servidor MCP stdio |

Tres invariantes:

1. **La vigencia no la inventa un LLM.** Fechas de afectación llevan procedencia; el esquema las rechaza si faltan.
2. **Cero filas ≠ «vigente para siempre».** Significa que no consta afectación capturada; la UI lo dice así.
3. **No se republica aparato editorial de terceros.** El articulado es dominio público; las notas de compilaciones privadas se descartan.

Reglas completas: [`GOVERNANCE.md`](GOVERNANCE.md). Plan histórico (no se reescribe): [`PLAN-V2.md`](PLAN-V2.md).

### Hook `pre-push`

`git config core.hooksPath .githooks` activa un hook que **bloquea** empujar ramas `backup/*`. Esas ramas conservan historia previa a una redacción de rutas locales; un `git push --all` las republicaría en un repo público.

---

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/ESTADO.md`](docs/ESTADO.md) | As-built: qué corre, qué está gated, capturas |
| [`GOVERNANCE.md`](GOVERNANCE.md) | Contrato de evidencia |
| [`PLAN-V2.md`](PLAN-V2.md) | Plan histórico de construcción |
| [`research/`](research/) | Anexo de procedencia (investigación; no alimenta la base) |

---

## Licencia

MIT — ver [LICENSE](LICENSE). El código es MIT; el texto normativo indexado pertenece a sus fuentes oficiales y cada registro enlaza a la suya.
