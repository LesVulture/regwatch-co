# regwatch-co

**Monitor de normatividad colombiana en la terminal.** Consolida leyes, decretos, documentos CONPES, proyectos de ley y sentencias con **procedencia obligatoria**: ningún registro entra sin URL checkeable, fecha de captura y una declaración explícita de qué tan lejos llega su evidencia.

Arranca cubriendo inteligencia artificial, datos y tecnología —el debate normativo más movido de Colombia ahora mismo— y la taxonomía es extensible a cualquier otro eje: salud, infancia, cooperación internacional, territorio, migración.

```
● 2025-02-14  CONPES 4144 de 2025 — Política Nacional de Inteligencia Artificial
   primaria · vigente · https://colaboracion.dnp.gov.co/CDT/Conpes/Económicos/4144.pdf
○     ?      Proyecto de Ley 043 de 2025 — regulación del desarrollo ético... de la IA
   institucional · en-tramite · https://minciencias.gov.co/sala_de_prensa/...
```

El `○` rojo no es un error: es un registro cuya procedencia está **declarada como incompleta**. Ver [GOVERNANCE.md §3](GOVERNANCE.md).

## Por qué existe

Seguir regulación en Colombia es un problema de consolidación, no de búsqueda. La información está publicada —Congreso, DNP, Función Pública, Corte Constitucional, SIC— pero dispersa en portales con formatos y ciclos distintos, y sin un hilo que conecte un proyecto de ley con el CONPES que lo antecede y con la ley vigente que ya regula la mitad del asunto.

El riesgo de resolverlo con automatización es específico: **un monitor normativo no se rompe, se equivoca en silencio.** Sirve una fecha que nadie verificó o presenta un comunicado como si fuera un acto administrativo, y el resultado se ve igual de ordenado que el correcto.

Este proyecto trata ese riesgo como el problema central, no como un detalle. Las reglas de evidencia están en [GOVERNANCE.md](GOVERNANCE.md), se validan en `lib/record.mjs` y las hace fallar `bin/verify.mjs` en CI. La garantía de que todo registro es checkeable no es una promesa del README: es un test que falla.

## Uso

Requiere Node ≥ 18. **Cero dependencias** — no hay `npm install`.

```bash
git clone https://github.com/LesVulture/regwatch-co.git
cd regwatch-co

node bin/regwatch.mjs                  # TUI interactiva
node bin/regwatch.mjs --list           # volcado plano (pipes, CI)
node bin/regwatch.mjs --topic ia-tech  # filtrar por tema
node bin/verify.mjs                    # puerta de procedencia (exit 1 si falla)
node tests/test-provenance.mjs         # pruebas
```

**Teclas de la TUI:** `↑↓` mover · `⏎` detalle · `t` rotar tema · `v` verificar procedencia · `q` salir

La vista de detalle muestra, además del contenido, **el término exacto que hizo que el registro cayera en cada tema** (`← inteligencia artificial, algoritmo`) y los antecedentes enlazados.

## Cero dependencias, a propósito

Una herramienta que se usa para consolidar evidencia normativa no debería arrastrar un árbol de dependencias que nadie audita. La TUI es ANSI y `readline` de Node; el almacén es JSONL; la configuración es JSON. Todo el repositorio se lee en una tarde.

## Estructura

| Ruta | Qué hay |
|---|---|
| `GOVERNANCE.md` | El contrato de evidencia. **Empezar por aquí** |
| `config/sources.json` | Registro de fuentes con su tier probatorio |
| `config/topics.json` | Taxonomía temática. Añadir un tema es añadir una entrada; no hay código que tocar |
| `lib/record.mjs` | Esquema y validación de procedencia — el núcleo |
| `lib/topics.mjs` | Clasificación léxica auditable |
| `lib/store.mjs` | Almacén append-only |
| `lib/tui.mjs` | Render ANSI sin dependencias |
| `bin/regwatch.mjs` | TUI |
| `bin/verify.mjs` | Puerta de calidad |
| `data/seed.jsonl` | Registros semilla, todos con fuente checkeable |

## Estado

**Temprano y honesto sobre ello.** Lo que funciona hoy: el esquema con validación de procedencia, la clasificación temática con explicación del término disparador, la TUI de navegación y detalle, la puerta de verificación y 11 pruebas.

Lo que **no** está: recolección automática. Todas las fuentes de `config/sources.json` están marcadas `"collector": "manual"` porque los portales oficiales colombianos se reestructuran seguido, y un recolector frágil que falle en silencio es peor que una captura manual que se sabe manual. Los recolectores llegan fuente por fuente, cada uno con su prueba.

Hoja de ruta, en orden: recolector del DNP (PDFs de CONPES, el formato más estable) → gaceta del Congreso → relatoría de la Corte Constitucional → alertas por diferencia entre capturas.

## Contribuir

Un registro nuevo es una línea en `data/seed.jsonl` que pase `node bin/verify.mjs`. Una fuente nueva es una entrada en `config/sources.json` con su tier declarado. Un tema nuevo es una entrada en `config/topics.json`.

Si un registro no puede pasar la verificación, **esa es la respuesta correcta**: se declara incompleto con su nota, no se rellena.

## Licencia

MIT. Los textos normativos referenciados son documentos públicos del Estado colombiano y pertenecen a sus emisores; este repositorio solo indexa y apunta a ellos.
