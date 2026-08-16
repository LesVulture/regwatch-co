# Contrato de evidencia

Este documento es la parte importante del proyecto. El código solo lo hace cumplir.

Un monitor normativo tiene un modo de fallo particular: no se rompe, **se equivoca en silencio**. Sirve una fecha que nadie verificó, presenta una nota de prensa como si fuera un acto administrativo, o dice «vigente» sobre una norma que una sentencia tumbó. El resultado se ve igual de ordenado que el correcto. Por eso las reglas de abajo se validan en `lib/record.mjs` y las hace fallar `bin/verify.mjs` — no viven en la buena voluntad de quien captura.

---

## 1. Nada entra sin fuente checkeable

Todo registro lleva `source_url` con una URL `http(s)` que un tercero pueda abrir, y `retrieved_at` con la fecha de captura. No se acepta «visto en un boletín», «según el portal» ni una ruta a un archivo local.

La fecha de captura importa tanto como la URL: los portales oficiales colombianos se reestructuran, y un enlace que hoy resuelve puede no resolver en seis meses. `retrieved_at` dice cuándo era cierto lo que el registro afirma.

## 2. Jerarquía probatoria, y no se puede subir

| Tier | Qué es | Qué autoriza |
|---|---|---|
| `primaria` | El acto mismo: el texto en el Diario Oficial, el PDF del CONPES en el DNP, la gaceta del Congreso, la sentencia en la relatoría de la Corte | Afirmar contenido y vigencia |
| `institucional` | La entidad hablando de su propio trabajo: sala de prensa, comunicados, presentaciones | Afirmar agenda e intención. **No** vigencia |
| `secundaria` | Prensa, análisis, agregadores | Señalar que algo existe, para ir a buscar la primaria |

**Un registro nunca puede declarar un tier mejor que el de su fuente.** El validador lo impide. Y sí puede declarar uno peor: una nota de prensa alojada en `senado.gov.co` sigue siendo contenido institucional aunque el dominio sea el del Congreso — está así en los datos semilla, a propósito, como ejemplo.

De aquí sale la regla más útil del proyecto: **`status: "vigente"` exige `tier: "primaria"`.** Un comunicado no declara vigencia. Es la clase de error que un monitor automatizado comete a diario y que a un abogado le cuesta la reunión.

## 3. La incertidumbre se declara, no se rellena

`status: "desconocida"` y `date: null` son respuestas legítimas y **preferibles a una conjetura**. La TUI las marca en rojo (`○`) en la primera columna de cada fila, antes del título: se ve cuánto se puede apoyar uno en un registro antes de leer lo que dice.

`data/seed.jsonl` incluye un registro deliberadamente incompleto (el CONPES 3975 de 2019) con su nota explicando qué falta y cómo se resuelve. No es un descuido pendiente de arreglar: es el comportamiento que el proyecto quiere demostrar. Un expediente que solo contiene lo que se pudo verificar del todo es un expediente que oculta sus huecos.

## 4. La clasificación es léxica porque tiene que ser explicable

Los temas de `config/topics.json` se asignan buscando términos, no por similitud semántica. Es una decisión, no una limitación técnica.

En un expediente de política pública hay que poder responder *«¿por qué este proyecto de ley quedó marcado como IA?»* con un término concreto que aparece en el texto. `lib/topics.mjs` devuelve los términos que dispararon cada tema y la TUI los muestra bajo el registro (`← inteligencia artificial, algoritmo`). Una distancia coseno no se puede defender ante una contraparte.

El costo es real y se declara: **esto no captura sinónimos ni paráfrasis.** Un proyecto que hable de «sistemas algorítmicos de decisión» sin usar ninguno de los términos listados se pierde. La mitigación es mantener la lista, y que un fallo de clasificación sea diagnosticable en un `grep` en vez de un misterio.

## 5. Citar exige haber capturado el texto

`capture: "verbatim"` significa que se guardó el texto tal cual. `capture: "resumen"` significa que hay una lectura de por medio. **Solo un registro `verbatim` puede llevar `quote`**, y el validador lo comprueba.

La razón es que un resumen es una interpretación, y las interpretaciones se citan a quien las hizo, no a la norma.

## 6. Append-only

`data/*.jsonl` no se sobrescribe. Cuando una norma cambia de estado, se añade una versión nueva; la anterior queda. El historial de cómo se vio una norma en el tiempo *es* el dato: permite responder «¿qué sabíamos en marzo?», que es exactamente la pregunta que aparece cuando una decisión sale mal.

## 7. Recolección respetuosa

Los portales oficiales colombianos son infraestructura pública con presupuesto limitado. Cualquier recolector que se añada respeta `robots.txt`, se identifica con un User-Agent honesto que incluye la URL del repositorio, y limita su tasa. Preferir el PDF oficial a raspar el HTML del portal cuando ambos existen.

Las fuentes marcadas `"collector": "manual"` en `config/sources.json` se capturan a mano hoy, y el registro lo dice. Es preferible a un recolector frágil que falle en silencio cuando el portal cambie de plantilla.

---

## Lo que este proyecto NO es

- **No es asesoría jurídica.** Es un índice con procedencia; la lectura jurídica la hace un abogado sobre el texto oficial.
- **No es exhaustivo.** Cubre las fuentes de `config/sources.json` y nada más. La ausencia de un registro no significa que la norma no exista.
- **No reemplaza el texto oficial.** Todo registro apunta a su fuente precisamente para que se lea allá.
