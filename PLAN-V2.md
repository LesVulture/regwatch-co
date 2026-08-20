# regwatch-co v2 — Plan de construcción

> **Estado:** plan aprobado para implementar. Redactado el 2026-08-19.
> **Base:** 13 investigaciones especializadas con verificación en vivo (fetch real contra cada fuente), **12 auditorías adversariales** en dos rondas y **4 verificaciones contra documentación viva**. Todo se abrió y comprobó entre el 2026-08-16 y el 2026-08-19.
> **Insumos crudos:** `research/*.json` (13 informes + 12 refutaciones + 4 verificaciones de docs + el panel de diseño de §14) — conservarlos en el repo como anexo auditable.
>
> ⚠️ **Estado de auditoría, dicho de frente.** **Las 13 especialidades pasaron por un escéptico adversarial**, en dos rondas, y el stack fijado se contrastó además contra documentación viva (Context7 + docs oficiales) en 4 pasadas más.
>
> | Ronda | Alcance | Veredictos | Refutados |
> |---|---|---|---|
> | 1ª | normativa, jurisprudencia, electoral, modelo-legal | 84 | 15 |
> | 2ª | congreso, prensa, supabase, frontend, ingesta, ai-layer, legal-ai, comparables | 165 | 22 |
> | Docs | frontend-stack, ingesta-stack, supabase-features, ai-apis | 54 ítems | 15 no vigentes |
> | **Total** | | **249 veredictos** | **37 refutados · 76 corregidos en parte** |
>
> **El 15 % de lo investigado resultó falso y otro 30 % inexacto.** Ese es el dato que hay que llevar puesto al leer el resto, y la razón de que este documento cite comando y salida en vez de pedir confianza. Lo que la segunda ronda tumbó, y ya está corregido abajo:
>
> - **El crosswalk Senado↔Cámara no estaba resuelto** (§6.1). Se daba por hecho que «las fuentes lo publican»; medido sobre 6.446 registros, el 18,9 % de las claves es ambiguo y el 13,4 % no tiene reciprocidad. Es un problema de resolución de entidades y **el plan lo presupuestaba en cero**.
> - **El `_ajax_nonce` de la Cámara no se valida** (§6.1): el plan diseñaba manejo de rotación para un modo de fallo inexistente.
> - **El ratio del índice HNSW va al revés** de lo que este mismo plan razonó (§8.4): a menos dimensiones, **sube**.
> - **`@serwist/next` es webpack y no soporta Turbopack** (§9), que es el bundler por defecto de Next 16.
> - **La Silla Vacía bloquea `ClaudeBot` y `anthropic-ai` en su `robots.txt`** (§6.4) — era la fuente #1 de la canasta de prensa.
> - **El plan Hobby de Vercel prohíbe el uso comercial**, donaciones incluidas (§9).
> - **Ámbito Jurídico estaba vivo** y clasificado como feed zombie; **Asuntos Legales** no tiene texto completo (§6.4).
>
> Sigue **sin auditar** una sola cosa, y se dice: las mediciones de este documento sobre sí mismo (§8.4) descansan en `research/supabase.json` contrastado con documentación oficial, pero nadie ha construido todavía el índice para comprobarlas. Por eso la Fase 2 entrega una **medición**, no una confirmación.

---

## 1. Contexto: por qué se reconstruye

La v1 (818 líneas) acertó en **una** cosa y falló en todo lo demás. Lo que acertó es lo único que se conserva:

**El contrato de evidencia.** Ningún registro sin URL checkeable y fecha de captura; jerarquía probatoria `primaria > institucional > secundaria`; `vigente` exige fuente primaria; la incertidumbre se declara, no se rellena. Esa idea resultó ser —según los comparables globales— exactamente lo que separa a los proyectos que sobreviven de los que mueren, y ningún producto del mercado (ni el enterprise) la ofrece anclada a fuente primaria colombiana.

Lo que falló:

| Falla de v1 | Consecuencia |
|---|---|
| **Cero recolección.** Las 8 fuentes están marcadas `"collector": "manual"` | 6 registros semilla. Un monitor que no monitorea. |
| **Clasificación léxica pura** (lista de términos por tema) | No captura sinónimos ni paráfrasis; se declaró como virtud lo que era límite técnico. |
| **JSONL append-only sin motor de consulta** | Imposible responder «¿qué normas afectan la IA en salud?» — la pregunta que motiva el proyecto. |
| **TUI de terminal** | Inaccesible desde el móvil, que es donde se consulta normatividad en una reunión. |
| **Sin modelo de vigencia** | `status: "vigente"` como campo plano, cuando la vigencia es una función del tiempo sobre un grafo de afectaciones. |

**Lo que se borra:** `bin/`, `lib/`, `data/seed.jsonl`, `config/` (la taxonomía de 6 temas se reemplaza por una de 45).
**Lo que se conserva:** `GOVERNANCE.md` (el contrato de evidencia, con las adiciones de §10), `LICENSE`, **`PLAN-V2.md` (este documento) y `research/` (el anexo de procedencia)**, y la disciplina de que las reglas se validan en código y fallan en CI. Los dos últimos son el motivo de que exista la v2: borrarlos al ejecutar la Fase 0 destruiría el plan que la ordena.

---

## 2. Qué es regwatch-co v2

Un **motor de búsqueda y monitoreo de la normatividad y la actividad legislativa colombiana**, con datos actualizados a diario desde fuentes oficiales, consultable desde el móvil, capaz de responder preguntas en lenguaje natural con **cada afirmación anclada a fuente primaria con URL y fecha de captura**.

La pregunta que define el producto: *«¿qué normas y proyectos afectan la adopción de IA en salud en Colombia?»* — debe responderse cruzando cuatro capas que hoy **nadie une en Colombia**:

```
   TRÁMITE            VIGENCIA           JURISPRUDENCIA        POLÍTICA
   (Congreso)         (normas)           (Corte Const.)        (CONPES)
   proyectos de ley   leyes/decretos     sentencias que        documentos
   actos legislativos vigentes e         declaran inexequible  de política
   ponencias/autores  históricos         o condicionan         pública
        │                  │                    │                  │
        └──────────────────┴────────┬───────────┴──────────────────┘
                                    ▼
                   GRAFO ÚNICO CON PROCEDENCIA POR ARISTA
                                    ▼
              búsqueda híbrida + Q&A con citas verificables
```

**El foso competitivo** (verificado contra 39 comparables regionales y globales): cada capa por separado ya tiene quién la raspe. El **cruce con procedencia auditable no existe** — ni en Congreso Visible, ni en Ley Chile, ni en vLex Vincent, ni en FiscalNote. Y hay un piso de precio publicado ($1.000 USD/año, BillTrack50). ⚠️ **Pero decir que en Colombia está «vacío» era falso:** Legis Xperta ocupa esa banda. El hueco real, y es más estrecho y más defendible, es otro: **lo que hay a ese precio no hace seguimiento legislativo diario, no expone API y no publica procedencia por arista.**

⚠️ **Dos correcciones de la segunda ronda que estrechan ese foso, y conviene saberlas antes de apostar por él:**
- **Legis ya regala «análisis de vigencia»** en su free tier, con solo registro. El informe original concluía que «el valor cobrable está en vigencia + Q&A + monitoreo»; si el incumbente ya da lo primero gratis, **la vigencia sola no es producto**. Lo que queda como diferencial es el *cruce* con procedencia por arista y la consulta a fecha arbitraria, no el dato de vigencia en sí.
- **El Gestor Normativo de Función Pública ya publica la semántica del modelo Ley Chile** —modificaciones por artículo, norma modificatoria nombrada, sentencia que la afectó, fecha y **el texto anterior de cada artículo**— en HTML renderizado en servidor. No invalida el proyecto (esa misma fuente **se autodesautoriza** para vigencia y tiene fichas sin refrescar desde 2015), pero sí desmiente que «no exista nada parecido en Colombia». Existe: está podrido y sin garantía. El foso es la **frescura con procedencia**, no la novedad del modelo.
- Detalle operativo útil: **Congreso Visible sí sirve datos server-side** (`<script id="__NEXT_DATA__">` y `GET /_next/data/{buildId}/proyectos-de-ley.json`). El informe lo daba por «JS-only que obliga a Selenium». Sigue siendo enriquecimiento, nunca primaria.

### Decisiones del dueño ya tomadas

| Decisión | Valor |
|---|---|
| Alcance histórico | Congreso desde 2018 · normas vigentes completas · Corte desde 2015 |
| Acceso | Pública con cuentas y colaboración |
| Votaciones nominales | **Fase 2**, no v1 |
| Infraestructura | Supabase plan Free. ⚠️ **El «slot disponible» está sin verificar de verdad:** se comprobó que la org `LesVulture` tiene 1 proyecto, pero el límite de 2 proyectos gratuitos es **por cuenta, no por organización** («*The project limit applies across all organizations where you are an Owner or Administrator*»). Primer gate de la Fase 0 |

---

## 3. Los diez hallazgos que definen la arquitectura

Todos verificados con fetch real. Los marcados ⚠️ **corrigen una creencia errónea** que habría costado días de implementación.

**1. Ambas cámaras del Congreso son consumibles como JSON hoy, sin autenticación.**
El Senado migró de Joomla a una app PHP con API limpia; la Cámara de Drupal a WordPress. Ningún tutorial anterior a 2025 sirve — las URLs viejas murieron sin redirect.
- Senado: `POST leyes.senado.gov.co/api/search_pdly.php` (multipart, campo `legislatura=2026-2027`) → **169 proyectos + 9 actos legislativos** de la legislatura actual, sin paginación. Detalle: `GET /api/get_detalle_pdly.php?id=9924` → HTML con ponentes por debate, fechas y **números de gaceta por etapa**.
- Cámara: `POST camara.gov.co/wp-admin/admin-ajax.php` con `action=get_proyectos_ley_page` y un `_ajax_nonce` de 10 hex extraíble del HTML público. IDs de legislatura son términos de taxonomía **no ordinales** (20=2026-2027, 13=2025-2026).
- **El crosswalk Senado↔Cámara lo resuelven las fuentes mismas**: cada registro publica el número de la otra cámara (formatos distintos: `001/26` vs `211/2026C`).

**2. ⚠️ Secretaría del Senado (basedoc) es la fuente más fresca del ecosistema, no solo la más rica.**
El investigador la reportó con «cadencia no medida»; el escéptico lo refutó midiéndolo: **toda página lleva `Última actualización: 15 de agosto de 2026 - (Diario Oficial No. 53.578...)`** — 4 días de latencia, con número de Diario Oficial incluido. Es simultáneamente la autoridad de vigencia **y el disparador diario**. Esto cierra el hueco que el informe original declaró irresoluble («ninguna fuente ofrece feed diario»).
- **Trampa crítica:** las cajas de notas están **vacías en el HTML** (`<table id="Table2" class="caja_vja_v"></table>`). El contenido vive en un JS compañero `basedoc/js/{slug}.js`, en funciones `insRowN()`, con binding **posicional** `insRowN() ↔ <table id="TableN">`. Un parser que solo lea el HTML pierde el 100% de las notas en silencio.
- **Solo responde por HTTP.** El puerto 443 hace timeout (`nc -zv 200.7.106.227 443` → timed out). WebFetch no sirve; hay que forzar `http://`. Charset ISO-8859-1.

**3. ⚠️ El Gestor Normativo de Función Pública está podrido y se autodesautoriza.**
Medición del escéptico sobre 7 fichas: `i=53646` no se refresca desde **2015-12-01**, `i=49981` desde 2023-08-09. Y la propia página declara: *«El Departamento Administrativo de la Función Pública NO SE HACE RESPONSABLE DE LA VIGENCIA de la presente norma»*. Su bloque `Vigencias(20)` para la Constitución omite reformas que el propio proyecto usa de ejemplo (AL 1 de 2003, AL 2 de 2004) e incluye ruido evidente.
→ **Degradado de primaria a `secondary`.** Sirve para el **grafo de afectaciones tipadas** (`Modificado por` / `Adicionado por` / `Reglamentado por`), nunca como prueba de vigencia.

**4. La relatoría de la Corte Constitucional es un Elasticsearch expuesto.**
`GET /relatoria/buscador_new/?accion=search&fini=...&ffin=...&maxprov=5000&tipo=json` devuelve la respuesta cruda del índice `datacortefullv8`. Regla ID→texto completo verificada en cuatro formas de identificador: `https://www.corteconstitucional.gov.co/relatoria/{rutahtml}`.
- ⚠️ **Techo duro de 10.000 por consulta, y falla de la peor forma posible:** `maxprov=10001` devuelve **HTTP 200 con un fragmento HTML de error**, no JSON. Un ingester que valide solo `status == 200` registrará cero resultados en silencio. **El parser debe validar content-type y parseo JSON, nunca el código HTTP.**
- ⚠️ `ver_modal_ultimas_providencias` **excluye autos** (500 registros, 0 autos): es «últimas N sentencias», no «últimas N providencias». Insuficiente como único heartbeat.
- Existe paginación real (`pagina=N`), que el investigador no encontró.

**5. Hay un rezago de 4 a 7,5 meses entre que la Corte decide y publica el texto** (C-505/25: 231 días). **Consecuencia de esquema no posponible: dos registros por decisión** — el comunicado de prensa (institucional, señal temprana) y la sentencia (primaria, texto completo), enlazados.

**6. ⚠️ La tasa base honesta de aprobación es 12,5%, no 23%.**
La base del Senado mezcla dos poblaciones. Proyectos de **origen Senado**: 35/281 = **12,5%** (IC95 ±3,9pp). Los de origen Cámara que aparecen ahí están sesgados por selección (solo llegan los que avanzaron): 52,1%.
- **El predictor dominante es quién firma, con brecha de 7,6x:** autor congresista **7,5%** vs. autor Gobierno **57,1%**.
- **El modo de muerte dominante es el reloj, no el voto:** ~64% terminan archivados por tránsito de legislatura (art. 190 Ley 5ª / art. 162 CP).
- Tener ponente designado: 24,0% vs 5,6% sin ponente — predictor observable con fecha.
- ⚠️ **`Estado` es texto libre sin normalizar: 77 valores distintos en 116 filas.** La normalización de estados es un *work item* propio, no un detalle.

**7. ⚠️ El directorio de la Cámara no se parsea como se creía — y da más de lo esperado.**
La receta del investigador (`div.profile-card` con `data-nombre`) devuelve **cero filas**: esos atributos no existen en el HTML servido. La ruta correcta es el blob `departamentosInfo`, que trae **11 campos por representante incluida la Comisión en 181/181** — elimina las 181 peticiones a perfiles individuales que el plan original presupuestaba.

**8. Las votaciones nominales existen, están al día, y son escaneos de papel.**
131 ZIPs en la mediateca de la Cámara (el último del 05/08/2026). Contienen `Votaciones manuales {fecha}.pdf`, `Title='Scanned Document'`. **Pero el OCR aquí es barato:** tabla impresa a máquina, 300 dpi, encabezado fijo, filas numeradas con columnas SÍ/NO. Con Mistral OCR a ~$2/1.000 páginas, el histórico cuesta decenas de dólares. Confirma **fase 2** como decisión correcta, no como renuncia.

**9. ⚠️ El Consejo de Estado choca estructuralmente con el contrato de evidencia.**
Sus enlaces son `VerProvidencia.aspx?tokenDocumento=<JWT>` con **expiración de ~1 hora** (no 24h, como se creyó: `exp` decodificado). Y su `robots.txt` prohíbe `/*.aspx?*`, que es *toda* su superficie útil. → **`secondary`, acceso manual bajo demanda**, con declaración explícita en la UI. El `guid` del documento sí es estable y debe guardarse.

**10. El calendario legislativo cambió en 2023 y la ley orgánica no se actualizó.**
CP art. 138 **modificado por el AL 2 de 2023**: el segundo periodo inicia el **16 de febrero** (antes 16 de marzo). Pero la Ley 5ª art. 224 **sigue diciendo «desde el 16 de marzo»** — contradicción viva verificada verbatim en ambos textos. → El calendario debe ser **dato versionado por legislatura con la CP prevaleciendo**, no una constante en el código.

---

## 4. Arquitectura: tres capas separadas desde el día 1

Patrón destilado de los supervivientes de 20 años (GovTrack, Open States, HowTheyVote, mySociety) y de los muertos (Borde Político, Curul 501, Public Whip, NosDéputés).

```
┌─ CAPA 1 · COMMONS ──────────── repo público, MIT/CC0, independiente del producto
│  colectores (1 por fuente) → JSON validado contra esquema → dumps semanales a git
│  personas/partidos/bancadas en YAML curado a mano (NO se raspan)
│  «última captura exitosa por fuente» como dato de primera clase
└──────────────────────────────────────────────────────────────────────
┌─ CAPA 2 · DATOS ────────────── Supabase (Postgres 17 + pgvector + FTS español)
│  normas versionadas por intervalo · grafo de afectaciones · trámite event-sourced
│  búsqueda híbrida RRF · RLS para lo personal · Storage para originales
└──────────────────────────────────────────────────────────────────────
┌─ CAPA 3 · PRODUCTO ─────────── PWA Next.js + API JSON pública + MCP server
│  timeline de trámite · alertas por tema/keyword · Q&A con citas ancladas
└──────────────────────────────────────────────────────────────────────
```

**Por qué separadas:** `unitedstates/congress` (CC0) sobrevivió a la muerte de Sunlight Foundation y GovTrack sigue leyendo de ahí. Los datos crudos como commons abierto son el seguro de vida del proyecto. **Nadie escribe del scraper a la base**: siempre hay un artefacto intermedio validado, que es también el punto de replay.

**La regla que mató a los comparables:** los proyectos de este tipo no mueren con un anuncio, mueren por *staleness* silencioso. Antídoto obligatorio: **frescura por fuente visible en la UI** y dumps versionados como *heartbeat* público.

---

## 5. Modelo de datos

Verificado artículo por artículo contra la Constitución, Ley 5ª de 1992, Ley 3ª de 1992 y Ley 1909 de 2018.

### 5.1 Entidades núcleo

| Entidad | Rol |
|---|---|
| `norma` | Work en el sentido FRBR: «Ley 1751 de 2015» como identidad abstracta. `eli_uri` propio, `tipo_norma` (17 valores), `rango` **separado** de tipo, `emisor_id` **obligatorio** para decretos/resoluciones (`Decreto 1377 de 2013` es ambiguo sin él), `numero` como texto (conservar ceros: `019`, `0113`) |
| `norma_version` | Expression: texto vigente entre `vigente_desde` y `vigente_hasta`, con `motivo_cambio` → `afectacion` |
| `articulo` | Unidad citable. `numero` como texto (`15`, `61M`, `63-1`, `2.5.3.2.1.1`), `ruta_estructural`, `proviene_de_norma_id` para provenance de compilación en DUR |
| `afectacion` | **El corazón del sistema.** Arista tipada norma→norma con `tipo_afectacion` (22 tipos), `fecha_efecto`, `alcance`, `texto_soporte`, `url_fuente_primaria`, `fecha_captura`, `jerarquia_evidencia`, `derivation`, `confidence` |
| `proyecto` | Expediente con `numero_camara` **y** `numero_senado`, `legislatura`, `cuatrienio`, `procedimiento`, `iniciativa`, `archivo_causa` |
| `tramite_evento` | Event-sourcing: **el estado se deriva de los eventos**, no se almacena como verdad |
| `sentencia` | Con `decision`, `alcance` y **`modulacion_efectos`** (`ex_nunc`/`ex_tunc`/`diferida`/`condicionada`) |
| `gaceta` / `diario_oficial` | ⚠️ **Entidades propias, no campos sueltos.** El contrato exige URL checkeable por registro; un número de gaceta sin documento no ancla nada |
| `cita` | Tripleta verificable: `(chunk_id, offset_inicio, offset_fin, destino_norma_id, confianza_resolucion)` |
| `fuente_captura` | `url`, `http_status`, `content_hash`, `fecha_captura`, `parser_version`, **`es_soft_404`** |

Además: `ponencia`, `comision`, `congresista`, `partido`, `entidad`, `conpes`, `tema`.

### 5.2 Vigencia: el modelo que hace funcionar todo

**`vigente` no es un booleano: es una función del tiempo sobre el grafo de afectaciones.**

```sql
-- La pregunta real que el sistema responde:
-- "¿qué decía el artículo 15 de la Ley 1581 el 3 de marzo de 2024?"
SELECT * FROM norma_version
WHERE norma_id = ? AND vigente_desde <= '2024-03-03'
  AND (vigente_hasta IS NULL OR vigente_hasta > '2024-03-03');
```

**Pipeline obligatorio de evidencia para cada arista** (esto implementa el contrato):

```
anotación/lead  →  identificar norma afectante  →  DESCARGAR EL TEXTO DE ESA NORMA
                →  extraer su cláusula derogatoria/modificatoria
                →  guardar la arista citando el Diario Oficial de la norma afectante
```

Nunca se guarda la prosa editorial de terceros como registro; solo como *lead*.

⚠️ **El agujero de R1: `fecha_efecto` no tenía productor declarado, y el `SELECT` de arriba cuelga de él.**
R1 promete que «la vigencia NUNCA sale del LLM: es consulta determinista al grafo». Pero `vigente_hasta` se deriva de `afectacion.fecha_efecto`, y un borrador anterior nombraba ese campo **una sola vez en 561 líneas**, sin decir quién lo produce. Si lo produce un LLM leyendo la cláusula, R1 es papel mojado: la vigencia saldría del modelo por la puerta de atrás. **Régimen probatorio obligatorio, con tres rutas separadas y un campo que las distinga:**

| `derivation_fecha` | Cuándo | Régimen |
|---|---|---|
| `declarada_en_texto` | La cláusula da fecha explícita («entra en vigor el 1 de julio de 2025») | Se guarda con offsets verificables contra los bytes crudos. Máxima jerarquía |
| `derivada_deterministicamente` | La cláusula da una regla computable («rige a partir de su publicación») + el número de Diario Oficial | Función pura, testeable, **sin LLM**. Se guarda la regla aplicada, no solo el resultado |
| `no_determinable` | Vacatio ambigua, condicionada a reglamentación, o cláusula que no fija fecha | **`fecha_efecto` queda NULL y la consulta devuelve «vigencia no confirmada con fuente primaria»** — que es exactamente lo que R1 manda decir |

La tercera fila es la que hace honesto el sistema: **es preferible un NULL declarado a una fecha inventada con cara de dato.** Un LLM puede *proponer* la clasificación; el código la verifica y la fecha nunca se acepta sin una de las dos primeras rutas.

⚠️ **Restricción legal verificada:** `secretariasenado.gov.co` es **Avance Jurídico Casa Editorial S.A.S.** (ISSN 1657-6241), editorial privada, no fuente estatal. Prohíbe el aprovechamiento de sus notas de vigencia **«en publicaciones similares y con fines comerciales»** (el escéptico corrigió que esos dos calificativos acotan el alcance; el investigador los había omitido). ⚠️ **Y el plan se contradecía a sí mismo aquí:** §6.2 designa basedoc «autoridad de vigencia» mientras §12 dice «notas como leads, nunca registros». No pueden ser las dos cosas, **porque la vigencia ES la nota**. La regla operativa que resuelve la contradicción, y que hay que leer literalmente:

> **De basedoc se persiste EL HECHO, nunca la prosa.** Registro propio: `(norma_afectada, tipo_afectacion, norma_afectante, artículo, fecha, número de Diario Oficial, url, captured_at)`. El párrafo de la nota se usa para **encontrar** ese hecho y se descarta; lo que queda almacenado es una tupla de datos verificada contra el Diario Oficial de la norma afectante, que es información pública, no expresión editorial protegible.

Eso hace innecesario apoyarse en los dos calificativos del aviso («en publicaciones similares **y con fines comerciales**»), que además son **una declaración unilateral del editor, no una licencia**: no delimitan el derecho, solo enuncian cómo lo interpreta quien lo invoca. El texto normativo en sí es dominio público (Ley 23 de 1982, art. 41).

**Tipos de afectación** (extracto de los 22): `deroga_expresa`, `deroga_tacita`, `deroga_organica`, `modifica`, `adiciona`, `sustituye`, `subroga`, `reglamenta`, `compila`, `declara_inexequible_total`, `declara_inexequible_parcial`, `declara_exequible_condicionada`, `suspende_provisionalmente`, `anula` (Consejo de Estado), `decae_pierde_fuerza_ejecutoria` (**5 causales**, CPACA art. 91 — el escéptico detectó que faltaba la 5ª: «cuando pierdan vigencia»), `derogada_por_referendo` (CP 170).

### 5.3 Huecos de taxonomía que el escéptico detectó y hay que cerrar

Estos **no estaban** en el modelo del investigador y tienen consecuencia directa de esquema:

1. **Anuncio previo de votación** (CP art. 160, adicionado por AL 1 de 2003) — **el vicio de procedimiento más litigado de Colombia**. Sin `tramite_evento.tipo_evento = 'anuncio_votacion'` el sistema no puede detectar la irregularidad que más tumba leyes.
2. **Unidad de materia** (CP art. 158) y su apelación **ante la misma comisión** — distinta de la apelación ante plenaria del art. 166.
3. **Referendo derogatorio** (CP 170) y referendo de reformas (CP 377) — faltan como estados de vigencia.
4. **Rutas de reforma constitucional** por Asamblea Constituyente (CP 376) y referendo (CP 378) — el modelo solo contemplaba acto legislativo.
5. **Decretos con fuerza de ley del Plan Nacional de Desarrollo** (CP art. 341, confirmado vía CP 241-5) — fuera de la jerarquía.
6. **Motivo de la objeción** (inconstitucionalidad vs. inconveniencia, Ley 5ª art. 199): solo la primera abre ruta a la Corte. Sin distinguirlo, el grafo no puede derivar si corresponde control previo.

**Correcciones puntuales:** `negado_en_comision_art157` → **art. 166** (el 157 es «iniciación del debate»); Ley 5ª art. 142 tiene **≥20 numerales**, no 17 (con el 18 condicionalmente exequible); `en_control_previo_corte` cubre **tres rutas** (estatutarias ex ante; proyectos objetados por inconstitucionalidad; tratados con control **posterior** a la sanción).

### 5.4 Estándares: adoptar patrones, no conformidad formal

Ningún estándar internacional tiene adopción oficial en Colombia (verificado por ausencia). **Precedente regional confirmado:** la BCN de Chile publica un «Esquema Akoma-Ntoso BCN» con SPARQL y ontologías RDF.

- **Adoptar:** la jerarquía FRBR **Work/Expression/Manifestation** (resuelve el problema central de vigencia), el vocabulario de estructura (`book/part/title/chapter/section/article`) que mapea 1:1 con la ruta de 5-6 niveles del DUR, y el patrón de referencias tipadas.
- **No hacer:** serializar el corpus a XML AKN completo, ni SPARQL (en Ley Chile la API XML aburrida sobrevivió 20 años; el SPARQL casi no se usa).
- URIs propias estilo ELI: `/eli/co/ley/2012/1581/vigente-a/{fecha}`.

### 5.5 Taxonomía: 45 temas

Reemplaza los 6 de v1. Derivada de las materias de las 7 comisiones constitucionales (Ley 3ª de 1992), los sectores administrativos del Estado y EUROVOC. Incluye los ejes que pediste (`salud`, `ia-y-transformacion-digital`, `empleo-y-trabajo`, `turismo`, `ambiente-y-recursos-naturales`, `conflicto-y-paz`) más 39 que el corpus exige.

**La clasificación es híbrida, no léxica pura** — corrigiendo el error de v1: capa léxica explicable (término disparador visible, como en v1) **+** capa semántica (embeddings) **+** sugerencia de LLM con justificación citada. Las tres se guardan por separado con su procedencia; el usuario ve por qué un registro cayó en un tema.

---

## 6. Fuentes: reparto verificado por rol

**Ninguna fuente cumple los tres roles.** Separarlos explícitamente es la decisión que evita el error de v1.

**Las cuatro subsecciones pasaron por un escéptico que abrió cada endpoint**, §6.1 y §6.4 en la segunda ronda. Fueron precisamente esas dos las que peor salieron: §6.1 con 5 refutados de 23 y §6.4 con 7 de 20. Lo que sigue ya incorpora las correcciones; los bloques ⚠️ marcan qué creencia se cayó y qué hay que construir en su lugar.

### 6.1 Trámite legislativo · ✅ **auditada** (`research/congreso.json` + `refute2-congreso.json`)

> El refutador de esta especialidad murió cinco veces por límite de sesión; a la sexta corrió, y **fue la auditoría más destructiva de las doce**: 5 refutados y 12 corregidos en parte sobre 23 veredictos. Lo que sigue ya incorpora sus correcciones. Tres de ellas cambian la Fase 1, no solo un dato.

| Fuente | Rol | Acceso verificado |
|---|---|---|
| **Senado — API de leyes** | `primary` | `POST /api/search_pdly.php` (+ `_pal`, `_lys`, `_actos`); detalle `get_detalle_pdly.php?id=N`, **enumerable y denso 1..~10.115** (medido) para backfill completo desde 1991 |
| **Cámara — admin-ajax** | `primary` | `POST admin-ajax.php`; `link_web` como slug estable. **El `_ajax_nonce` NO se valida** (ver abajo). ⚠️ **Su ToS prohíbe reproducción y almacenamiento sin autorización escrita** — bloqueante de §15.3, se resuelve con derecho de petición |
| **Cámara — RSS + sitemap** | trigger | `camara.gov.co/feed/`, `lastmod` intradía. **La mejor señal push del ecosistema** |
| Senado — RSS | ✗ | RSS da 500, sitemap de 2019. → snapshot-diff diario del API (barato: devuelve la legislatura completa) |
| Congreso Visible | enriquecimiento | Datos al día (cuatrienio 2026-2030 cargado) pero **API muerta desde el rediseño 2021** y dashboards rotos. Institucional, nunca primaria |

⚠️ **Actos legislativos requieren parser separado:** `get_detalle_pal.php` tiene **ocho** ranuras de ponente (incluye segunda vuelta) y **no** tiene campo `comision`. Un parser compartido descarta en silencio los hitos de segunda vuelta.

#### Lo que la auditoría rompió, y hay que construir distinto

**1. ⚠️ EL CROSSWALK SENADO↔CÁMARA NO ESTÁ RESUELTO. Es la corrección más cara del plan.**
Un borrador anterior afirmaba que «lo resuelven las fuentes mismas: cada registro publica el número de la otra cámara». **Refutado sobre los 6.446 registros del corpus completo**, y después **re-medido de primera mano contra la API el 2026-08-19** durante la implementación:

| Legislatura | Filas | Con `numero_camara` | Formatos distintos |
|---|---|---|---|
| **2024-2025 (cerrada)** | 471 | **224 = 47,6 %** | **7** |
| 2026-2027 (en curso) | 194 | 3 = 1,5 % | 1 |

La cifra que vale es la de la legislatura **cerrada**: **más de la mitad de los proyectos no declara su contraparte ni al terminar el trámite.** El 1,5 % de la legislatura en curso mide otra cosa —los proyectos aún no han cruzado de cámara— y citarlo como si fuera lo mismo exageraría el hallazgo.

**Y un problema de modelado que ningún informe había mencionado: la acumulación.** Un proyecto absorbe a otros y el campo trae varios números en una sola cadena, con **tres grafías de la misma palabra** (`Acum`, `ACUM`, `Acumulado`) y separadores inconsistentes. El caso extremo real acumula **cinco** proyectos en uno: `093/24 Acum 12/24 - 118/24 - 155/24 - 201/24 - 233/24`. **El crosswalk no es 1:1, es 1:N** — un `JOIN` sobre este campo no funciona ni con los datos que sí están.

**Consecuencia:** el crosswalk es un **problema de resolución de entidades con revisión humana**, no un `JOIN`. Es un work item propio de la Fase 1, del tamaño de la normalización de estados, y el plan lo presupuestaba en cero.

**Decisión de diseño ya implementada** (`collectors/src/senado/crosswalk.ts`): **no se resuelven identidades por parecido**. Si la fuente calla, el estado es `no_declarado` y ahí termina el trabajo automático. Emparejar por título o autor fabricaría relaciones falsas, y publicar «el Senado y la Cámara se contradicen» cuando no es cierto hace más daño que no cruzar nada.

**2. Ingerir solo la legislatura activa rompe el crosswalk.** Los proyectos cruzan de cámara arrastrando números de **otra** legislatura: en la legislatura 2024-2025 del Senado, **111 de 219** `numero_camara` no existen en el listado de Cámara de esa misma legislatura. El job diario necesita ventana multi-legislatura, no la activa sola. (El árbitro propuesto, Congreso Visible, tampoco sirve: cubre una fracción.)

**3. Tope silencioso de 100 filas.** `search_*` **sin filtro** devuelve exactamente 100 filas y no expone parámetro de paginación. Con filtro sí entrega todo (`legislatura=2024-2025` → 470). Y **`search_lys` y `search_actos` no aceptan `legislatura` ni `autor` ni `comision`**: el servidor los ignora en silencio con HTTP 200. La receta «job semanal de leyes sancionadas por legislatura activa» **no puede funcionar tal como estaba escrita**. Salida verificada: una `palabra_clave` amplia levanta el tope (`A` → 2.711 leyes) y `get_detalle_lys.php?id=` es enumerable.

**4. El `_ajax_nonce` de la Cámara no se valida — el plan diseñaba defensa contra un fallo inexistente.** El handler responde igual con nonce falso, y omitiéndolo por completo. Los 6.446 registros se bajaron con `_ajax_nonce='x'`. Todo el paso de scraping del nonce, su rotación y la ruta de fallo por caché de WordPress **sobran**. Se mantiene el scrape como seguro barato (la Cámara podría activar `check_ajax_referer` mañana), pero tratar el error de nonce como camino previsto era mantenimiento sin contrapartida. Si aun así se scrapea: el único válido es `window.PL_CFG.PL_NONCE` — la página tiene ≥9 cadenas con forma de nonce y **la primera no es la buena**.

**5. Las gacetas NO necesitan un worker headless.** El informe concluía que la descarga es «un POST stateful con ViewState + cookie de sesión → hace falta Playwright». La premisa es cierta, la conclusión sobra: el auditor bajó el PDF entero **con dos llamadas de `curl`**. Quitar el worker headless del presupuesto de la Fase 1.

**6. El permalink de la Imprenta falla en silencio.** El enlace `...index2.xhtml?ent=Cámara&fec=...` que el informe citaba **no descarga nada**: la app decodifica el query string como ISO-8859-1, así que `Cámara` en UTF-8 (`C%C3%A1mara`) no casa con ninguna entidad y devuelve ~1.957 bytes de HTML sin `Content-Disposition` — indistinguible de un éxito para un ingestor que solo mire el status.

**7. `get_detalle_*.php` devuelve HTTP 200 con prosa para un id inexistente**, no 404: `<p class="text-warning">No se encontró un proyecto con el ID proporcionado.</p>` (80 bytes). El backfill por enumeración necesita detectar ese cuerpo, no confiar en el código.

### 6.2 Normatividad y vigencia · ✅ **auditada** (`research/normativa.json` + `refute-normativa.json`)

| Fuente | Rol | Uso |
|---|---|---|
| **Secretaría del Senado (basedoc)** | `primary` — **autoridad de vigencia y disparador diario** | Texto + notas + jurisprudencia + legislación anterior. Parsear HTML **y** `js/{slug}.js`. Solo HTTP. Sello `Última actualización` legible por máquina |
| **Función Pública (Gestor Normativo)** | `secondary` | Solo grafo de afectaciones tipadas. **Nunca vigencia** (se autodesautoriza; fichas de hasta 2015). ⚠️ **`robots.txt` permisivo pero el ToS prohíbe la recolección automatizada sin consentimiento escrito** (§15.1) |
| **datos.gov.co SODA `88h2-dykw`** | backfill | 23.373 filas 1991→2026. Rezago ~20 días → **no sirve de disparador**. ⚠️ **No es dominio público: CC BY-SA 4.0 con atribución al DAPRE.** El *ShareAlike* puede alcanzar a lo derivado — decidir la licencia del proyecto sabiéndolo (§13.2) |
| **DNP CONPES** | `primary` | ~4.200 PDFs nativos en carpeta plana, numeración 1→~4.200, sin auth ni JS. **Todo bajo `/CDT/Conpes/Económicos/`** (contraintuitivo pero verificado). ⚠️ **ToS prohíbe robots y spiders sin autorización escrita** — no condicionado a comercialidad (§15.1) |
| **SisCONPES** | `primary` | ⚠️ El investigador se rindió prematuramente («probablemente ViewState»); el escéptico lo abrió: **sin `__VIEWSTATE`, GET simple**. Su sección «En consulta ciudadana» es señal temprana de política pública |
| DAPRE Presidencia | `secondary` | PDFs **escaneados con OCR imperfecto** («Galopa» por «Galapa») — degradan la búsqueda léxica |
| SUIN-Juriscol | ⚠️ sin verificar | **No respondió en dos intentos independientes** (2026-08-19). Riesgo de arquitectura declarado, no ignorado |

### 6.3 Jurisprudencia · ✅ **auditada** (`research/jurisprudencia.json` + `refute-jurisprudencia.json`)

| Fuente | Rol | Acceso |
|---|---|---|
| **Corte Constitucional — relatoría** | `primary` | Elasticsearch expuesto. Backfill: ~12 peticiones (una por año 2015-2026). Filtrar `prov_tipo != 'Auto'` → ~1.300 sentencias C- y ~430 SU- en vez de ~22.000 providencias |
| **Corte — comunicados de Sala Plena** | `institucional`, alerta temprana | `POST /webapi/api/Elastic/Consulta`. Cubre el rezago de 4-7,5 meses. **Contar `len(hits.hits)`**, los campos de conteo son contradictorios |
| Consejo de Estado (SAMAI) | `secondary`, manual | JWT de ~1h + `robots.txt` prohíbe `/*.aspx?*`. Guardar el `guid` estable. Su campo `TITULACIÓN` es vocabulario controlado de alto valor |

### 6.4 Prensa (señal temprana, nunca prueba de vigencia) · ✅ **auditada** (`research/prensa.json` + `refute2-prensa.json`)

> **La peor tasa de acierto de las doce auditorías: 7 refutados y 7 corregidos sobre 20.** La canasta que sigue ya está rehecha; la anterior tenía mal clasificadas cuatro de sus once fuentes.

Canasta base: La Silla Vacía, El Tiempo (`/rss/politica_congreso.xml`), El Espectador (política + judicial), **Ámbito Jurídico**, Asuntos Legales, La República, Semana, Portafolio, Caracol Radio, Infobae Colombia y los institucionales de Cámara y Presidencia.

⚠️ **Los «feeds zombie» siguen siendo el riesgo #1, pero la lista era incorrecta.** Obligatorio: alarma de staleness por fuente (`max(pubDate)` vs cadencia esperada), **jamás** chequeo de status. Correcciones medidas:

| Afirmación del informe | Realidad medida |
|---|---|
| Ámbito Jurídico «RSS abandonado desde jul-2025» | **VIVO, y de los más ricos del inventario.** Los 4 primeros ítems son *sticky* viejos y engañan al que mira solo el primero; detrás hay 6 ítems frescos de ayer, todos regulatorios. Su `<description>` trae ~8.000 caracteres |
| Asuntos Legales «RSS con texto completo (`content:encoded` en los 20 ítems)» | El tag existe en los 20 pero está **VACÍO** (`<![CDATA[]]>`, longitud útil 0). Es «solo resumen» (~140 chars), como El Tiempo y La República |
| `camara.gov.co/feed/` = «comunicados institucionales» | **9 de 10 ítems son del *custom post type* `proyectos-ley`.** El titular que el informe citaba como noticia era un proyecto de ley. Sirve como trigger de trámite, no como prensa |
| Conteos de ítems por feed (38, 22, 24, 25…) | **Subconteo sistemático de 1,3× a 6× por truncación del fetch**: todo payload sobre ~130-170 KB quedó cortado. Los feeds Arc traen 100 ítems (su tope), no 20-38 |
| «Categoría `congreso` de El Espectador: sin probar» | Probarla ingenuamente da un **falso positivo**: `/discover/category/congreso/` devuelve 200 y un `<title>` que dice «Congreso», con 20 ítems del feed **general sin filtrar** |

⚠️ **Y una restricción que invalida la fuente #1 de la canasta:** el `robots.txt` de **lasillavacia.com** trae ~25 bloques `Disallow` por *user-agent*, entre ellos **`ClaudeBot`, `anthropic-ai`, `Claude-Web`, `GPTBot`, `CCBot` y `Google-Extended`**. El informe afirmaba que «todos los feeds recomendados tienen robots.txt permisivo». No es cierto, y menos en el que encabezaba la lista. **Decisión:** La Silla Vacía sale de la ingesta automatizada. Respetar esa directiva no es opcional para un proyecto cuya tesis es la procedencia honesta.

**Legal:** almacenar texto completo para republicación viola copyright. Patrón seguro: **indexación interna + snippet con enlace**. Ver el dictamen del auditor legal en §15.

---

## 7. Ingesta · ✅ **auditada** (`research/ingesta.json` + `refute2-ingesta.json` + `docs-ingesta-stack.json`)

**Stack** (las cuatro versiones son el `latest` de su línea al 2026-08-19, verificado dos veces): colectores en TypeScript con **Crawlee 3.18.1** (Cheerio para estático, **Playwright 1.62.1** para JS), **feedsmith 2.9.6** para RSS (`rss-parser` está abandonado desde 2023), **unpdf 1.8.1** como primera pasada gratuita con router digital-vs-escaneado, **Mistral OCR** vía Batch (~$2/1.000 páginas) para escaneados con **Docling** (MIT, local) como plan B a coste cero.

**Pinear `3.18.1` exacto, no `^3.18`.** No es tiquismiquis de semver: el patch trae `fix(playwright): update handleCloudflareChallenge for new Cloudflare challenge markup` y `fix(core): do not purge storages that are already in use`. Crawlee 4.0.0-rc.0 y feedsmith 3.0.0-rc.3 van camino de GA: **no adoptar ninguno de los dos RC, pero fechar la re-verificación a ~90 días** en vez de congelar y olvidar.

**Orquestación: GitHub Actions cron en repo público** — $0, jobs de 6h, Chromium incluido. Tres trampas verificadas a manejar: retrasos en el minuto `:00`, mínimo 5 min entre crons, y **auto-desactivación a los 60 días sin actividad** (keepalive obligatorio). Horario valle ~3am Colombia con jitter. Supabase `pg_cron`/`pg_net` solo para fan-out, refresh de vistas y la alarma de fuente muerta.

**Detección de cambios:** SHA-256 de contenido normalizado + ETag/If-Modified-Since + UPSERT idempotente. Es la palanca económica: convierte el OCR de pago en coste marginal solo por documento nuevo.

**El contrato de evidencia vive EN la ingesta, no encima:** `raw bytes + url + captured_at + content_hash` se persisten **antes** de cualquier parseo. Parseo y OCR son derivados reproducibles.

**Política de cortesía innegociable:** UA identificado con URL del repo (sin email personal), `respectRobotsTxtFile`, concurrencia 1-2 por dominio, 2-5 s de delay con jitter, backoff honrando `Retry-After`.

⚠️ **Tres de esas cuatro cosas no las hace Crawlee 3.18 sola, y el plan las daba por gratis:**
- **`Retry-After` NO existe en Crawlee 3.18** — ni en la capa de crawler ni en la de HTTP. Un 429 cae en `BLOCKED_STATUS_CODES` y se trata como bloqueo, sin leer la cabecera. **Hay que escribirlo**: un `errorHandler` que lea `Retry-After` y reencole con delay. Y meterlo detrás de una **interfaz fina de pacing**, porque la v4 lo trae nativo (`ThrottlingRequestManager`) y así la migración es un cambio de implementación, no de llamadas.
- **`respectRobotsTxtFile` no honra `Crawl-delay`** (cero coincidencias en `@crawlee/utils` 3.18.1). Separar en el plan **permiso** (robots) de **ritmo** (`sameDomainDelaySecs` + `maxRequestsPerMinute` + `maxConcurrency`, a mano). Si una fuente colombiana declara `Crawl-delay`, se honra escribiéndolo.
- **El matcher de robots usa `*` por defecto, no el UA que se envía.** Fijar `respectRobotsTxtFile: { userAgent: '<el mismo UA>' }` con el UA como **constante compartida** entre el cliente HTTP y la config de robots. Si no, se declara una identidad y se obedecen las reglas de otra.
- Trampa silenciosa que rompe el diseño «un colector = un pipeline»: en Crawlee 3.x, **todo `BasicCrawler` sin `requestQueue` explícito comparte LA MISMA cola por defecto**. Y `sameDomainDelaySecs` retiene las requests **en memoria** dentro de jobs de hasta 6 h.
- Regla de dependencias: los colectores usan el `$` que inyecta Crawlee y **no declaran `cheerio` propio** — Crawlee 3.18.1 depende de `cheerio@1.0.0-rc.12` mientras el `latest` público es 1.2.0, y mezclar los dos da un conflicto latente.

**El router digital-vs-escaneado necesita criterio explícito, porque es lo que decide la factura de OCR.** Receta con la API real: `extractText(pdf, {mergePages: false})` → caracteres por página; por debajo del umbral, la página va a OCR. Para texto jurídico a dos columnas usar `extractTextItems` en vez de `extractText`, que pierde el orden de lectura con encabezados repetidos y numeración marginal — típico de gacetas y providencias. Y si se rasteriza en local, `renderPageAsImage` **no es gratis en dependencias**: exige `@napi-rs/canvas` y cambiar al build oficial de PDF.js. Alternativa más limpia: **mandar el PDF entero a Mistral OCR** y usar unpdf solo como router.

**`lastmod` del sitemap como detección de cambios ANTES de descargar.** La detección actual (SHA-256 + ETag/If-Modified-Since) es toda *post-fetch* o depende de que la fuente mande cabeceras correctas, y los portales estatales colombianos rara vez las mandan bien. El `lastmod` evita la descarga entera.

**Anti-fragilidad obligatoria:**
- Un colector = un pipeline CLI + **fixtures versionados con tests de snapshot**
- Tabla `source_runs` con «última corrida exitosa» y alerta de rotura
- **Validar content-type, no status HTTP** (lección de la Corte: 200 con HTML de error)
- Detección de soft-404 (la fuente devuelve 200 con página vacía)

**Coste estimado:** ~$5-15/mes en estado estable + ~$100 one-time para el backfill OCR.

---

## 8. Capa de IA y búsqueda

### 8.1 Las siete reglas de diseño (no negociables)

Destiladas del estudio de Stanford RegLab (17-33% de alucinación medida en Lexis/Westlaw **con** RAG) y de los cuatro líderes del mercado:

| # | Regla |
|---|---|
| **R1** | **La vigencia NUNCA sale del LLM.** Es consulta determinista al grafo de afectaciones. Si falta la cadena, la respuesta dice «vigencia no confirmada con fuente primaria» |
| **R2** | **Citas por construcción.** Chunks → Citations API de Anthropic (GA, `cited_text` no factura output) → post-validar que cada cita resuelva a un `chunk_id` existente. **Frase sin cita válida = frase que se elimina.** Implementación: **bloques `search_result`, no `document`** (ver §8.2) |
| **R3** | **Dos llamadas, no una.** Citations y structured outputs son incompatibles (400): extracción estructurada y redacción citada son pasos separados |
| **R4** | **Retrieval piso 2026:** chunking **por artículo** (nunca por tokens) + header contextual determinista + híbrido léxico/vectorial + rerank + descomposición de preguntas compuestas |
| **R5** | **Anti-sycophancy:** reformular toda pregunta a forma neutral antes del retrieval (ante premisa falsa, los LLM fabrican autoridades que la apoyan) |
| **R6** | **UX de evidencia:** badge de nivel probatorio + fecha de captura + quote expandible por afirmación. **Nunca exponer «confianza» del modelo** — hay cero correlación medida entre tono seguro y precisión |
| **R7** | **Medir antes de prometer:** gold set colombiano de 30-50 preguntas (con negaciones y premisas falsas) preregistrado en el repo, evaluando *correctness* y *groundedness* por separado. **Prohibido el claim «sin alucinaciones»** — LexisNexis lo dijo en 2023, Stanford midió 17%, y su página de 2026 ya no usa el término |

### 8.2 Modelos y costes (verificados el 2026-08-19)

| Uso | Elección | Coste |
|---|---|---|
| Pipeline de ingesta (~200 docs/día) | **Haiku 4.5** vía Batch API (50%) + structured outputs + **prompt caching** | ~$48/mes |
| Q&A con citas (~300/mes) | **Sonnet 5** ⚠️ ver nota de precio | ~$12/mes al intro · **~$18 a lista** |
| Embeddings | **voyage-4** (Matryoshka 256-2048, **200M tokens gratis** — cubre el bootstrap completo) | $0 inicial |
| Rerank | voyage rerank-2.5 | incluido |

**Total IA: ~$70/mes al precio introductorio, ~$76 a lista** — y **~$84-112 sumando la capa de validación de §14**. No es el cuello de botella; la ingesta lo es.

⚠️ **El precio de Sonnet 5 estaba mal, y la fecha importa: quedan días.** Un borrador afirmaba que el introductorio de $2/$10 «se volvió permanente». **Dos verificaciones independientes se contradijeron** —una lo dio por permanente citando la doc, otra midió que vence— y el desempate contra la referencia de modelos de Anthropic dice: **$3/$15 de lista, con introductorio $2/$10 hasta el 2026-08-31**. Es decir, sube en menos de dos semanas. **Presupuestar a lista** (dirección conservadora); si el introductorio se prorroga, sobra ~25 %. Se deja escrito el conflicto porque es exactamente el tipo de dato que nadie vuelve a comprobar y que envejece solo.

⚠️ **Tres límites operativos que muerden en el backfill, no en régimen estable:**
- **Haiku 4.5 tiene 200k tokens de contexto, no 1M.** Una ley con anexos, un CONPES largo o un decreto reglamentario con tablas lo supera y el request falla en validación. Medir con `/v1/messages/count_tokens` **antes de encolar** y rutear a Sonnet 5 —o a pre-troceo determinista— lo que pase.
- El Batch API expira sus lotes: tratar `expired` como **estado esperado con reintento y marca por documento**, no como excepción.
- Partir el backfill en lotes acotados en vez de encolar el corpus entero.

**Nota sobre contextual retrieval:** para texto jurídico bien estructurado, el header determinista gratuito `[Ley X de YYYY, art. N]` captura la mayor parte del beneficio de la técnica de Anthropic. Pagar generación LLM de contexto solo si el gold set demuestra que hace falta. **Tercera opción que el plan no contemplaba:** `voyage-context-4` produce embeddings de chunk *contextualizados* —embebe cada fragmento con conciencia del documento que lo rodea, sin generar texto con un LLM—, sale de la **misma bolsa de 200M gratis** y admite hasta 120.000 tokens de contexto. Va al bake-off de la Fase 2 contra el gold set, no como decisión adoptada: su documentación **no publica benchmarks** frente a embeber chunks aislados.

#### Cuatro cosas verificadas contra la documentación viva que cambian la implementación

**1. Usar bloques `search_result`, no `document` — convierte la validación de R2 de aritmética en un `SELECT`.**
Con bloques `document`, «validar que cada cita resuelva a un `chunk_id`» obliga a reconstruir la identidad del chunk desde `document_index` + offsets de caracteres, con un mapa paralelo que se desincroniza en cuanto cambie el orden de los documentos del request. Los bloques `search_result` (GA, sin *beta header*) están hechos para RAG: su campo `source` acepta cualquier cadena estable —`chunk://<chunk_id>` directamente— y **la cita devuelve ese `source` de vuelta**. El `title` que se envía (p. ej. «Ley 2277 de 2022, art. 54») también vuelve, alimentando gratis el badge de evidencia de R6. Siguen sujetos a R3: activar citations con `output_config.format` da 400 igualmente.

**2. Elegir el tipo de documento a conciencia, porque hoy el plan lo elige por accidente.** R4 fija «chunking por artículo», pero no dice qué bloque se envía, y la API **re-trocea por su cuenta según el tipo**: texto plano → re-troceo automático por frases (Claude puede citar **una frase dentro** del artículo: mejor para el quote expandible de R6, pero la cita deja de ser 1:1 con el `chunk_id`); *custom content* → sin re-troceo, la cita es el bloque entero (mapeo exacto con `chunk_id`). Las dos son defendibles; elegir sin saberlo, no.

**3. Prompt caching es la única palanca de coste que está sin usar, y se acumula con el 50 % del Batch.** La ingesta manda ~200 docs/día contra el **mismo** system prompt y el **mismo** esquema JSON, y hoy se paga ese prefijo 200 veces a precio completo. Con `cache_control` la lectura cuesta **0,1×**. La doc de Batch recomienda el **TTL de 1 hora** (write 2×, amortizado con dos lecturas). Tres invalidadores silenciosos que hay que escribir junto a la recomendación: (a) el orden de render es `tools` → `system` → `messages`, así que lo volátil va **después** del último breakpoint; (b) **cambiar `output_config.format` invalida la caché** — congelar el esquema antes del backfill; (c) verificar con `usage.cache_read_input_tokens`: si sale 0 en requests repetidos, hay un invalidador escondido.

**4. ⚠️ En PDF no se puede extraer JSON y anclar la página en el mismo request.** Un borrador afirmaba que con citations sobre PDF se obtiene `page_location` «y la cita queda anclada a la página exacta». **Refutado:** o se extrae JSON estructurado sin anclaje, o se cita con anclaje sin JSON — son **dos pasadas** sobre el mismo PDF, con su coste. Peor para el caso que más importaba: en una **gaceta escaneada** las citas se construyen troceando el *texto extraído*, y las imágenes no son citables; si no hay capa de texto, no hay cita que anclar. El OCR va antes, siempre.

**5. Verificar capacidades en runtime en vez de fijarlas en prosa.** `GET /v1/models/{id}` devuelve `max_input_tokens`, `max_tokens` y un objeto `capabilities` con banderas por feature (`citations.supported`, `structured_outputs.supported`, `batch.supported`). Un check de arranque que compare lo que el código asume contra lo que la API declara convierte una nota que envejece en una aserción ejecutable — coherente con el espíritu de R1.

### 8.3 Búsqueda híbrida en Postgres

Receta oficial de Supabase (`hybrid_search` con RRF, `rrf_k = 50`, pesos configurables, `FULL OUTER JOIN` de las dos CTEs). Los pesos permiten sesgar a léxico para `"ley 2277 de 2022"` y a semántico para `"impuesto a bebidas azucaradas"`.

⚠️ **No son «dos líneas», son cinco sitios — y uno de ellos impide crear la tabla si se ignora.** La adaptación al español exige `create extension unaccent` **y un wrapper `IMMUTABLE` esquema-cualificado** sobre `unaccent`: sin él la columna generada de `tsvector` no se crea, y sin cualificar el esquema el `dump/restore` se rompe. Eso va en el **esquema declarativo de la Fase 0**, no como descubrimiento de la Fase 4. Dos decisiones más que la receta obliga a tomar y el plan no tomaba:
- **`hnsw.iterative_scan = relaxed_order`** viene **`off` por defecto**. Sin él, filtrar por tema (2 de 45 en el piloto) o por vigencia sobre HNSW **devuelve menos filas que el `LIMIT` sin avisar**. Acotarlo con `hnsw.max_scan_tuples`.
- **Normalización vs. opclass, antes de embeber nada:** la receta oficial usa producto interno, que las docs solo recomiendan con vectores normalizados — y **truncar voyage-4 por Matryoshka a 256 dims los desnormaliza**. O se re-normaliza en escritura, o se usa la opclass de coseno. Decidirlo después de embeber cuesta un re-embed completo.

### 8.4 El plan Free: la aritmética, y lo que obliga · ✅ **auditada** (`research/supabase.json` + `refute2-supabase-infra.json` + `docs-supabase-features.json`)

Esta subsección ha corregido ya **dos** cifras optimistas de borradores anteriores de este mismo plan: primero «~300k chunks en Free» (contaba solo vectores crudos, sin índice), y después «~120k chunks, el extremo prudente» (120k está *por encima* del suelo calculado — era el extremo optimista disfrazado de conservador). Se deja el rastro porque es el tipo de número que nadie vuelve a comprobar.

**Antes que nada, la disidencia:** el especialista de Supabase recomendó explícitamente **«Pro desde el día 1 para el monitor diario; Free solo para prototipo»**, con **1024 dims**, argumentando que «500 MB de DB no aguantan ni el corpus de 50k documentos con texto completo». La decisión de intentarlo en Free a **256 dims** es del dueño del plan, no del especialista, y se toma con los ojos abiertos.

**Lo que cuestan los vectores:**

| Concepto | Base | Tamaño |
|---|---|---|
| Vector `halfvec(256)` | 256 × 2 B | 512 B |
| Fila completa (vector + FK + metadata + header) | *estimación del autor, sin fuente en el corpus* | ~600 B |
| Índice HNSW (`m=16`) | ⚠️ **≈1,6× a 256 dims** (medido). Ver abajo: el ratio va al revés de lo que decía el borrador | ~820 B |
| **Coste por chunk** | 600 B + 820 B | **~1,42 KB** (banda medida 1,34–1,42) |

Reservando **250 MB** para vectores+índice salen **~176k chunks** (`250 MB ÷ 1,42 KB`).

> ⚠️ **Tercera corrección de esta misma subsección, y la más instructiva.** Los borradores anteriores dijeron 300k, luego 120k, luego 114k. El 114k venía de dividir por 2,2 KB — el techo de una banda «1,4–2,2 KB» que se calculó cuando el índice se estimaba en 800–1.600 B. Al sustituir esa estimación por la medición (~820 B) **había que rehacer la división y no se rehízo**: la fila decía 820 B y la línea siguiente seguía dividiendo por 2.200. Un crítico de completitud lo encontró comparando la tabla con su propia conclusión. **Ninguna de las cuatro cifras se comprobó nunca contra un índice real**, y por eso el número que importa no es este: es el que la Fase 2 mida. Lo que queda en firme es la *forma* del problema, que sí sobrevivió a las tres correcciones: **los vectores no son el cuello de botella, el texto sí.**

⚠️ **Corrección de la corrección: el multiplicador del HNSW depende de la dimensión, y en dirección contraria a la que este plan supuso.** Un borrador anterior escribía que extrapolar el «1,5–3×» de 1024 dims a 256 era *conservador*, «porque el coste fijo por nodo no escala con las dimensiones». Esa premisa es correcta y la conclusión que sacaba de ella era la inversa de la buena: **si la lista de vecinos (2m = 32 enlaces en la capa 0) es un coste fijo por nodo, pesa MUCHO sobre un `halfvec(256)` de 516 B y casi nada sobre un `halfvec(1024)` de 2.052 B.** Valores medidos: **≈1,6× a 256 dims, ≈1,0× a 1024 dims**. A menos dimensiones, el ratio **sube**. El techo de ~114k sobrevive; el razonamiento que lo sostenía no.

**Un argumento a favor de 256 dims que nadie había visto:** a 1024 dims cada vector supera el umbral de TOAST y **vive fuera de línea** — +35 % de disco y una lectura extra de TOAST por vector fuera del índice. A 256 dims se queda *inline* y ese coste desaparece. El especialista recomendó 1024 sin medir esto.

⚠️ **Y hay un SEGUNDO techo que el plan no contaba: la RAM.** El Free corre en instancia **Nano — CPU compartida y hasta 0,5 GB de RAM**. Son dos límites distintos: **los 500 MB de disco dicen cuánto cabe; los 0,5 GB de RAM dicen si se puede consultar.** Consecuencias concretas:
- pgvector es explícito: «*Index build times are significantly faster when the graph fits within the `maintenance_work_mem` allocation*». Construir un HNSW con 0,5 GB compartidos puede tardar de forma desproporcionada.
- La medición entregable de la Fase 2 no puede ser solo «tamaño medio de artículo»: debe traer **latencia p95 de `hybrid_search` en Nano**, con la caché pre-calentada (`pg_prewarm`), o estará midiendo el disco en vez del sistema.
- Mitigación disponible: **índices HNSW parciales por tema** mientras el piloto sea vertical (`... where tema in ('salud','ia-y-transformacion-digital')`) — índice más pequeño, mejor recall, menos RAM.

⚠️ **Y una tercera restricción que el plan no contaba en ningún sitio: el egress.** El Free incluye **5 GB/mes** y la palabra no aparecía en el documento. El producto de §9 lo consume por cuatro vías simultáneas: la PWA pública, la API JSON «aburrida» que se ofrece como superficie diferencial, el MCP server sobre la misma base, y los dumps semanales que §4 y §10 exigen como heartbeat. **Mitigación estructural:** servir los dumps desde el repo *commons* de GitHub, no desde Supabase — el egress de git no cuenta contra el Free. Dimensionar las otras tres antes de la Fase 5.

⚠️ **El archivo de crudo, MEDIDO: 63,78 GB. Mata las dos ramas que el plan contemplaba.**
El gate 3 de la Fase 0 bajó muestras reales de los tres corpus (2026-08-19, resultado completo en `docs/gate3-medicion-crudo.json`):

| Corpus | Documentos | Peso mediano | Total estimado |
|---|---|---|---|
| Gacetas del Congreso | 31.332 | 764 KB | **52,93 GB** |
| CONPES | ~3.300 | 909 KB | 4,12 GB |
| Corte Constitucional (HTML, no PDF) | 49.574 | 110 KB | 6,73 GB |
| **Total** | | | **63,78 GB**, +7 GB/año |

Y es un **suelo**, no el archivo completo: falta el Diario Oficial, las 23.373 filas normativas del SODA, el Consejo de Estado y la Corte Suprema.

| Destino | Límite | Contra 63,78 GB | |
|---|---|---|---|
| Supabase Storage Free | 1 GB | **64×** el cupo | ✗ muerta |
| git / GitHub | <5 GB recomendado | **13×** el techo | ✗ muerta para el crudo |
| **Cloudflare R2** | 10 GB-mes gratis, luego $0,015/GB-mes, **egreso gratis** | **$0,81/mes** | ✓ |

**Recomendación: híbrido — y es una recomendación, no una decisión tomada.** Lo que el gate 3 zanjó es la MEDIDA (63,78 GB), que descarta por aritmética Supabase Storage y git. El DESTINO es otra cosa: R2 mete una **dependencia de pago y una cuenta nueva**, y eso lo decide Daniel, en bloque con §13.2. Va a §13 como decisión abierta.

Propuesta: crudo a **R2** direccionado por `content_hash`; **metadatos e índice de citas a git** (84.206 docs × ~1 KB ≈ **81 MB**: trivial, diffable, clonable); Supabase Free se queda con Postgres/pgvector y su bucket de 1 GB para evidencia puntual.

**El tradeoff, dicho de frente:** introduce una dependencia de pago (~$10/año) y un segundo sistema que respaldar, en un proyecto que hasta ahora cabía en tiers gratuitos. La alternativa —quedarse en git— obliga a **no persistir los bytes crudos**, que es justo lo que §7 declara innegociable. **Se paga el dólar o se rompe el contrato de evidencia.** La propiedad que decide no es el precio sino el **egreso gratis**: un *commons* público se descarga, y S3 y Supabase cobran la salida.

**Corrección a este mismo plan:** un borrador atribuía la muerte de Storage a que «las gacetas escaneadas rozan el límite de 50 MB por fichero». Lo que la mata es el **agregado**, que hace irrelevante el tope por fichero (el mayor medido fue 14,9 MB). Y el medidor fue honesto sobre lo que no probó: **no sorteó ninguna gaceta escaneada**, así que el peso de esa población sigue abierto.

⚠️ **Dos hallazgos colaterales que corrigen otras partidas:**
- **19 de 19 gacetas sorteadas, hasta 2001, tienen capa de texto nativa.** `congreso.json` afirmaba que «las gacetas antiguas son PDFs escaneados y necesitan OCR»; en 19 sorteos no salió ninguna. **El presupuesto de OCR de la Fase 1 estaba sobredimensionado** — con la reserva del 13,3 % de filas que la receta no alcanza y que sesgan hacia lo antiguo.
- **CONPES 4000 sí es un escaneo** (26 caracteres por página, y el más pesado de la muestra). Es evidencia directa de que el router digital-vs-escaneado de §7 funciona con el criterio de caracteres por página, y de que los escaneos existen también en el rango moderno.
- El universo CONPES es **~3.300, no ~4.200**: esa cifra venía de una sonda de límite superior (4220 → 404), no de un conteo.

**Palanca que queda sin evaluar y podría cambiarlo todo:** voyage-4 acepta `output_dtype: binary`, y pgvector indexa `bit` con Hamming. A 256 dims, `bit(256)` ocupa **40 B frente a 520 B** — 13×. El patrón es binario para la pasada ANN gruesa y **rerank exacto sobre el top-N**, y el plan **ya tiene el reranker presupuestado y gratis**. Si sobrevive a la medición del gold set, el cuello de botella pasa a ser el texto en exclusiva y los 45 temas dejan de estar descartados de entrada. Va al bake-off de la Fase 2, **no a la arquitectura por decreto**: la cuantización binaria pierde recall, y en español jurídico eso no está medido.

**Pero el cuello de botella no son los vectores: es el texto.** La otra mitad de los 500 MB no la despacha una lista de conceptos, hay que costearla. Con el supuesto del propio corpus (`texto + tsvector/GIN ≈ 0,5–1× el texto`) y chunking por artículo:

| Texto medio por fragmento | GIN | Texto+índice | + 250 MB de vectores | ¿Cabe en 500 MB? |
|---|---|---|---|---|
| 1,00 KB | 1,0× | 240 MB | 490 MB | sí, al límite |
| 1,25 KB | 1,0× | 300 MB | 550 MB | **no** |
| 1,50 KB | 0,5× | 270 MB | 520 MB | **no** |

El presupuesto real es de **~1,0–1,4 KB de texto por chunk**, y un artículo de ley medio se pasa de eso con facilidad. **Conclusión honesta: el Free no lo limita el embedding sino la prosa jurídica, y no sabremos el techo verdadero hasta medir el tamaño medio de artículo en el corpus real.** Esa medición es un entregable de la Fase 2, y debe hacerse **antes** de comprometer la Fase 4.

**Y esto no es una nota al pie: decide el alcance.** Los 45 temas de §5.5 con backfill completo no caben. El **piloto vertical de la decisión abierta #3** (`salud` + `ia-y-transformacion-digital`) sí. El piloto vertical deja de ser preferencia de producto y pasa a ser **la condición que hace viable el plan Free**. Si Daniel quiere los 45 temas desde el principio, la respuesta correcta es Pro ($25/mes), no un chunking más agresivo.

**Sobre la pausa por inactividad — verificado a medias, y la mitigación ya existía sin saberlo.** La documentación **sí** define el criterio, y no es el que este plan temía: un proyecto Free se considera inactivo si no recibe suficiente «*user database activity*» — **no** tráfico de API. Eso desactiva el miedo concreto («si la métrica fuera la API, un `pg_cron` interno no contaría»), pero **no cierra la duda**: la doc no dice si un `pg_cron` cuenta como *user database activity*, y **este plan no debe apoyarse en que cuente**.

La salida no hay que inventarla, ya está en §7: la ingesta diaria la orquesta un **cron de GitHub Actions**, que se conecta a la base **desde fuera**. Eso es actividad externa inequívoca, todos los días. La pausa deja de ser un riesgo por la arquitectura que el plan ya tenía, no por una inferencia sobre `pg_cron`. Queda como comprobación de 30 segundos en el proyecto nuevo. Y la objeción del especialista tenía dos patas, no una: la pausa **y** los 500 MB — la segunda sigue en pie y es la que manda.

**Reglas duras que se derivan:** el texto completo de las normas va a Storage o a git, **nunca a columna de la DB**; el chunk guarda el fragmento y el puntero. La dimensión Matryoshka es reconfigurable sin cambiar de proveedor, así que pasar a 1024 dims al migrar a Pro es un re-embed, no una migración de arquitectura.

---

## 9. Frontend · ✅ **auditada** (`research/frontend.json` + `refute2-frontend.json` + `docs-frontend-stack.json`)

**Stack verificado (npm `latest` al 2026-08-19, confirmado por dos pasadas independientes):** Next.js **16.3.1** (App Router, con `cacheComponents` y `partialPrefetching` desde el día 1), React **19.2.8**, **TypeScript 7.0.2** (compilador nativo en Go), Node **24 LTS**, Tailwind **4.3.3** + shadcn/ui. AI SDK 7 + AI Elements para el chat con citas. Biome, Vitest, Playwright. Las cuatro versiones son literalmente el tag `latest` de npm hoy: ninguna es inventada.

⚠️ **El paquete de PWA estaba mal, y es el error que más tiempo habría costado.** «Serwist» a secas lleva al implícito equivocado: **`@serwist/next` es un plugin de webpack y NO soporta Turbopack** —su propio código lo dice—, y Turbopack es el bundler por defecto de Next 16. El paquete correcto es **`@serwist/turbopack@9.5.12`** (estable, publicado 2026-07-22), con `import { withSerwist } from "@serwist/turbopack"`. Complemento, no sustituto: `experimental.useOffline` + el hook `useOffline` de `next/offline` mantienen pendientes navegaciones y Server Actions cuando cae la red.

⚠️ **Dos convenciones nuevas que un greenfield debe adoptar de nacimiento** (gratis ahora, migración después): `middleware.ts` **ya no existe** — es `proxy.ts` con `export function proxy(request)`; y `params`/`searchParams` son **asíncronos**, con helper types por ruta (`PageProps<'/norma/[id]'>`). El plan tiene muchas rutas dinámicas. Además `next lint` está eliminado, lo que es coherente con la elección de Biome.

⚠️ **Decisión de producto, no técnica:** en iOS (hasta Safari 26.5) el Web Push **exige la app instalada en pantalla de inicio** y no existe `beforeinstallprompt`. Para un monitor de alertas normativas, el canal principal debe ser **email** (que además es la feature de retención #1 en TheyWorkForYou, GovTrack y BillTrack50), con push como complemento.

⚠️ **Coste: NO es $0, y el bloqueo es de licencia, no de capacidad.** El plan Hobby de Vercel **prohíbe el uso comercial**, y Vercel define «comercial» con una amplitud que alcanza a un proyecto cívico: incluye recibir pago por crear o mantener el sitio, la publicidad y —literalmente— **pedir donaciones**. Un regwatch-co público que acepte donaciones ya no cabe en Hobby. Además el techo real no son las invocaciones sino **Active CPU: 4 CPU-hrs/mes** y 360 GB-hrs de memoria aprovisionada, y esta app hace SSR de resultados de búsqueda más un chat con citas. **Presupuestar en Active CPU, y resolver la cláusula comercial antes de la Fase 5** — queda amarrada a la decisión de monetización (§13.2), igual que la pausa del Free de Supabase.

**El trío UX universal** (presente en todos los comparables vivos): (1) página de proyecto con **timeline de trámite**, (2) **alertas por email** con digest por tema/keyword/congresista, (3) perfil de congresista con autoría y ponencias.

**Superficies infravaloradas que casi nadie ofrece y salen casi gratis:** API JSON pública y aburrida (la XML de Ley Chile sobrevivió 20 años) y un **MCP server** sobre la misma base — la demanda está demostrada: aparecieron tres repos colombianos de MCP para normatividad entre marzo y agosto de 2026, ninguno con datos estructurados de calidad.

---

## 10. Contrato de evidencia v2 (`GOVERNANCE.md`)

Se conserva el de v1 y se le añade lo que la investigación probó necesario:

1. **Tres fechas, no una:** `fecha_del_hecho` ≠ `fecha_de_publicación_oficial` ≠ `fecha_de_captura`. El rezago de Cámara y los 4-7,5 meses de la Corte lo hacen obligatorio.
2. **`derivation` por arista:** `declarado_en_norma` (leído del texto de la norma afectante) vs `parsed_from_text` (inferido de un tercero que la cita). El escéptico pilló al investigador presentando lo segundo como lo primero.
3. **Cobertura por fuente como dato de primera clase y público.** Un verificador de citas sobre corpus incompleto produce veredictos falsos en ambas direcciones. La UI debe distinguir «no está en el corpus (cobertura X%)» de «no existe».
4. **Latencia declarada por fuente en la UI.** «Actualizado a diario» es cierto para el Congreso y la Corte; **no lo es** para la normatividad consolidada. Ajustar la promesa, no inflarla.
5. **Página permanente «qué cubrimos, qué no, y por qué»** — el patrón de HowTheyVote, que declara explícitamente sus lagunas.
6. **Frescura visible por fuente**, con dumps semanales versionados a git como heartbeat auditable.

---

## 11. Roadmap

### Fase 0 — Fundación (semana 1)
Borrar v1 conservando **`GOVERNANCE.md`, `LICENSE`, `PLAN-V2.md` y `research/`** (los dos últimos son este plan y su anexo de procedencia: borrarlos deja la implementación sin encargo ni evidencia).

> ⚠️ **Esta regla no se hace cumplir sola.** Al escribirse, `PLAN-V2.md` y `research/` estaban **sin trackear** en git. Un `git clean -fdx` durante el borrado de v1 se los lleva por delante por mucho que este párrafo diga lo contrario. **Primer comando de la Fase 0: `git add PLAN-V2.md research/ && git commit`** — antes de borrar nada. Monorepo pnpm: `collectors/`, `db/`, `web/`. Esquema declarativo con migraciones (incluido el wrapper `IMMUTABLE` de `unaccent`, sin el cual la tabla de §8.3 no se crea). CI con lint + tests + validación de esquema.

**Cuatro gates antes de escribir un colector**, todos de minutos:
1. ✅ **¿Hay slot Free de verdad? — SÍ, COMPROBADO.** El límite de 2 proyectos es **por cuenta, no por organización**, que era justo el error de la comprobación anterior (miraba solo la organización). Había 1 slot libre y el proyecto `regwatch-co` está creado en `us-east-1`.
2. ✅ **Extensiones y esquema — VERIFICADO en vivo.** Postgres **17.6**; las 7 extensiones (`pgcrypto`, `unaccent`, `vector` 0.8.2, `pg_trgm`, `pg_net`, `pg_cron`, `pgmq`) **creadas**, no solo presentes en catálogo. Los dos esquemas están aplicados y **R1 se comprobó con 8 sondas adversariales: las 7 que debían ser rechazadas lo fueron, y el control positivo entró**. El wrapper `IMMUTABLE` quedó probado en las dos direcciones: sin él, `generation expression is not immutable`. Detalle en `docs/gate2-verificacion.md`.
   - **Hallazgo:** `pg_net` **no admite `ALTER EXTENSION ... SET SCHEMA`**. Hay que crearla ya en `extensions`.
   - **Corrección de orden al propio plan:** el linter marcó **ERROR** de RLS en las 4 tablas. «Auth + RLS» estaba agendado en la Fase 5 y eso llega tarde — una tabla en `public` la expone PostgREST desde que existe. Se hizo en la Fase 0: lectura pública abierta a propósito, **escritura cerrada**, verificado asumiendo el rol `anon`.
3. ✅ **Cuánto pesa el crudo — MEDIDO.** **63,78 GB**, lo que mata Storage (64× el cupo) y git (13× el techo). Eso es lo resuelto. **El destino NO está decidido:** la propuesta es Cloudflare R2 ($0,81/mes, egreso gratis) para el crudo y git para metadatos, pero añade una dependencia de pago y la decide Daniel (§13.6). Detalle en §8.4 y `docs/gate3-medicion-crudo.json`.
4. 📝 **Radicar los derechos de petición de §15.1** (Cámara, Función Pública, DNP). **Los tres escritos están redactados y listos en `legal/peticiones/`**, con el canal de radicación verificado y la cláusula que motiva cada uno citada literalmente. Falta completar los datos personales y radicarlos: es gestión de Daniel, no automatizable. El plazo legal (15 días hábiles) corre en paralelo al desarrollo.

### Fase 1 — Trámite legislativo (semanas 2-4) · *el núcleo*
La auditoría de §6.1 ya se hizo (era la tarea 0 del borrador anterior) y **encareció esta fase**. Alcance corregido:

- ✅ **Colector de Senado — FUNCIONANDO de punta a punta.** `fetch → gate 0 → parse → artefacto validado`, corrido contra la fuente viva el 2026-08-20: **1.694 proyectos** en 5 legislaturas, gate `ok` en las 5, `total_results` cuadrando con las filas recibidas en todas. El artefacto intermedio es deliberado — el patrón de los comparables serios es `scraper → artefacto validado → import`, y **nadie escribe del scraper directo a la base**.
- ✅ **Tabla `proyecto_ley` + importador `artefacto → SQL`.** La fase recolectaba 1.694 proyectos y no tenía dónde ponerlos: el esquema solo modelaba NORMAS. Un proyecto no es una norma (sin Diario Oficial, sin vigencia) y meterlo en `norma` habría roto las restricciones que sostienen R1. Búsqueda en español verificada sobre datos reales: «salud» encuentra SALUD, «compania» encuentra COMPAÑÍA, control negativo vacío.
- ⚠️ **Hallazgo caro del crosswalk, y es de los que no avisan.** `054/23 ACUM 087,095,109` nombra **cuatro** proyectos; los acumulados van sin `/año`, el regex lo exige, y la fila se clasificaba como `declarado` —un 1:1 limpio— con **tres proyectos desaparecidos sin dejar rastro**. No se corrige infiriendo el año compartido: eso es emparejar por parecido con otro nombre. `parseNumero` devuelve ahora `residuo` y la fila va a **revisión humana**, con la regla en la base (`requiere_revision = (estado='desconocido' or cardinality(residuo) > 0)`). Afecta a 2 de 1.694 filas medidas — poco volumen, pero cada una es una relación entre cámaras mal contada.
- ⛔ **Colector de Cámara — BLOQUEADO a propósito.** Sus ToS prohíben el almacenamiento; no se corre contra camara.gov.co hasta que respondan el derecho de petición de `legal/peticiones/`. El código puede escribirse, la ingesta no.
- **Sin scraping de nonce** y **sin worker headless para gacetas** (dos `curl` bastan): las dos cosas salen del presupuesto.
- ✅ **Capa de normalización de estados — HECHA y medida sobre la ventana completa.** No son 77 valores ni los 13 que daban dos legislaturas: son **23 distintos en 1.694 filas** (5 legislaturas, medido el 2026-08-20), que colapsan a **13 canónicos**. Los 10 que faltaban salen casi todos de la legislatura ACTIVA — son estados de trámite en curso, y una legislatura cerrada ya no los enseña. Medir sobre lo cerrado y extrapolar dejaba 81 filas en `desconocido`.
  - ⚠️ **Hallazgo de modelado:** los estados codifican **dos ejes** —etapa y cámara— y el enum canónico solo tiene uno. `SEGUNDO DEBATE EN CÁMARA` dice plenaria *y* Cámara, y cuál de los dos es «el estado» depende de la cámara de ORIGEN del proyecto, que la cadena no dice. Se clasifica por **etapa** y la cámara sale aparte en `camaraMencionada`; colapsar los dos ejes contaría mal en silencio.
- ⚠️ **Crosswalk Senado↔Cámara como work item propio de resolución de entidades, con revisión humana.** Cobertura medida sobre la ventana completa (1.694 filas, 5 legislaturas): **37,1 % declarado + 0,8 % acumulado = 37,9 %**. Ojo con citar el 47,6 %: ese es el de la legislatura CERRADA 2024-2025 y mide otra cosa —una legislatura que ya cruzó— así que el 37,9 % es el número representativo del trabajo real. — no un `JOIN`. Es el cambio de alcance más caro de toda la auditoría: ≥10 variantes de formato por campo, 18,9 % de claves ambiguas, 13,4 % sin reciprocidad. Presupuestarlo del tamaño de la normalización de estados.
- **Ventana multi-legislatura desde el día 1**: ingerir solo la activa rompe el crosswalk (111 de 219 `numero_camara` de una legislatura no existen en el listado de Cámara de esa misma legislatura).
- Backfill por enumeración de `get_detalle_pdly.php?id=` (denso 1..~10.115), **detectando el cuerpo de «no encontrado»**, que llega con HTTP 200.
- ⚠️ **El tope silencioso no era solo de `search_lys`: `search_pdly.php` hace lo mismo, y de una forma que las comprobaciones obvias NO cazan.** Medido el 2026-08-20: el filtro `legislatura` solo se aplica si el parámetro viaja como **form-data**. Con GET en query string, o con cuerpo JSON, la fuente responde 200 con **100 filas sin filtrar** y `total_results: 100` — o sea que el envelope es **coherente consigo mismo mientras miente**, y comparar `total_results` contra las filas recibidas no detecta nada. Cualquier reimplementación con `pg_net`, con `fetch` + `JSON.stringify` o con una query string se traga 100 filas de otra legislatura creyendo que acertó. El colector lleva la guarda `posible-tope-silencioso`.
- Para leyes sancionadas: `search_lys` **ignora `legislatura` en silencio** y topa en 100 filas sin filtro → usar `palabra_clave` amplia o enumerar `get_detalle_lys.php?id=`.
- Censo de congresistas 2026-2030 vía `departamentosInfo` (1 petición, no 181) → YAML curado en git. Timeline de trámite en la web.
- ⚠️ **El gold set se adelanta a esta fase.** El plan lo agendaba en la Fase 4 pero lo *usaba* en la Fase 2 («el bake-off contra el gold set»), seis semanas antes de existir. No necesita corpus embebido: necesita **preguntas con respuesta anotada contra fuente primaria**, y el trámite legislativo de esta fase ya da material. 30-50 preguntas con negaciones y premisas falsas, preregistradas en el repo.

### Fase 2 — Normatividad y vigencia (semanas 5-8) · *el foso*
Parser de basedoc (HTML **+** JS compañero, HTTP forzado, ISO-8859-1). Grafo de afectaciones con el pipeline lead→norma afectante→cláusula. Backfill del SODA `88h2-dykw`. CONPES completo (~4.200 PDFs, **a git y no a Storage**: superan el 1 GB del Free). Consulta de vigencia a fecha arbitraria.

**Entregable de medición, no de confirmación** (§8.4): tamaño medio de artículo del corpus real, **latencia p95 de `hybrid_search` sobre la instancia Nano con caché pre-calentada**, y el bake-off de embeddings (voyage-4 a 256 vs. 1024, `voyage-context-4`, y cuantización binaria contra el gold set). De ahí sale el techo real de chunks — hoy es una estimación, no un hecho.

### Fase 3 — Jurisprudencia (semanas 9-10)
Backfill de la Corte 2015-2026 (~12 peticiones). Doble registro comunicado/sentencia. Enlace sentencia→norma afectada. Alerta temprana diaria de comunicados.

### Fase 4 — Búsqueda y Q&A (semanas 11-14) · *el producto*
Chunking por artículo. Embeddings voyage-4 a 256 dims, con el presupuesto de **~176k chunks** de §8.4 como techo provisional (§8.4). `hybrid_search` RRF en español, con el wrapper `IMMUTABLE` de `unaccent` ya creado en la Fase 0 y `hnsw.iterative_scan` encendido. Q&A con **bloques `search_result`** y las siete reglas. Exposición del Q&A solo tras superar el gold set.

### Fase 5 — Producto público (semanas 15-18)
PWA completa. **Auth** (RLS ya quedó puesto y verificado en la Fase 0, ver `docs/gate2-verificacion.md`). Alertas por email con digest. API JSON pública. MCP server. Dumps semanales a git.

### Fase 6 — Mapeo electoral (posterior)
OCR de votaciones nominales (Mistral, ~$2/1.000 págs). Indicador de probabilidad de aprobación: **dos regresiones logísticas encadenadas con factores explicables y tasa base publicada** (patrón GovTrack), solo cuando haya ≥1 legislatura completa de datos. Con la tasa base honesta de 12,5% y el predictor autor-Gobierno (7,6x), no con el 23% inflado.

---

## 11 bis. Presupuesto: el que no existía

El plan daba cifras de coste en tres sitios y **no las sumaba en ninguno**, con partidas que no tenían fila en ningún lado. Dos escenarios, con los supuestos escritos:

| Partida | Piloto vertical (Free) | Producto público |
|---|---|---|
| IA — ingesta (~200 docs/día, Haiku + Batch + caching) | ~$48 | ~$48 |
| IA — Q&A con citas (Sonnet 5 + Citations) | ~$12 | ~$12-40 según uso |
| Embeddings + rerank (voyage) | **$0** (200M gratis, dos bolsas separadas) | ~$0-5 |
| Base de datos | **$0** (Free) | **$25** (Pro) |
| Almacenamiento del crudo — **63,78 GB medidos**, +7 GB/año | **$0,81** (R2, *propuesto* §13.6) | ~$0,90 y subiendo |
| Egress | dentro de 5 GB | **por dimensionar** (PWA + API + MCP + dumps) |
| Hosting web | ⚠️ **$0 solo si no hay donaciones** — Hobby prohíbe uso comercial | **Pro de Vercel** si hay cualquier sostenimiento |
| OCR del backfill | ~$100 *one-time* | idem |
| **Total mensual conocido** | **~$60** + lo por medir | **~$85-120** + lo por medir |

**Dos partidas siguen sin cifra a propósito**, porque estimarlas a ojo sería justo el error que este plan combate: el almacenamiento del crudo y el egress. Las dos se miden en la Fase 0 y la Fase 2 respectivamente, y hasta entonces el total es un piso, no un techo.

### El presupuesto que el plan ignoraba por completo: horas humanas

La palabra «horas» no aparecía ni una vez en el documento, mientras se comprometía trabajo humano recurrente en cuatro frentes:

| Frente | Carga | Consecuencia si no se atiende |
|---|---|---|
| **Crosswalk Senado↔Cámara** (18,9 % ambiguo) | Adjudicación manual continua | El grafo pierde su arista más visible |
| **YAML de personas y partidos** (§4 lo excluye del scraping a propósito) | Cambios de partido, vacancias, rollover completo en 2030 | El censo envejece en silencio — el fallo que el plan combate en las fuentes |
| **Cola de la capa de validación** (§14) | Revisión de lo vetado | Si nadie la atiende, la capa es teatro |
| **Derechos de petición y su seguimiento** (§15.1) | Radicación y respuesta | Bloquea la Fase 5 |

**Regla:** cada frente declara un **cupo semanal** (N registros de crosswalk adjudicados, M actualizaciones de YAML al mes) y una **métrica de cumplimiento**. Si el porcentaje de cola atendida cae por debajo del umbral durante dos semanas, **eso es una alarma del sistema**, igual que un feed zombie. Con bus factor = 1, el recurso escaso no es el dinero.

---

## 12. Riesgos

| Riesgo | Mitigación |
|---|---|
| **Rediseño de portal** (ya pasó dos veces en 2025-2026, sin redirects) | Fixtures + tests de snapshot por colector; alerta de rotura; caché crudo permite replay |
| **SUIN-Juriscol caído** (no respondió en dos verificaciones) | No está en la ruta crítica: basedoc es la autoridad de vigencia |
| **Staleness silencioso** (mató a la mayoría de comparables) | Frescura por fuente visible en la UI + dumps semanales como heartbeat |
| **500 MB del plan Free** (el especialista recomendó Pro desde el día 1) | Embeddings a 256 dims; texto completo a Storage/git, nunca en columna; techo provisional de ~176k chunks, y el texto —no el vector— como límite real (§8.4). **El piloto vertical no es preferencia: es lo que hace que quepa.** Pro ($25/mes) el día que entren los 45 temas |
| **Copyright de Avance Jurídico** | Notas como leads, nunca registros; solo texto de dominio público. Alcance real de la prohibición: «publicaciones similares **y con fines comerciales**» — los dos calificativos importan, y por eso la decisión #2 de §13 la reabre |
| **Bus factor = 1** | Capa commons abierta desde el día 1 — invita a coadopción de academia y medios |
| **Cambio de legislatura 2030** | Partición por legislatura diseñada como migración desde ahora (mató a NosDéputés) |
| ⚠️ **Crosswalk Senado↔Cámara** (18,9 % ambiguo, 13,4 % sin reciprocidad) | Resolución de entidades con revisión humana, no `JOIN`. Ventana multi-legislatura. Presupuestado como work item propio de la Fase 1 |
| ⚠️ **RAM de 0,5 GB de la instancia Nano** (segundo techo del Free, además del disco) | Índices HNSW parciales por tema; `pg_prewarm`; medir latencia p95 en Nano en la Fase 2 antes de exponer el Q&A |
| ⚠️ **Hobby de Vercel prohíbe uso comercial** (donaciones incluidas) | Decidir antes de la Fase 5, amarrado a §13.2. Presupuestar en **Active CPU** (4 CPU-hrs/mes), no en invocaciones |
| ⚠️ **`robots.txt` que bloquean agentes de IA** (La Silla Vacía excluye `ClaudeBot`/`anthropic-ai`) | Auditoría de `robots.txt` por fuente **antes** de meterla en la canasta, con `onSkippedRequest` como rastro. Una exclusión se acata, no se rodea |
| ⚠️ **El incumbente ya regala vigencia** (free tier de Legis) | El diferencial es el *cruce* con procedencia por arista y la consulta a fecha arbitraria, no el dato de vigencia suelto (§2) |
| **Defensas contra fallos imaginarios** (el nonce que no se valida) | Todo manejo de error debe citar la evidencia de que ese error ocurre. Mantenimiento sin contrapartida también es deuda |
| ⚠️ **Términos de uso que contradicen `robots.txt`** (Cámara, Función Pública, DNP) | Derechos de petición radicados en la **Fase 0**, no en la 5: el plazo corre en paralelo. Corte Constitucional sale limpia y puede adelantarse si alguno se demora (§15.1) |
| ⚠️ **Habeas data de los usuarios propios** (Fase 5) | Política de tratamiento, aviso de privacidad con constancia, canal de reclamos. Aplica en los dos escenarios de monetización (§15.3) |
| ⚠️ **Redistribución masiva sin lista de egreso** | Lista por procedencia exigida **en código** antes de exponer la API, el MCP y los dumps (§15.3) |
| ⚠️ **Presupuesto de atención humana sin declarar** (bus factor = 1) | Cupo semanal por frente y métrica de cumplimiento; cola desatendida = alarma del sistema (§11 bis) |
| ⚠️ **Almacenamiento del crudo sin destino ni cifra** | Gate 3 de la Fase 0: medir sobre muestra de 20 y elegir destino antes del primer colector |

---

## 13. Decisiones abiertas para Daniel

1. **Nombre público y posicionamiento:** ¿regwatch-co sigue, o un nombre en español más legible para audiencia colombiana?
2. **Monetización — y es la decisión con más consecuencias del documento, no una preferencia comercial.** ¿Bien público/portafolio, o producto de pago? Lo que cuelga de esta respuesta, según §15:
   - **Activa la Ley 1480**, que declara ineficaces de pleno derecho las cláusulas de limitación de responsabilidad. Con pago, **el descargo deja de proteger**: si alguien decide con una vigencia errónea, no hay cláusula que valga.
   - **Cambia el alcance de la prohibición de Avance Jurídico**, cuyos dos calificativos incluyen «con fines comerciales».
   - **Saca el proyecto del plan Hobby de Vercel**, que prohíbe el uso comercial — y su definición incluye **pedir donaciones**. No hay término medio: aceptar donaciones ya es salir.
   - **Interactúa con el `ShareAlike`** de la licencia CC BY-SA 4.0 del dataset del DAPRE.
   - Y el hueco de mercado es más estrecho de lo que se creía: Legis Xperta ya ocupa esa banda de precio (§2).
3. **Alcance del piloto — y ojo, que esta decisión ya no es solo de producto:** ¿arrancar con **todos** los temas, o con `salud` + `ia-y-transformacion-digital` como piloto vertical hasta validar el Q&A? La aritmética de §8.4 la amarra a la infraestructura: los 45 temas con backfill **no caben** en el plan Free ni con la cifra más optimista de §8.4. Piloto vertical → Free viable. Todos los temas desde el principio → Pro ($25/mes) desde la Fase 4. (Recomendación: piloto vertical; además es lo que hace posible un gold set honesto.)
4. **~~Correr el crítico de completitud y los refutadores que faltan.~~ HECHO.** Las 13 especialidades están auditadas (§cabecera), el crítico de completitud corrió y el dictamen legal está en §15. Lo que queda de esta decisión es cuánto de lo que encontraron se acepta.
5. **Hobby de Vercel y la cláusula de uso no comercial:** si regwatch-co acepta donaciones o cualquier forma de sostenimiento, **sale de Hobby**. Decidir antes de la Fase 5 y en bloque con la #2, porque las dos responden a la misma pregunta.
6. **Dónde vive el crudo — decisión NUEVA que abre el gate 3.** Los 63,78 GB medidos descartan Supabase Storage (64× el cupo) y git (13× el techo); lo que queda es almacenamiento externo. La recomendación es **Cloudflare R2** ($0,81/mes, y la propiedad que decide no es el precio sino el **egreso gratis**: cada re-verificación de evidencia lee el crudo). Pero es **una cuenta nueva y una factura recurrente**, así que se decide en bloque con la #2: si el proyecto no se monetiza, ese dólar sale del bolsillo de Daniel. La alternativa es no archivar el crudo — y eso **rompe el contrato de evidencia**, que es lo que distingue a este proyecto de las compilaciones que ya existen. Se paga el dólar o se rompe el contrato; no hay tercera vía honesta.
7. **Qué hacer con La Silla Vacía**, que bloquea agentes de IA en su `robots.txt` y era la fuente #1 de la canasta. La recomendación es acatarlo y sacarla de la ingesta automatizada; la alternativa honesta sería pedirles permiso explícito, que es una gestión humana, no técnica.

---

## 14. La capa de agentes de validación

Tres diseños compitieron (`research/wf2-diseno-*.json`), un escéptico los atacó (21 hallazgos, 5 bloqueantes) y dos jueces coincidieron. **Gana `determinista-primero`**, con el `careo` del diseño 2 injertado entero y tres piezas del 3: ráfaga retroactiva, breaker de fuente y backfill perezoso.

La tesis: **de los siete modos de fallo medidos, ninguno necesita un LLM para detectarse.** Los modelos no validan: proponen candidatos que el código verifica. De ahí la respuesta a «el consenso entre LLMs es complacencia correlacionada» — **el acuerdo entre un productor y el escéptico no genera ninguna señal**: no sube tier, no marca «verificado», no llega a la UI. Solo el desacuerdo tiene efecto: un consenso que no compra nada no engaña a nadie.

**Doce componentes:** nueve de código y coste $0 (`g0-contrato`, `g1-rendimiento`, `g2-pulso`, `g3-invariantes`, `g4-corpus-cerrado`, `g5-careo`, `g6-permanencia` y el `canario` en sus dos deberes), tres productores con LLM (`clasificador`, `extractor`, `vinculador`) y el `refutador`. La salida de los LLM **vuelve a entrar por `g3` y `g4`**. Que nueve no consuman atención cuando todo va bien es lo que hace la capa operable por una persona.

### 14.1 Los siete modos y quién los atrapa

| # | Modo (evidencia medida) | Quién | Regla |
|---|---|---|---|
| 1 | Feed zombie (W Radio: 200 + XML congelado desde oct-2025) | `g2` | `max(fecha_del_hecho)` vs. cadencia derivada del p95 de 90 días; nunca el status |
| 2 | Éxito falso (Corte `maxprov=10001` → 200 + HTML) | `g0` | content-type + `JSON.parse` |
| 3 | Parser roto (Cámara `div.profile-card` → cero filas) | `g0`+`g1` | Sonda **ausente** = parser roto → cuarentena; **cambiada** = la fuente se actualizó → re-baseline, nunca bloqueo. Caída >30 pp de llenado = incidente |
| 4 | Fuente podrida (Gestor `i=53646`, sin refrescar desde 2015-12-01) | `g2` | `fuente_actualizada_en` por registro → `tier_maximo_autorizado` |
| 5 | OCR degradado (DAPRE: «Galopa»/«Galapa») | `g4`+`g5` | Gazetteer DANE (**detecta, nunca corrige**) + distancia de edición PDF↔HTML |
| 6 | Procedencia falsificada | `g3` | Autoidentificación → subcadena → confinamiento (§14.2) |
| 7 | **Defensa contra fallo imaginario** (`_ajax_nonce`, `refute2-congreso.json`) | `canario` | Cada rama de error cita la evidencia de que ese error ocurre. **0 ejecuciones en 180 días + evidencia caducada ⇒ CI falla, y el arreglo por defecto es BORRARLA** |

### 14.2 Las cinco correcciones bloqueantes

**(1) `fecha_efecto` la escribía un LLM** y de ella salía `vigente_hasta` — R1 violada en sustancia. Ahora el modelo devuelve un **enum de fórmula** (`inmediata|publicacion|dias:N|meses:N|fecha_explicita`) y su span, y **la fecha la calcula el código** desde el Diario Oficial; sin eso la arista no cierra intervalo. **(2) El gate de tamaño `[p05,p95]` se autodesactivaba**: con ~20 fuentes, P(≥1 bloqueo falso al día) = 1 − 0,9²⁰ = **87,8 %**. Pasa a umbral **absoluto de una cara** (cascarón SPA de 8.607 B vs. ~83.174 B de basedoc); el resto alerta. **(3) Nadie comprobaba que los bytes capturados FUERAN esa norma** — el caso real: se leyó el Decreto 780 de 2016, que **cita** la Ley 153 de 1887. Tres aserciones en orden: **autoidentificación** del encabezado → **subcadena contra los bytes crudos**, contrato `decode→NFC→compare` → **confinamiento del span** a la subsección derogatoria. **(4) Se le pedían offsets a un modelo que no cuenta caracteres**: devuelve `texto_soporte` verbatim y el código busca la subcadena, y así el `strcmp` **caza la paráfrasis**. **(5) Cobertura prometida sin volumen medido**: se **mide primero** el volumen semanal de aristas que cierran intervalo, y solo entonces se elige entre cobertura total o **muestral con su tamaño declarado**.

### 14.3 El escéptico (`refutador`)

**Poder asimétrico:** degrada y **nunca aprueba ni levanta una cuarentena**. Segundo poder, el más valioso: **hallazgo contra una REGLA** —«esta clase de error existe y ningún gate la cubre»— que se convierte en gate; un escéptico bien diseñado se quita trabajo a sí mismo. Tercero: **breaker de fuente** con ráfaga retroactiva de ≤500 registros hasta la última corrida buena; esos quedan `no_confirmado` y **esa marca no caduca**, el breaker sí — a los 14 días sin acción humana la celda pasa a hueco de cobertura declarado. Todo veto exige **artefacto reproducible**, con cupo de **20/semana**.

**Dos llamadas, y la primera es ciega de verdad:** bytes crudos y la afirmación, **sin** el log de gates — un modelo lee el prompt entero antes de generar, así que una sola llamada «ciega» no lo es. La segunda, solo sobre desacuerdos, pregunta «¿qué gate debería haber cazado esto?». **Y con honestidad: Haiku y Sonnet no son familias distintas**; la descorrelación aquí es de **procedimiento**, y un juez de otro proveedor queda como opción declarada y no adoptada.

**Que no está dormido no se mide por su tasa de veto** (un 0 % puede ser un escéptico muerto o un corpus limpio), sino por su recall sobre semillas de **juicio** corrupto en ventana móvil de 4–6 semanas con **n≥30** —a n=5, uno con recall real del 60 % pasa el 33,7 % de las semanas—, más adjudicación humana y **tasa de vetos atendidos**. Recall <0,80 ⇒ sus veredictos no se aplican: **puede ser vetado por su propia métrica.**

### 14.4 Coste

Supuestos: 200 docs/día · **4 chunks/documento** (a medir en la Fase 2) · Haiku $1/$5, Sonnet 5 **$3/$15 de lista**, Opus 5 $5/$25 · Batch −50 %, sin caché. (El precio de lista de Sonnet 5 es el corregido en §8.2: el introductorio vence el **2026-08-31**.)

| Componente | Aritmética | USD/mes |
|---|---|---|
| Los nueve de código | — | **$0** |
| `clasificador` | 24.000 chunks × (2k/300) = 48M×$1 + 7,2M×$5, −50 % | $42,0 |
| `extractor` | 900 docs con señal × (6k/800), −50 % | $4,5 |
| `vinculador` | 1.000 × (3k/300), −50 % | $2,3 |
| Escalada por regla | 10 % del extractor · Sonnet Batch | $1,4 |
| Turno A | **`n_semanal × 4,33 × $0,046`** | $11,9 a n=60 |
| Turno B | 4/año × (400k/30k) · Opus 5 | $0,9 |

**Los $48,8 de los productores no son dinero nuevo: son la línea de ingesta que §8.2 ya presupuesta en $48/mes**, recalculada por chunk en vez de por documento. La coincidencia tranquiliza pero **no verifica nada**: las dos descansan en el mismo supuesto sin medir (a 6 chunks/documento el clasificador sube a ~$63 y la reconciliación se rompe). **El turno A va como fórmula a propósito**, porque su `n` sale de una medición que no existe: a n=200 son $39,8/mes. Lo nuevo sobre §8.2 es **$14,2/mes a n=60** y **$42 a n=200**.

**Backfill:** gratis en los gates y `careo`, y a $0,00175/chunk en el clasificador, sale **~$81 en el piloto y ~$228 completo** — la línea de ~$100 de §7 aguanta lo primero y no lo segundo.

### 14.5 Medición

**Ninguna cifra de §14 es un resultado medido**: son objetivos de diseño, y no se publica afirmación de eficacia hasta que el gold set corra. **Prohibido «datos validados» a secas.** El gold set son 7 familias × 40 = **280 registros con error inyectado** (mutados desde registros buenos, así que se regeneran con el corpus), **60 controles negativos** y un **conjunto retenido** que el generador nunca ve: los siete incidentes reales de `research/`.

| Métrica (por modo, nunca agregada) | Umbral |
|---|---|
| Recall de detección | ≥95 % **en cada uno** de los siete |
| Tasa de bloqueo falso (60 controles) | ≤1 % de corridas |
| Recall del pre-paso de señales | ≥95 % sobre 200 normas anotadas |
| Recall del escéptico sobre semillas | ≥0,80 · 4–6 semanas · n≥30 |
| **Obtenibilidad de la norma afectante** | sin umbral: **entregable de la Fase 2** |

La última es la más incómoda: si la norma afectante resulta poco descargable —la Ley 153 de 1887 fue infetchable en campo—, el problema no es de gates sino de alcance del corpus, y **cada degradación sería individualmente correcta** mientras el producto responde «vigencia no confirmada». Ningún gate estadístico ni `careo` bloquea antes de **4 semanas de modo sombra**, con recalibración trimestral. Y esta capa **no puede prometer que los datos sean ciertos**: si la fuente publica un dato equivocado, ningún gate lo ve.

### 14.6 Riesgos declarados

| Riesgo | Mitigación / residuo |
|---|---|
| **Las ausencias son el agujero estructural**: 29 de los 44 hallazgos adversariales fueron fuentes que nadie consideró | Solo el turno B, 4 veces al año: entre trimestres el sistema es ciego a lo que no sabe que existe |
| **El pre-paso de señales del extractor es un fallo silencioso de cosecha propia**: una derogatoria sin sus verbos nunca llega al LLM | Recall publicado, umbral de abandono (95 %) fijado **por adelantado** |
| **El LLM puede tipificar mal una arista** sin violar ninguna aserción, y los campos `confidence` de §5.1 pueden acabar en la UI | Muestreo del escéptico; y esos campos quedan internos, con un test de UI que lo hace cumplir |
| **Bus factor 1**: si Daniel deja de adjudicar, la precisión del escéptico no falla — **desaparece** | La tasa de vetos atendidos lo vuelve medible; si la cola crece dos meses, se recorta **el muestreo, nunca los gates** |
| **Reparación del parser con una sola persona** | Fuente bloqueada **14 días** ⇒ hueco de cobertura en §10.5, y deja de contar como cubierta |
| **Retractación**: el sistema puede degradar un registro que ya salió por email o citado en una respuesta | Se guarda a quién se envió qué, y R2 ya obliga a guardar los `chunk_id`: invalidar respuestas es un `JOIN`. Residuo: quien lo leyó y actuó no vuelve |

---

## 15. Dictamen legal · ✅ **auditoría propia** (`research/wf3-auditor-legal.json`)

**Veredicto: el proyecto es publicable, pero no como estaba planeado.** Cuatro cosas impiden publicar hoy, y había una premisa equivocada en el corazón del análisis legal.

### 15.1 El punto ciego: los términos de uso

Toda la evidencia legal acumulada miraba `robots.txt` **y solo `robots.txt`**. Tres de los siete portales que el plan raspa publican **términos de uso** con cláusulas expresas —aceptadas por navegación— que `robots.txt` contradice o no refleja:

| Portal | `robots.txt` | Términos de uso | Afecta a |
|---|---|---|---|
| **camara.gov.co** | Permisivo, con `Allow` explícito de `admin-ajax.php` | ⚠️ Prohíbe «reproducción total o parcial… **almacenamiento**… sin autorización previa y escrita». Única excepción: «uso personal y no comercial» | **Fase 1 entera** |
| **funcionpublica.gov.co** | `Disallow:` vacío — todo permitido | ⚠️ Prohíbe «ningún mecanismo… proceso manual o automático para capturar, monitorizar… o copiar el Portal Web… sin consentimiento por escrito» | Grafo de afectaciones (Fase 2) |
| **dnp.gov.co** | Permisivo | ⚠️ Prohíbe «robots o spiders para copiar o monitorizar el contenido… sin autorización previa y por escrito». La prohibición de *scraping* **no** está condicionada a comercialidad; la de republicación sí | CONPES (~4.200 PDFs) |
| **senado.gov.co** | Permisivo | Más benigno: su cláusula tiene una válvula que la de la Cámara no tiene — «*o ello resulte legalmente permitido*» | Fase 1 |
| **corteconstitucional.gov.co** | Permisivo | **Sale limpia en los tres ejes** (robots, ToS y derechos de autor) | Fase 3 |

**Las tres prohibiciones se resuelven con derechos de petición: son gratuitos, tienen plazo legal de respuesta y dejan rastro auditable** — que es exactamente el estándar que este proyecto predica. Radicarlos es trabajo de la Fase 0, no de la Fase 5, porque el plazo de respuesta corre en paralelo al desarrollo.

**Consecuencia de secuenciación:** la Corte Constitucional es la única fuente que sale limpia en los tres ejes. Eso es un argumento para **adelantar la Fase 3** si alguna petición se demora.

### 15.2 La premisa que había que corregir

**La Ley 1712 de 2014 no ampara el scraping.** Conviene decirlo antes de que el plan se apoye en ella. Lo que sí hace, en tres piezas distintas:

1. **Confirma que regwatch-co NO es sujeto obligado** (art. 5, parágrafo 1: excluye a los privados usuarios de información pública).
2. **Obliga al Estado a publicar proactivamente**, incluido el directorio con correos institucionales.
3. **Define datos abiertos como reutilizables** «sin restricciones… para crear servicios derivados» (art. 6 lit. j).

Pero **no crea ningún derecho a un método de acceso**: no hay un solo artículo sobre acceso automatizado. Los arts. 6 lit. j y 11 lit. k sirven como **argumento contra** las cláusulas restrictivas de ToS en los derechos de petición — es una posición que hay que sostener y documentar, no un amparo automático. Escribir lo contrario debilitaría todo lo demás.

### 15.3 Los cuatro bloqueantes

**1. El ToS de la Cámara** (§15.1), que sostiene la Fase 1.

**2. La contradicción sobre Avance Jurídico** — ya resuelta en §5.2: se persiste **el hecho, nunca la prosa**. El aviso del editor es una declaración unilateral, no una licencia.

**3. Ley 1581 respecto de los PROPIOS usuarios.** El plan abre cuentas y colaboración (Fase 5) y no menciona ni una obligación de habeas data sobre sus usuarios registrados. Tratar sus correos, nombres y actividad convierte al proyecto en **Responsable del Tratamiento**, con deberes exigibles ante la SIC, **en los dos escenarios de monetización**. Work item propio de la Fase 5, con el mismo estatus que el gold set: (a) Política de Tratamiento publicada; (b) aviso de privacidad y autorización en el *signup*, con constancia consultable; (c) canal y procedimiento de consultas y reclamos. **No** hace falta inscribir nada en el RNBD: el Decreto 90 de 2018 dejó fuera a las personas naturales.

**4. La Fase 5 no define qué sale.** «API JSON pública» + «dumps semanales a git» + caché de bytes crudos en repo público es **redistribución masiva** — el verbo que aparece en la prohibición de Avance Jurídico («divulgación masiva»), en la del DNP («republicar»), en la de la Cámara («reproducción total o parcial») y en el tipo penal del art. 269F. **Lista de egreso por procedencia, exigida en código antes de exponer la API:**

| Sale | No sale |
|---|---|
| Texto normativo oficial (Ley 23/1982 art. 41) con su número de Diario Oficial | Prosa editorial de terceros, en ningún volumen |
| Hechos y metadatos de trámite, jurisprudencia y afectaciones, con URL y `captured_at` | Cuerpo completo de prensa (solo título, medio, fecha, URL y snippet corto con atribución) |
| Censo de congresistas: nombre, partido, comisión | ⚠️ **El campo `correo`, en bloque** — ver §15.4 |

### 15.4 Datos de congresistas: dos matices finos

**Los 181 correos institucionales SÍ se pueden almacenar y usar** (la Ley 1712 obliga al Estado a publicarlos; el Decreto 1377 califica como público el dato relativo a la calidad de servidor público). Lo que **no** se puede es volcarlos en bloque. **Regla de egreso:** el campo `correo` se almacena y se muestra en la ficha de **un** congresista; **nunca** aparece en los dumps semanales, ni en respuestas en bloque de la API, ni en el MCP server. Columna excluida en la vista pública.

⚠️ **El partido político roza la única categoría que la Ley 1581 prohíbe tratar**, y el plan lo captura en 181 de 181 casos sin haberlo notado: el art. 5 lista «la orientación política» entre los **datos sensibles** y el art. 6 prohíbe su tratamiento salvo excepciones. La militancia declarada de un congresista en ejercicio es un hecho público e inseparable de su función —la defensa es sólida— pero **debe quedar razonada por escrito en `GOVERNANCE.md`**, no darse por obvia. Es exactamente el tipo de cosa que nadie mira hasta que alguien pregunta.

### 15.5 Derechos de autor: dos condiciones que son requisitos de diseño

El texto normativo oficial **no es «dominio público» sin más**: el art. 41 de la Ley 23 de 1982 es una **limitación condicionada**. Reproducir leyes, decretos y decisiones judiciales es lícito siempre que se respete el texto y se indique la fuente. Las dos condiciones se traducen en requisitos: **fidelidad literal verificable contra los bytes crudos** (que el contrato de evidencia ya impone) y **cita de origen en toda superficie de salida**, incluidos la API y el MCP server.

En **prensa** el límite real no es el derecho de autor sino `robots.txt` y los ToS de los medios — el plan lo tenía invertido. La Ley 23 es generosa: el art. 34 hace lícita la reproducción de «noticias u otras informaciones relativas a hechos o sucesos» ya difundidos, y el art. 31 permite la cita con atribución. Lo que muerde es la exclusión de agentes de IA (§6.4).

### 15.6 Responsabilidad: el descargo que sirve y el que no

⚠️ **En el escenario de pago, el descargo no sirve.** La Ley 1480 declara **ineficaces de pleno derecho** las cláusulas que limitan la responsabilidad del proveedor, y sus normas son de orden público. Monetizar **activa** la Ley 1480 y **desactiva** el descargo: si alguien paga y decide con una vigencia errónea, no hay cláusula que proteja. Va amarrado a la decisión §13.2.

El descargo que sí hace falta —en los dos escenarios— **no es una exención, es una declaración de alcance más un mecanismo de rectificación**, porque la Constitución garantiza el derecho a información veraz y a la rectificación en equidad, y la Ley 1581 obliga a que la información sea veraz, completa, exacta y actualizada. Cinco elementos:

1. «regwatch-co es una herramienta de consulta e investigación; **no es asesoría jurídica** ni sustituye la verificación en la fuente oficial.»
2. Cómo se deriva la vigencia (grafo de afectaciones sobre fuentes primarias) **y qué latencia tiene cada fuente**.
3. La fecha de captura visible en cada afirmación — que §10 ya exige.
4. **Un canal de rectificación** con plazo de respuesta declarado.
5. El registro público de correcciones: si el sistema se equivoca, se ve que se corrigió y cuándo.

> **Nota de vigencia sobre este propio dictamen:** el marco de datos personales está en cola de reforma —hay un proyecto de ley estatutaria radicado en agosto de 2025—. Es la clase de cosa que regwatch-co debería monitorear con su propio producto, y un buen primer caso de prueba.

---

## Anexo · Procedencia de este plan

13 investigaciones especializadas con verificación en vivo, **12 auditorías adversariales** en dos rondas y **4 verificaciones contra documentación viva**, entre el 2026-08-16 y el 2026-08-19. En total **249 veredictos: 127 confirmados, 76 corregidos en parte, 37 refutados y 9 no verificables**, más el panel de tres diseños que produjo §14. ~6,9M tokens de subagentes y ~2.700 llamadas a herramientas. Informes crudos en `research/*.json`.

A eso se añaden **tres auditorías sobre el propio plan** —un verificador de sus cifras, un crítico de completitud y un auditor legal— y un **panel de tres diseños** con dos jueces y un escéptico para §14.

**El 15 % de lo investigado resultó falso.** No es un accidente del método: es el método. Un plan de esta escala escrito sin adversario habría entrado en implementación con el crosswalk dado por resuelto, un worker headless de más, el paquete de PWA equivocado, una fuente de prensa que prohíbe el scraping, un manejo de rotación de nonce para un error que no existe, y tres portales cuyos términos de uso prohíben lo que el plan hace.

**Y el documento se auditó a sí mismo con el mismo rasero, que es la parte que más corrigió:**

| Lo que este plan se equivocó sobre sí mismo | Cómo se encontró |
|---|---|
| «12 correcciones» — una cifra que no salía de ningún agregado | Recuento del campo `verdict` |
| Una inferencia sobre la pausa del Free, escrita en negrita como si corrigiera a un especialista | Búsqueda del criterio en el corpus: no estaba |
| El ratio del índice HNSW extrapolado **en la dirección contraria** | Medición a 256 vs. 1024 dims |
| La división de §8.4 **no rehecha** tras corregir su propia tabla — tres veces (300k → 120k → 114k → 176k) | El crítico comparó la tabla con su conclusión |
| `fecha_efecto` sin productor declarado, del que cuelga R1 entera | Cruce del `SELECT` de §5.2 con la asignación de §8.2 |
| Referencias a §14 y §15 cuando ninguna de las dos existía | `grep '^## '` |
| §13.4 declarada «HECHO» antes de que el informe que la cerraba existiera | El propio informe |

Ninguna de las siete la encontró un especialista: todas salieron de cruzar el documento consigo mismo. **Es el argumento de este plan aplicado a este plan** — y la razón de que §14 exista como capa permanente y no como una revisión más.

Este documento pasó además por un verificador adversarial propio, que **refutó cuatro cifras de un borrador anterior**: un recuento de correcciones que no salía de ningún agregado del corpus, una inferencia sobre la pausa del plan Free presentada como hecho, una celda de la tabla de §8.4 que se contradecía a sí misma, y un «extremo prudente» que era el extremo optimista. Están corregidas arriba; se dejan enunciadas aquí porque un plan que exige procedencia declarada debe declarar también la suya.

Las auditorías adversariales **refutaron 15 afirmaciones y corrigieron 12 más**, incluyendo cuatro que habrían costado días: el directorio de la Cámara que devolvía cero filas, el techo silencioso de la API de la Corte, la frescura de basedoc subestimada, y la podredumbre del Gestor Normativo. Ese proceso —investigar, luego intentar refutar— es el mismo que el producto aplica a sus propios datos.
