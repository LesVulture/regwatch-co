# ¿Se puede truncar a 256 dimensiones sin destrozar el ranking?

**Medido el 2026-08-20 y re-medido —con script, esta vez— el mismo día.** El esquema desplegado declara `chunk.embedding` como
`vector(256)` y `DIMS = 256` en `collectors/src/rag/embeddings.ts`. Ese número
venía de voyage-4, que es **Matryoshka**: truncar su vector al prefijo de 256
dims es una operación prevista por el modelo.

Al sustituir voyage-4 por un modelo local (§8.2 pasa a Ollama porque no puede
haber dependencias de pago), esa propiedad **deja de estar garantizada** — y es
justo el tipo de supuesto que este repo tiene prohibido heredar sin comprobar.
Truncar un modelo que no es Matryoshka no falla: devuelve vecinos peores, en un
orden que nadie revisa.

## Qué se midió

Fidelidad del ranking a 256 dims **contra el ranking del mismo modelo a sus
dimensiones nativas**. La pregunta no es «¿qué modelo es mejor?» sino «¿cuánto
se rompe este modelo al truncarlo?», que es lo único que decide si las 256 dims
del esquema siguen siendo legítimas.

- **Corpus:** 217 textos reales del proyecto — los 37 artículos de la Ley 1616
  de 2013 (`artefactos/articulado-ley_1616_2013.json`) y 180 temas de
  providencias de la Corte (`artefactos/corte-relatoria.json`).
- **Consultas:** 8, en español jurídico (salud mental, tutela contra
  providencia, consulta previa, estabilidad laboral reforzada…).
- **Métrica:** `recall@k` del top-k truncado contra el top-k nativo, y
  correlación de Spearman sobre el ranking completo.
- Los dos modelos se embebieron con **su** convención: nomic-embed-text con los
  prefijos `search_document:` / `search_query:`, bge-m3 sin prefijo.

## Resultado

| modelo | dims nativas | recall@1 | recall@5 | recall@10 | spearman | tiempo |
|---|---|---|---|---|---|---|
| **nomic-embed-text** | 768 | **0,75** | 0,725 | 0,725 | 0,879 | 2,9 s |
| bge-m3 | 1024 | 0,25 | 0,700 | 0,738 | 0,833 | 6,0 s |

Reproducible: `pnpm measure:matryoshka` → `artefactos/matryoshka-256.json`.

> **Una corrección, y es del tipo que este repositorio se obliga a escribir.**
> Este documento publicó primero 0,875 y 0,375, salidos de un script suelto que
> no se versionó y cuyas 8 consultas no quedaron anotadas. Al convertir el
> esbozo en `collectors/src/rag/medir-matryoshka.ts` —con las consultas dentro,
> que es lo que hace comparable una corrida con la siguiente— las cifras bajan a
> 0,75 y 0,25: una consulta de diferencia en cada modelo. **La conclusión no
> cambia** —nomic aguanta el truncado tres veces mejor que bge-m3— pero las
> cifras de antes no eran reproducibles, y una medición que no se puede repetir
> no es una medición. Las de arriba salen del script que está en el repo.

**bge-m3 truncado a 256 cambia el primer resultado en 6 de cada 8 consultas.**
No está entrenado con Matryoshka y se nota exactamente donde se esperaba: en el
prefijo. Que su Spearman global sea 0,83 y su recall@1 sea 0,25 dice algo
importante — el orden general se conserva a grandes rasgos y **la cabeza del
ranking, que es la que se lee, no**. Una métrica agregada sola habría dado esto
por bueno.

nomic-embed-text es el modelo elegido, y no era el que ya estaba descargado en
la máquina.

## Lo que esto NO dice

- **No dice que nomic-embed-text sea mejor recuperador que bge-m3.** Mide
  fidelidad al truncado, cada modelo contra sí mismo. Comparar la calidad
  absoluta de los dos exige juicios de relevancia sobre las 8 consultas, que no
  se han hecho.
- **No dice que 256 dims sea suficiente.** Dice que el truncado a 256 conserva
  el 75 % del top-1 del propio modelo. El 25 % restante es coste real y está
  declarado en la cabecera de `embeddings.ts`. Subir a 768 es un re-embed
  más un cambio de esquema, no una migración de arquitectura.
- **No mide la búsqueda del producto.** `hybrid_search` fusiona este ranking con
  el léxico por RRF; el efecto de una permutación en la cabeza semántica sobre
  el resultado final es menor que estas cifras, y tampoco está medido.

## Cómo reproducirlo

```bash
ollama pull nomic-embed-text && ollama pull bge-m3
pnpm collect:articulado Ley 1616 2013     # si falta el artefacto
pnpm collect:corte                        # si falta el de la relatoría
pnpm measure:matryoshka
```

El script es `collectors/src/rag/medir-matryoshka.ts` y lleva dentro las 8
consultas: sin ellas, dos corridas no son comparables — que es exactamente lo
que le pasó a la primera versión de esta tabla. Escribe
`artefactos/matryoshka-256.json` con las cifras y su procedencia.

El núcleo del procedimiento, para leerlo sin abrir el fichero:

```js
// resumen de collectors/src/rag/medir-matryoshka.ts
const embed = (model, inputs) =>
  fetch("http://127.0.0.1:11434/api/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: inputs }),
  }).then((r) => r.json()).then((j) => j.embeddings);

const norm  = (v) => { const n = Math.hypot(...v); return n === 0 ? v : v.map((x) => x / n); };
const trunc = (v, d) => norm(v.slice(0, d));            // truncar Y re-normalizar
const dot   = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

const ranking = (q, docs) =>
  docs.map((d, i) => [i, dot(q, d)]).sort((a, b) => b[1] - a[1]).map(([i]) => i);

// Para cada consulta: ranking(norm(Q), docs.map(norm))  vs
//                     ranking(trunc(Q, 256), docs.map((v) => trunc(v, 256)))
// y se compara con recall@k y Spearman.
```

El `trunc` **re-normaliza**, y no es un detalle: el índice HNSW de
`db/schemas/08_rag.sql` usa `vector_ip_ops` (producto interno), que solo
equivale al coseno con vectores normalizados. Medir sin re-normalizar habría
dado un resultado peor por una razón que no es la del modelo.
