# basedoc — estructura medida

**Medido el 2026-08-20** sobre `ley_1616_2013` (Ley de salud mental), en vivo.
Se documenta la **estructura**, nunca el contenido: el texto de las notas lo
edita Avance Jurídico y no se reproduce aquí ni en los fixtures (§5.2).

## Acceso

| Hecho | Medición |
|---|---|
| HTTPS | **muerto**: `HTTP 000` tras 15 s de espera |
| HTTP | `200`, 113.145 B, 0,95 s |
| Codificación | **ISO-8859-1** (declarada y real; UTF-8 revienta en `0xed`, pos. 303) |
| `robots.txt` | Joomla por defecto: bloquea `/administrator/`, `/cache/`, `/components/`… **`basedoc` NO está en `Disallow`** |

## El fallo silencioso: el HTML no trae las notas

El documento llama `insRow1()` … `insRowN()`, pero **las funciones se definen en
`js/{slug}.js`**, un fichero aparte.

```
/senado/basedoc/ley_1616_2013.html      113.145 B   53 llamadas insRowN()
/senado/basedoc/js/ley_1616_2013.js      60.198 B   53 definiciones
```

Un colector que solo pida el HTML **no falla**: devuelve una página
perfectamente parseada y con **cero** datos de vigencia. Por eso `parseBasedoc`
publica `cajasEnHtml` y `cajasEnJs` por separado — la discrepancia es la señal.

## Anatomía de una nota de afectación

Los campos que se extraen, en el orden en que aparecen:

```
- {UNIDAD} {VERBO} por el artículo {N} de la {TIPO} {NÚMERO} de {FECHA},
  '{título}', publicada en el Diario Oficial No. {DO} de {FECHA}.
  {REGLA DE VIGENCIA}.
```

| Campo | Ejemplo de forma | Se persiste |
|---|---|---|
| UNIDAD | Artículo · Parágrafo · Inciso · Numeral · Definición | ✅ el término |
| VERBO | modificado/a · adicionado/a · derogado/a · … | ✅ como `tipo` |
| Norma afectante | `Ley 2460 de 2025`, artículo `3` | ✅ |
| Diario Oficial | `53.153`, `18 de junio de 2025` → `2025-06-18` | ✅ |
| Regla de vigencia | «Rige a partir de su publicación…» | ✅ **normalizada**, no la frase |
| Título de la norma | `'por medio del cual se modifica…'` | ❌ prosa del editor |
| Cuerpo de la nota | — | ❌ **nunca** |

## Contabilidad de las 53 cajas

Cada caja acaba en **exactamente una** categoría, y la suma tiene que cuadrar:

| Categoría | N | Qué es |
|---|---|---|
| `leads` | **37** | Afectaciones: 17 `modifica` + 20 `adiciona` |
| `textosOriginales` | **14** | «Texto original de la Ley…»: la versión anterior del articulado |
| `notasEditoriales` | **2** | «En criterio del editor…», «Destaca el editor…» |
| `noInterpretadas` | **0** | Hueco real del parser. Si sube, hay trabajo |

Las **notas editoriales se cuentan aparte** y no como hueco: son opinión de una
editorial privada, citan ley y artículo, y un parser ingenuo las tomaría por
afectaciones — metiendo el juicio de un tercero en la cadena de vigencia, que es
justo lo que R1 prohíbe.

Normas afectantes distintas halladas: **3** (Ley 2564/2026, Ley 2460/2025,
Ley 1955/2019). Sello del documento: `2026-08-15`, DO `53.578`.

## Por qué un lead NO es una `afectacion`

Esto es lo que un escéptico pilló falsificado en la investigación original.

Una nota de basedoc es lo que **un tercero** (Avance Jurídico) dice sobre una
norma, no lo que la norma dice de sí misma. Para escribir una fila en
`afectacion` con `derivation = 'declarado_en_norma'` hay que ir a la **norma
afectante** y leer su cláusula. El lead solo dice **a qué norma ir**, y lleva el
`href` para llegar.

La base lo hace cumplir sola: `afectacion_vigencia_exige_primaria` rechaza
`declarado_en_norma` con `tier` distinto de `primaria`. Un lead es
`institucional`, así que no entra por esa puerta ni queriendo.

Es el pipeline `lead → norma afectante → cláusula` de la Fase 2, y este módulo
es solo el primer paso.
