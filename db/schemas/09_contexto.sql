-- El puente que faltaba: de la consulta al CONTEXTO citable.
--
-- `hybrid_search` devuelve ENTIDADES (una norma, una providencia, un proyecto).
-- `construirBloques()` de `rag/qa.ts` necesita CHUNKS. Nada unía las dos cosas,
-- así que la cadena pregunta → recuperación → contexto → cita estaba cortada
-- justo en medio: el tercer contrato colgando de la misma forma que los otros
-- dos (`posicion` sin consumidor, `chunk` sin escritor).
--
-- PLAN-V2.md §8.3 y §621.

-- ---------------------------------------------------------------------------
-- Contexto para el Q&A.
--
-- Devuelve UNA FILA POR CHUNK, y —esto es lo importante— también una fila por
-- entidad que casó pero **no tiene texto ingerido**, con `chunk_id` en NULL.
--
-- Podría haberse hecho con un JOIN interno, y sería peor: una norma relevante
-- cuyo articulado no se ha capturado desaparecería del resultado, y el modelo
-- respondería como si no existiera. Con `chunk_id IS NULL` el hueco viaja
-- dentro de la respuesta y quien llama no puede no verlo. Es la misma regla
-- que «cero afectaciones no es vigente para siempre», aplicada al contexto.
-- ---------------------------------------------------------------------------
create or replace function contexto_qa(
  consulta                text,
  consulta_embedding      extensions.vector(256) default null,
  max_entidades           int default 5,
  max_chunks_por_entidad  int default 4,
  peso_lexico             real default 1.0,
  peso_semantico          real default 1.0
)
returns table (
  posicion_entidad  bigint,
  origen            origen_resultado,
  entidad_id        uuid,
  entidad           text,
  chunk_id          text,
  referencia        text,
  texto             text,
  caracteres        int,
  url_fuente        text,
  captured_at       timestamptz,
  tier              tier_evidencia
)
language sql
stable
set search_path = ''
as $$
  with ent as (
    select h.origen, h.id, h.referencia, h.score,
           h.url_fuente, h.captured_at, h.tier,
           row_number() over (order by h.score desc, h.origen, h.id) as posicion
    from public.hybrid_search(
           consulta, consulta_embedding, max_entidades, null,
           peso_lexico, peso_semantico) h
  ),
  ch as (
    select e.origen, e.id as entidad_id, c.id as chunk_id, c.referencia,
           c.texto, c.caracteres, c.url_fuente, c.captured_at, c.tier,
           -- Con vector, los MEJORES pasajes primero: para eso existe el
           -- chunking. Sin vector, orden por id — arbitrario pero
           -- determinista, que es lo que se puede prometer.
           row_number() over (
             partition by e.origen, e.id
             order by (case
                         when consulta_embedding is null or c.embedding is null
                         then null
                         else c.embedding operator(extensions.<#>) consulta_embedding
                       end) nulls last,
                      c.id
           ) as n
    from ent e
    join public.chunk c
      on c.fuente = e.origen
     and coalesce(c.norma_id, c.providencia_id, c.proyecto_id) = e.id
  )
  select e.posicion, e.origen, e.id, e.referencia,
         ch.chunk_id, ch.referencia, ch.texto, ch.caracteres,
         -- La procedencia sale del CHUNK cuando lo hay, y de la entidad cuando
         -- no: la fila del hueco también tiene que ser verificable.
         coalesce(ch.url_fuente, e.url_fuente),
         coalesce(ch.captured_at, e.captured_at),
         coalesce(ch.tier, e.tier)
  from ent e
  left join ch
    on ch.origen = e.origen and ch.entidad_id = e.id
   and ch.n <= max_chunks_por_entidad
  -- SE SELECCIONA POR RELEVANCIA Y SE PRESENTA POR ID, y son dos cosas
  -- distintas a propósito: `ch.n` recorta quedándose con los mejores pasajes,
  -- y este ORDER BY los devuelve en orden de documento, que es como se lee una
  -- ley. Verificado el 2026-08-20: con tope 2 salen el art. 34 y el 19 —los dos
  -- más cercanos— y no el 16 y el 19, que es lo que daría ordenar por id.
  order by e.posicion, ch.chunk_id nulls first;
$$;

comment on function contexto_qa is
  'Contexto citable para el Q&A: chunks de las entidades que mejor casan. Una '
  'entidad SIN texto ingerido devuelve una fila con chunk_id NULL en vez de '
  'desaparecer — el hueco de evidencia viaja dentro de la respuesta.';
