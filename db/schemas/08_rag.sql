-- Chunks y embeddings: dónde aterriza lo que la Fase 4 ya sabe producir.
--
-- `collectors/src/rag/chunking.ts` corta por artículo y emite ids estables;
-- `embeddings.ts` los convierte en vectores de 256 dims re-normalizados. Hasta
-- ahora ninguna de las dos cosas tenía dónde caer: el esquema no conocía la
-- palabra `chunk`. Esa es la razón de que `hybrid_search` no existiera —su
-- mitad semántica no tenía de dónde leer— y no la falta de una clave de API.
--
-- PLAN-V2.md §8.4 y §621.

-- ---------------------------------------------------------------------------
-- El chunk.
--
-- La clave primaria es el id NATURAL de `chunking.ts` (`ley:1616:2013:art:36a`),
-- no un uuid generado. No es una preferencia estética: R2 valida las citas
-- comparando el `source` de cada bloque `search_result` contra un `chunk_id`
-- (`rag/citas.ts`). Si la base generase su propio identificador, la cadena
-- cita→chunk se rompería en el único punto donde tiene que aguantar.
-- ---------------------------------------------------------------------------
create table chunk (
  id          text primary key,
  fuente      origen_resultado not null,

  -- Polimórfico, pero CON integridad referencial: tres FKs y exactamente una
  -- puesta. La alternativa habitual (una columna `entidad_id uuid` suelta)
  -- deja que un chunk apunte a una fila borrada, y entonces una cita válida
  -- resuelve a la nada — que es justo el fallo que R2 existe para impedir.
  norma_id        uuid references norma(id)        on delete cascade,
  providencia_id  uuid references providencia(id)  on delete cascade,
  proyecto_id     uuid references proyecto_ley(id) on delete cascade,

  referencia  text not null,
  texto       text not null,
  caracteres  int  not null,

  -- NULL mientras no haya clave de Voyage. Un NULL honesto: la fila existe,
  -- se puede buscar léxicamente y se sabe que le falta el vector.
  embedding         extensions.vector(256),
  -- Qué modelo lo produjo. Si `embedding` está, esto también: comparar un
  -- vector de voyage-4@256 con la consulta embebida por otro modelo no falla,
  -- devuelve vecinos sin sentido. Un fallo silencioso, que es el peor tipo.
  modelo_embedding  text,

  url_fuente  url_fuente  not null,
  captured_at timestamptz not null,
  tier        tier_evidencia not null,

  constraint chunk_exactamente_una_fuente check (
    (norma_id is not null)::int + (providencia_id is not null)::int
      + (proyecto_id is not null)::int = 1
  ),

  -- `fuente` es por lo que agrupa RRF. Si discrepara de qué FK está puesta,
  -- se fusionarían rankings de cosas distintas y nadie lo vería.
  constraint chunk_fuente_coherente check (
    (fuente = 'norma'        and norma_id       is not null) or
    (fuente = 'providencia'  and providencia_id is not null) or
    (fuente = 'proyecto_ley' and proyecto_id    is not null)
  ),

  constraint chunk_texto_no_vacio check (length(trim(texto)) > 0),
  constraint chunk_embedding_con_modelo check (
    embedding is null or modelo_embedding is not null
  )
);

-- Índice HNSW con producto interno. Es válido SOLO porque `truncarYNormalizar()`
-- re-normaliza tras truncar a 256 dims: con vectores desnormalizados el
-- producto interno premia a los de norma grande y deja de equivaler al coseno
-- (`collectors/src/rag/embeddings.ts` §10-16).
create index chunk_embedding_hnsw
  on chunk using hnsw (embedding extensions.vector_ip_ops);

create index chunk_fuente on chunk (fuente);

-- La consulta de recobro por entidad: qué chunks tiene esta norma.
create index chunk_norma       on chunk (norma_id)       where norma_id       is not null;
create index chunk_providencia on chunk (providencia_id) where providencia_id is not null;
create index chunk_proyecto    on chunk (proyecto_id)    where proyecto_id    is not null;

alter table chunk enable row level security;
create policy "lectura pública" on chunk
  for select to anon, authenticated using (true);

comment on table chunk is
  'Pasajes del corpus con su vector. La PK es el id natural de chunking.ts, no '
  'un uuid: R2 valida cada cita comparando el `source` del bloque search_result '
  'contra este id, y un identificador generado por la base rompería esa cadena.';

comment on column chunk.embedding is
  'vector(256) = voyage-4 truncado y RE-NORMALIZADO. Las 256 dims son un '
  'contrato con DIMS de embeddings.ts; si divergen, el índice HNSW rechaza la '
  'inserción en vez de degradarse en silencio.';

-- ---------------------------------------------------------------------------
-- hybrid_search: la fusión RRF que `busqueda_lexica` llevaba esperando.
--
-- `busqueda_lexica` devuelve `posicion` desde el primer día porque RRF consume
-- posiciones, no puntuaciones: `score = Σ peso_i / (k + posicion_i)`. Nadie la
-- consumía. Esto la consume.
--
-- LA PROPIEDAD QUE IMPORTA HOY, y la que nadie probaría si esto se escribiera
-- junto con los embeddings: con `consulta_embedding` NULL —el estado real del
-- sistema hasta que llegue la clave de Voyage— el resultado tiene que ser
-- EXACTAMENTE el de `busqueda_lexica`. Mismas filas, mismo orden, sin error y
-- sin reordenar. Ese es el camino de producción desde ahora.
--
-- `rrf_k = 50` viene de la receta de §11. Los pesos son parámetros porque el
-- plan quiere sesgar a léxico en `"ley 2277 de 2022"` y a semántico en
-- `"impuesto a bebidas azucaradas"`.
--
-- Nota sobre `hnsw.iterative_scan` (§621): es un GUC de sesión y no puede
-- fijarse dentro de una función STABLE. Lo pone quien llama —la capa de
-- `web/src/lib/consultas.ts`— y por eso no aparece aquí.
-- ---------------------------------------------------------------------------
create or replace function hybrid_search(
  consulta            text,
  consulta_embedding  extensions.vector(256) default null,
  limite              int  default 20,
  solo_tipo           origen_resultado default null,
  peso_lexico         real default 1.0,
  peso_semantico      real default 1.0,
  rrf_k               int  default 50,
  -- Se recuperan más candidatos de los que se devuelven: fusionar dos top-20
  -- pierde lo que un ranking vio en el puesto 25 y el otro no vio en absoluto.
  pool                int  default 200
)
returns table (
  origen origen_resultado, id uuid, titulo text, referencia text, estado text,
  fecha date, score double precision,
  posicion_lexica bigint, posicion_semantica bigint,
  url_fuente text, captured_at timestamptz, tier tier_evidencia
)
language sql
stable
set search_path = ''
as $$
  with lex as (
    select b.origen, b.id, b.posicion
    from public.busqueda_lexica(consulta, pool, solo_tipo) b
  ),
  sem_chunk as (
    select c.fuente as origen,
           coalesce(c.norma_id, c.providencia_id, c.proyecto_id) as id,
           (c.embedding operator(extensions.<#>) consulta_embedding) as dist
    from public.chunk c
    where consulta_embedding is not null
      and c.embedding is not null
      and (solo_tipo is null or c.fuente = solo_tipo)
    order by (c.embedding operator(extensions.<#>) consulta_embedding)
    limit pool
  ),
  sem as (
    -- UN CHUNK NO ES UN RESULTADO. Varios artículos de la misma norma compiten
    -- entre sí; la norma entra una vez, con su MEJOR pasaje. Y la posición se
    -- recalcula DESPUÉS de deduplicar: reutilizar la del ranking de chunks
    -- metería denominadores equivocados en RRF (si el artículo 36A va 3º y el
    -- artículo 1 de la misma ley va 7º, la posición de la ley no es 3).
    select s.origen, s.id,
           row_number() over (order by min(s.dist), s.origen, s.id) as posicion
    from sem_chunk s
    group by s.origen, s.id
  ),
  claves as (
    -- FULL OUTER JOIN, no INNER. Lo que aparece en un solo ranking sigue
    -- puntuando, con el término ausente aportando 0. Con INNER se caería todo
    -- lo que el índice vectorial no devolvió — y entonces la búsqueda híbrida
    -- no añadiría nada sobre la léxica, que es justo lo contrario de su razón
    -- de existir: el acierto semántico cuyo TÍTULO no casa con la consulta.
    --
    -- La identidad es el PAR (origen, id): hay tres tablas fusionadas aquí.
    select
      coalesce(l.origen, s.origen) as origen,
      coalesce(l.id, s.id)         as id,
      l.posicion as posicion_lexica,
      s.posicion as posicion_semantica,
      coalesce(peso_lexico::double precision    / (rrf_k + l.posicion), 0)
    + coalesce(peso_semantico::double precision / (rrf_k + s.posicion), 0) as score
    from lex l
    full outer join sem s on s.origen = l.origen and s.id = l.id
  ),
  datos as (
    -- Rehidratación. Una fila que solo trae el ranking semántico no tiene
    -- título ni procedencia, y una fila sin procedencia comprobable no sale de
    -- aquí. Las proyecciones replican las de `busqueda_lexica` a propósito: un
    -- resultado tiene que verse igual lo haya encontrado el léxico o el vector.
    select 'proyecto_ley'::public.origen_resultado as origen, p.id, p.titulo,
           p.numero_senado_canonico as referencia, p.estado::text as estado,
           null::date as fecha, p.url_fuente::text as url_fuente,
           p.captured_at, p.tier
    from public.proyecto_ley p
    where exists (select 1 from claves k where k.origen = 'proyecto_ley' and k.id = p.id)
    union all
    select 'providencia'::public.origen_resultado, pr.id,
           nullif(pr.tema, 'Sin información'), pr.sentencia, pr.tipo::text,
           pr.fecha_publicacion, pr.url_texto::text, pr.captured_at, pr.tier
    from public.providencia pr
    where exists (select 1 from claves k where k.origen = 'providencia' and k.id = pr.id)
    union all
    select 'norma'::public.origen_resultado, n.id, n.titulo,
           n.tipo || ' ' || n.numero || ' de ' || n.anio, null::text,
           n.fecha_publicacion, n.url_fuente::text, n.captured_at, n.tier
    from public.norma n
    where exists (select 1 from claves k where k.origen = 'norma' and k.id = n.id)
  )
  -- Este JOIN sí es INNER, y no es una incoherencia con el de arriba: allí se
  -- fusionan RANKINGS y perder uno pierde recobro; aquí se adjunta PROCEDENCIA
  -- y una fila sin ella no debe publicarse. No «arreglar» a LEFT.
  select k.origen, k.id, d.titulo, d.referencia, d.estado, d.fecha, k.score,
         k.posicion_lexica, k.posicion_semantica,
         d.url_fuente, d.captured_at, d.tier
  from claves k
  join datos d on d.origen = k.origen and d.id = k.id
  -- Desempate determinista. Sin él la paginación es inestable y nadie se entera
  -- hasta que un usuario pasa de página y ve dos veces la misma fila.
  order by k.score desc, k.origen, k.id
  limit limite;
$$;

comment on function hybrid_search is
  'RRF sobre el ranking léxico y el semántico. Con consulta_embedding NULL '
  'degrada EXACTAMENTE a busqueda_lexica: ese es el camino de producción hasta '
  'que exista clave de embeddings, y es la propiedad que este diseño protege.';
