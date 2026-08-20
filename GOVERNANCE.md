# Contrato de evidencia

Este documento es la parte importante del proyecto. El código solo lo hace cumplir.

Un monitor normativo tiene un modo de fallo particular: no se rompe, **se equivoca
en silencio**. Sirve una fecha que nadie verificó, presenta una nota de prensa
como si fuera un acto administrativo, o dice «vigente» sobre una norma que una
sentencia tumbó. El resultado se ve igual de ordenado que el correcto.

Por eso las reglas de abajo **no viven en la buena voluntad de quien captura**:
están en constraints de Postgres, en tipos de TypeScript y en tests que fallan.
Cada sección dice dónde.

> **Versión 2** (2026-08-20). La v1 de este documento describía un código que ya
> no existe (`lib/record.mjs`, `bin/verify.mjs`, `data/seed.jsonl`, la TUI). Los
> principios se conservan; las referencias de cumplimiento apuntan ahora al
> código real.

---

## 1. Nada entra sin fuente checkeable

Todo registro lleva `url_fuente` con una URL que un tercero pueda abrir, y
`captured_at` con la fecha de captura. No se acepta «visto en un boletín»,
«según el portal» ni una ruta a un archivo local.

La fecha de captura importa tanto como la URL: los portales oficiales
colombianos se reestructuran, y un enlace que hoy resuelve puede no resolver en
seis meses. `captured_at` dice cuándo era cierto lo que el registro afirma.

**Cómo se hace cumplir:** el dominio `url_fuente` de Postgres rechaza cualquier
cosa que no sea `http(s)`; `captured_at` es `not null` en las cinco tablas de
hechos. `collectors/src/evidence.ts` lo replica en los tipos.

## 2. Jerarquía probatoria, y no se puede subir

| Tier | Qué es | Qué autoriza |
|---|---|---|
| `primaria` | El acto mismo: el texto en el Diario Oficial, el PDF del CONPES, la gaceta del Congreso, la sentencia en la relatoría | Afirmar contenido y vigencia |
| `institucional` | La entidad hablando de su propio trabajo; y **las notas de vigencia de un compilador privado** | Afirmar agenda e intención. **No** vigencia |
| `secundaria` | Prensa, análisis, agregadores | Señalar que algo existe, para ir a buscar la primaria |

**`vigente` exige `primaria`.** Un comunicado no declara vigencia, y una nota
editorial tampoco — por muy bien informada que esté.

**Cómo se hace cumplir:** `afectacion_vigencia_exige_primaria` en
`db/schemas/02_vigencia.sql`. Una fila con `derivation = 'declarado_en_norma'` y
`tier` distinto de `primaria` no entra en la base. Comprobado con sondas
adversariales contra la instancia real (`docs/gate2-verificacion.md`).

## 3. La vigencia nunca sale del modelo (R1)

Es la regla que define el proyecto. `vigente` **no es un booleano**: es una
función del tiempo sobre un grafo de afectaciones tipadas.

Una fecha de efecto solo puede venir de tres sitios, y el enum
`derivation_fecha` los enumera:

- `declarada_en_texto` — la cláusula da la fecha explícita.
- `derivada_deterministicamente` — regla computable + Diario Oficial. Aritmética.
- `no_determinable` — la cláusula no fija fecha o la condiciona.

**`no_determinable` no es un fallo: es la respuesta correcta.** Es lo que
devuelve `consultar_vigencia()` cuando consta la afectación pero su fecha exige
interpretar la norma, y decirlo es preferible a estimarla.

**Cómo se hace cumplir:** tres constraints en `afectacion`
(`fecha_con_procedencia`, `regla_escrita`, `vigencia_exige_primaria`) más
`reglaEsDeterminista()` en `collectors/src/senado/articulado.ts`, que solo
devuelve `true` cuando la regla ata la vigencia a la publicación.

## 4. Una nota de un tercero es un LEAD, no una afectación

Lo que Avance Jurídico dice sobre una norma **no es lo que la norma dice de sí
misma**. Para escribir una afectación hay que ir a la norma AFECTANTE y leer su
cláusula; la nota solo dice a qué norma ir.

**Cómo se hace cumplir:** el tipo `Lead` de `collectors/src/senado/basedoc.ts`
no tiene ningún campo donde quepa la prosa del editor, y un test lo comprueba
serializando el objeto y mirando el conjunto de claves.

**Y por la puerta de atrás también, que es por donde entró.** El 2026-08-20 esta
regla se estaba incumpliendo sin que ningún test se enterara: `partirArticulos`
aplanaba el HTML entero, así que los rótulos del editor y el pie de copyright de
Avance Jurídico acababan DENTRO del texto de los artículos —**21 de 37 chunks de
la Ley 1616 de 2013**, con 1.190 caracteres del aviso de derechos dentro del
artículo 36A—. La tabla `chunk` es de lectura pública, así que eso se habría
republicado. El tipo `Lead` estaba impecable y la regla se violaba igual, en otro
módulo.

Segundo punto de aplicación, entonces: `soloArticulado()` en
`collectors/src/senado/articulado.ts` corta por las fronteras que el propio
documento marca (`<!--Fin documento-->`, `<div id="logo_aj">`, las anclas y
tablas `caja_*`), y `run-articulado.ts` recuenta los marcadores editoriales en
cada corrida para avisar si la fuente cambia de marcado y el saneador deja de
morder. `db/load-chunks.ts` **rechaza** cargar un artefacto con contaminación.
Los tests cubren las dos mitades: que el aparato no entre, y que el articulado
no se pierda.

## 5. La incertidumbre se declara, no se rellena

Un estado desconocido va a `desconocido` y a una cola de revisión humana; **no
se adivina por parecido**. Un número de proyecto que la fuente nombra y el
parser no supo leer se guarda como residuo, no se descarta.

**Cómo se hace cumplir:** `proyecto_revision_cubre_ambos_ejes` obliga a que
`requiere_revision` sea exactamente `estado = 'desconocido' or residuo != {}`.
Es un `=`, no un `or`: marcar de más también miente.

## 6. Citar exige que la cita resuelva (R2)

Toda frase de una respuesta generada tiene que apuntar a un `chunk_id` que
existe **y que entró en el contexto**. La frase sin cita válida **se elimina** —
no se marca, no se degrada a «según nuestra información».

Una cita a un chunk inexistente se reporta como señal de alucinación: es el
fallo más caro, porque parece verificable. Y por debajo del 80 % de frases
supervivientes no se publica la respuesta entera: una respuesta con agujeros no
es «un poco peor», y los agujeros no se ven.

**Cómo se hace cumplir:** `collectors/src/rag/citas.ts`, con tests.

## 7. Recolección respetuosa

Los portales oficiales colombianos son infraestructura pública con presupuesto
limitado. Todo recolector respeta `robots.txt`, se identifica con un User-Agent
honesto que incluye la URL del repositorio, y espacia sus peticiones.

**La Silla Vacía excluye a ClaudeBot y anthropic-ai en su `robots.txt`. Se
acata.** No se rodea, no se cambia el User-Agent, no se busca un proxy. Está
declarado en el mapa `EXCLUIDAS` de `collectors/src/sources.ts`, donde figurar
*es* la decisión.

Donde los términos de uso exigen autorización previa y por escrito, **no se
recolecta hasta tenerla**: es el caso de la Cámara de Representantes, la Función
Pública y el DNP. Los derechos de petición están redactados en
`legal/peticiones/`.

**Cómo se hace cumplir:** `USER_AGENT` y `CORTESIA_MS` en
`collectors/src/http.ts`; el colector de Cámara lleva una guarda que se niega a
ejecutarse mientras la petición no esté respondida.

## 8. Qué sale del sistema

Publicar es distinto de almacenar, y la legalidad de un dato depende del
**contexto** en que sale, no solo del campo.

| Sale | No sale |
|---|---|
| Texto normativo oficial, con su Diario Oficial y sin alterar | Prosa editorial de terceros, **en ningún volumen** |
| Hechos y metadatos, con `url_fuente` y `captured_at` | Cuerpo completo de prensa (solo título, medio, fecha, URL y extracto ≤300 caracteres con atribución) |
| Correo institucional de un congresista **en su ficha** | El campo `correo` **en bloque**: ni API, ni dumps, ni MCP |

**Cómo se hace cumplir:** `collectors/src/egreso/politica.ts`, por **lista
blanca**. Un campo sin procedencia declarada no sale. Con lista negra, un campo
nuevo saldría por defecto y nadie se enteraría hasta que ya hubiera salido.

### 8.1 El texto normativo no es «dominio público sin más»

El artículo 41 de la Ley 23 de 1982 es una **limitación condicionada**, no una
renuncia. Reproducir leyes y sentencias exige conservar el texto sin alterar y
acompañarlo de su referencia oficial. Por eso el veredicto de egreso para
`normativo_oficial` sale **con condiciones**, no a secas.

### 8.2 Datos de suscriptores: no salen, y los temas tampoco

La primera tabla del proyecto con datos personales de verdad es `suscripcion`.
Hasta ella, el corpus era información pública del Estado.

El correo se da voluntariamente, pero eso no lo convierte en publicable: la Ley
1581 ata el tratamiento a la **finalidad** (art. 4), y la finalidad aquí es
enviar un digest. Nada más.

Y **los temas que alguien sigue son tan delicados como el correo**. «A qué
normas le sigo la pista» puede revelar la actividad profesional de una persona,
un litigio en curso o su posición política. Por eso `dato_suscriptor` es una
categoría de egreso propia —distinta de `contacto_servidor_publico`— y **no sale
por ningún canal, ni siquiera en una ficha individual**: la ficha del propio
usuario la sirve RLS, que es otro camino.

Consecuencia en el esquema: `suscripcion` **invierte el criterio de RLS** del
resto del proyecto. No es lectura pública, es propiedad, con las cuatro
políticas escritas una a una en vez de una permisiva — una política «para todo»
es fácil de aflojar sin que se note en el diff. `anon` no tiene ninguna.
Verificado asumiendo los roles: un usuario ve la suya y no la ajena, no puede
editarla, borrarla ni crear una a nombre de otro; `anon` ve cero.

### 8.3 Orientación política: por qué se trata, razonado

**Esta sección existe porque el código la exige.** El veredicto de egreso para
`orientacion_politica` incluye la condición «la justificación tiene que estar
escrita en GOVERNANCE.md», y sin ella la regla sería una afirmación sin respaldo.

El artículo 5 de la Ley 1581 de 2012 lista **la orientación política** entre los
datos sensibles, y el artículo 6 prohíbe su tratamiento salvo excepciones.

La excepción que aplica aquí: **la militancia declarada de un congresista en
ejercicio es un hecho público e inseparable de su función**. No es una
característica privada que el sistema deduzca ni infiera; es información que la
propia persona declara al inscribirse por un partido, que el Estado publica, y
sin la cual no se puede entender su actuación como legislador — que es
exactamente el objeto legítimo de un monitor legislativo.

Los límites que se aceptan con ello, y que no son negociables:

1. **Solo de congresistas en ejercicio**, por su condición de servidores
   públicos. No de ciudadanos, no de candidatos no electos, no de funcionarios
   sin función legislativa.
2. **Nunca como criterio de segmentación ni de perfilado.** El dato describe a
   quien vota una ley; no se usa para clasificar personas ni para construir
   audiencias.
3. **Se toma de la fuente oficial**, no se infiere de votaciones ni de
   declaraciones. Un partido deducido sería un dato sensible **fabricado**, que
   es peor que no tenerlo.

Si alguna vez el proyecto quisiera tratar orientación política fuera de estos
límites, esta sección deja de dar cobertura y hay que rehacer el análisis.

---

## Lo que este proyecto NO es

- **No es asesoría jurídica.** Es un índice con procedencia; la lectura jurídica
  la hace un abogado sobre el texto oficial.
- **No es exhaustivo.** La ausencia de un registro no significa que la norma no
  exista, y `consultar_vigencia()` devolviendo cero filas **no** significa
  «vigente para siempre».
- **No reemplaza el texto oficial.** Todo registro apunta a su fuente
  precisamente para que se lea allá.
