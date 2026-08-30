# regwatch-co

**Consulta leyes, proyectos de ley y sentencias de Colombia — y comprueba si un artículo sigue vigente.**

En Colombia las normas cambian: una ley nueva puede modificar o derogar otra anterior. Buscar el texto en internet no siempre basta, porque lo que importaba ayer puede no ser lo que rige hoy.

regwatch-co es una herramienta abierta para:

1. **Buscar** normas, proyectos del Senado y providencias de la Corte Constitucional.
2. **Preguntar** si un artículo sigue vigente en una fecha concreta.
3. **Ver de dónde salió cada dato**, con enlace a la página oficial.

Puedes usarla desde el navegador (también en el móvil), desde la terminal o desde un asistente de IA conectado al proyecto.

> Esto **no** es asesoría jurídica. Es un índice que te acerca al texto oficial. La decisión final siempre es tuya, leyendo la fuente.

---

## Un ejemplo concreto

Imagina que quieres saber qué pasa con la Ley 1616 de 2013 (salud mental) **hoy**.

En lugar de quedarte solo con el texto original, regwatch-co te muestra si algún artículo fue modificado después, por qué norma, desde cuándo y con un enlace para verificarlo tú mismo:

```text
ley 1616 de 2013 · Vigencia a día de hoy

AFECTADA
  Artículo 1 · cambiado por la ley 2460 de 2025 · efecto 2025-06-18
  Enlace a la fuente oficial ↗
```

Esa es la idea del producto: no solo «encontrar la ley», sino **entender qué sigue en pie**.

---

## ¿Qué puedes hacer?

| Necesidad | Qué ofrece regwatch-co |
|---|---|
| Buscar por tema | Escribes algo como «salud mental» o «protección de datos» y ves lo indexado |
| Revisar vigencia | Abres la ficha de una norma y ves qué artículos cambiaron y cuándo |
| Preguntar en español | Puedes hacer preguntas en prosa; las respuestas van con citas del texto capturado |
| Usarlo en el día a día | Web, terminal o integración con herramientas de IA |

### Otras preguntas típicas que resuelve

- «¿Este artículo ya fue modificado?»
- «¿Qué proyectos de ley hay sobre X en el Senado?»
- «¿Qué dijo la Corte sobre este tema?» (dentro de lo que ya está cargado)

---

## Cómo empezar (lo más simple)

Para probar la interfaz localmente necesitas Node.js 24 o superior, [pnpm](https://pnpm.io) y un proyecto en [Supabase](https://supabase.com) con los datos (o tu propia carga; ver más abajo).

```bash
git clone https://github.com/LesVulture/regwatch-co.git
cd regwatch-co
pnpm install

cp .env.example .env
# Completa SUPABASE_URL, SUPABASE_ANON_KEY y, si vas a cargar datos, SUPABASE_DB_URL

pnpm web:dev
```

Abre http://localhost:3000 en el navegador.

También puedes usar la interfaz de terminal:

```bash
pnpm tui
```

---

## Casos de uso paso a paso

### Buscar en la web

1. Arranca con `pnpm web:dev`.
2. Escribe una consulta en lenguaje cotidiano.
3. Filtra por tipo si quieres (norma, proyecto o providencia).
4. Abre el resultado y sigue el enlace a la fuente oficial cuando lo necesites.

Rutas útiles:

| Página | Para qué |
|---|---|
| `/` | Búsqueda |
| `/vigencia/ley/1616/2013` | Vigencia de una norma concreta |
| `/proyectos` | Listado de proyectos de ley |
| `/providencias` | Listado de providencias |
| `/cobertura` | Qué hay cargado hoy |

### Preguntar por escrito (con citas)

```bash
pnpm qa "¿Qué obligaciones tiene el Estado en política migratoria?"
```

Si el sistema no tiene texto suficiente para responder con honestidad, **se niega a inventar**. Prefiere decir que no consta a completar con conjeturas.

### Conectar un asistente de IA (MCP)

Si usas Claude Desktop, Cursor u otra herramienta compatible con MCP:

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

Expone dos herramientas de consulta (solo lectura): buscar normatividad y consultar vigencia.

---

## Qué datos incluye hoy

El proyecto está en construcción. Funciona de punta a punta, pero el volumen de texto completo de leyes aún es un **piloto**.

| Contenido | Situación actual |
|---|---|
| Proyectos de ley del Senado | Disponible; se actualiza a diario |
| Providencias de la Corte Constitucional | Disponible; se actualiza a diario (año en curso) |
| Consulta de vigencia | Disponible |
| Búsqueda en la web y en terminal | Disponible |
| Texto completo artículo por artículo | Piloto (~7 normas); se puede ampliar |
| Cámara de Representantes | Preparado, aún no activo (falta autorización) |
| Alertas por correo | En preparación |

El estado medido día a día está en [`docs/ESTADO.md`](docs/ESTADO.md).

---

## Para quien desarrolla o opera el sistema

A partir de aquí el lenguaje es más técnico.

### Requisitos

- Node.js ≥ 24 (el repo fija 24 en `.nvmrc`)
- pnpm 11
- Supabase (Postgres + pgvector)
- Opcional: [Ollama](https://ollama.com) con `nomic-embed-text` para búsqueda semántica
- Opcional: sesión de Claude Code para `pnpm qa`

```bash
ollama pull nomic-embed-text
claude   # una vez, si vas a usar Q&A
```

Sin Ollama la búsqueda sigue funcionando en modo léxico y lo indica. Sin Claude, el resto del sistema sigue disponible.

Configura el hook de Git (recomendado si vas a hacer push):

```bash
git config core.hooksPath .githooks
```

Eso evita empujar por accidente ramas `backup/*` con historia que no debe republicarse.

Comprueba que el árbol está sano:

```bash
pnpm verify
```

### Recolectar e importar datos

Los recolectores **no escriben directo** en la base. Primero guardan un archivo JSON; después un comando aparte lo importa. Así puedes revisar una corrida antes de tocarla.

```bash
pnpm collect:senado
pnpm collect:corte
pnpm collect:articulado Ley 1616 2013

pnpm db:load
pnpm db:load-providencias
pnpm db:load-chunks artefactos/articulado-ley_1616_2013.json --crear-norma
pnpm embed:chunks
```

Para sumar otra norma al piloto:

```bash
pnpm collect:articulado Ley 1751 2015
pnpm db:load-chunks artefactos/articulado-ley_1751_2015.json --crear-norma
pnpm embed:chunks
```

La recolección diaria en GitHub Actions está en `.github/workflows/collect.yml` (Senado + Corte del año + carga, si el secreto `SUPABASE_DB_URL` está configurado).

### Cómo está organizado el código

| Carpeta | Función |
|---|---|
| `collectors/` | Descarga y validación de fuentes; búsqueda y Q&A |
| `db/` | Esquema SQL e importadores |
| `web/` | Aplicación web (Next.js) |
| `tui/` | Interfaz de terminal |
| `mcp/` | Servidor MCP |

### En qué se diferencia de un buscador cualquiera

- Cada resultado importante puede rastrearse hasta una página oficial.
- La vigencia no la «adivina» un modelo de lenguaje: se basa en afectaciones registradas con su prueba.
- Si no hay afectaciones cargadas, el sistema **no** afirma que la norma esté vigente para siempre: dice que no consta cambio capturado.
- No republica notas editoriales de compilaciones privadas; solo el texto normativo de dominio público.

Detalle de reglas: [`GOVERNANCE.md`](GOVERNANCE.md). Plan histórico: [`PLAN-V2.md`](PLAN-V2.md).

**Coste de APIs de pago:** ninguna. Los embeddings corren en Ollama local; el Q&A usa la sesión OAuth de Claude Code. Lo demás es Supabase.

---

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/ESTADO.md`](docs/ESTADO.md) | Qué está construido y medido hoy |
| [`GOVERNANCE.md`](GOVERNANCE.md) | Reglas de evidencia y procedencia |
| [`PLAN-V2.md`](PLAN-V2.md) | Plan histórico de construcción |
| [`research/`](research/) | Investigación de fuentes (no alimenta la base) |

---

## Licencia

MIT — ver [LICENSE](LICENSE).

El código es MIT. El texto de las normas pertenece a sus fuentes oficiales; cada registro enlaza a la suya.
