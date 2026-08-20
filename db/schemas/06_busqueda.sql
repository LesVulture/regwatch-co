-- Búsqueda y consulta de vigencia (§8.3 y §5.2).
--
-- La mitad LÉXICA vive aquí; la fusión RRF (`hybrid_search`) vive en
-- `08_rag.sql` y no en este fichero, porque Postgres valida el cuerpo de una
-- función `language sql` al crearla y `chunk` tiene que existir antes.
--
-- `hybrid_search` del plan es RRF sobre dos rankings: léxico (FTS) y semántico
-- (pgvector). La mitad semántica necesita embeddings, o sea una clave de API;
-- la léxica no necesita nada. Se construye ahora con la forma que RRF espera
-- —(rank, posicion)— para que la otra mitad encaje sin reescribir esto.

create type origen_resultado as enum ('proyecto_ley', 'providencia', 'norma');

-- ---------------------------------------------------------------------------
-- Mitad LÉXICA de hybrid_search.
--
-- Toda fila devuelta arrastra su procedencia. No es decoración: una respuesta
-- sin URL comprobable no sirve para nada aquí, y si la procedencia fuera
-- opcional acabaría siendo opcional de verdad.
-- ---------------------------------------------------------------------------
create or replace function busqueda_lexica(
  consulta   text,
  limite     int  default 20,
  solo_tipo  origen_resultado default null
)
returns table (
  origen origen_resultado, id uuid, titulo text, referencia text, estado text,
  fecha date, rank real, posicion bigint,
  url_fuente text, captured_at timestamptz, tier tier_evidencia
)
language sql
stable
-- Sin `search_path` fijo la función es un vector de escalada, y el linter lo
-- marca. Las referencias van cualificadas.
set search_path = ''
as $$
  with q as (
    select plainto_tsquery('spanish', public.immutable_unaccent(consulta)) as tsq
  ),
  proyectos as (
    select 'proyecto_ley'::public.origen_resultado, p.id, p.titulo,
           p.numero_senado_canonico, p.estado::text, null::date,
           ts_rank(p.titulo_tsv, q.tsq), p.url_fuente::text, p.captured_at, p.tier
    from public.proyecto_ley p, q where p.titulo_tsv @@ q.tsq
  ),
  providencias as (
    select 'providencia'::public.origen_resultado, pr.id,
           nullif(pr.tema, 'Sin información'), pr.sentencia, pr.tipo::text,
           pr.fecha_publicacion, ts_rank(pr.tema_tsv, q.tsq),
           pr.url_texto::text, pr.captured_at, pr.tier
    from public.providencia pr, q where pr.tema_tsv @@ q.tsq
  ),
  normas as (
    select 'norma'::public.origen_resultado, n.id, n.titulo,
           n.tipo || ' ' || n.numero || ' de ' || n.anio, null::text,
           n.fecha_publicacion,
           ts_rank(to_tsvector('spanish', public.immutable_unaccent(n.titulo)), q.tsq),
           n.url_fuente::text, n.captured_at, n.tier
    from public.norma n, q
    where to_tsvector('spanish', public.immutable_unaccent(n.titulo)) @@ q.tsq
  ),
  todo as (
    select * from proyectos union all select * from providencias union all select * from normas
  )
  select t.origen, t.id, t.titulo, t.referencia, t.estado, t.fecha, t.rank,
         -- La POSICIÓN es lo que RRF consume: 1/(k + posicion). Se devuelve ya
         -- calculada para que fusionar con el ranking vectorial sea una suma.
         row_number() over (order by t.rank desc, t.id),
         t.url_fuente, t.captured_at, t.tier
  from todo t
  where solo_tipo is null or t.origen = solo_tipo
  order by t.rank desc, t.id
  limit limite;
$$;

-- ---------------------------------------------------------------------------
-- Vigencia a fecha arbitraria.
--
-- La respuesta NO es un booleano. Las tres posibles, y la tercera es la que
-- distingue a este proyecto de las compilaciones que ya existen:
--   1. AFECTADA         · hay afectación con fuente primaria y fecha derivable
--   2. cero filas       · no consta ninguna. NO es «vigente para siempre»
--   3. NO DETERMINABLE  · consta, pero la fecha no se puede derivar sin
--                         interpretar. R1 obliga a decirlo, no a estimarla.
-- ---------------------------------------------------------------------------
create or replace function consultar_vigencia(
  norma_tipo text, norma_numero text, norma_anio int, a_fecha date default current_date
)
returns table (
  veredicto text, articulo text, tipo_afectacion text, fecha_efecto date,
  ya_surtio_efecto boolean, norma_afectante text, diario_oficial text,
  clausula_prueba text, regla_aplicada text, procedencia text, verificable_en text
)
language sql
stable
set search_path = ''
as $$
  with objetivo as (
    select n.id from public.norma n
    where n.tipo = norma_tipo and n.numero = norma_numero and n.anio = norma_anio
  )
  select
    case
      when a.fecha_derivation = 'no_determinable'
        then 'NO DETERMINABLE — consta la afectación, pero su fecha de efecto no '
             'se puede derivar sin interpretar la norma. No se afirma vigencia.'
      when a.fecha_efecto <= a_fecha
        then 'AFECTADA — el cambio ya surtió efecto a la fecha consultada'
      else 'AFECTADA — el cambio está declarado pero AÚN NO surte efecto a esa fecha'
    end,
    coalesce(a.articulo, '(la norma entera)'), a.tipo::text, a.fecha_efecto,
    (a.fecha_efecto is not null and a.fecha_efecto <= a_fecha),
    af.tipo || ' ' || af.numero || ' de ' || af.anio, a.diario_oficial,
    -- La cláusula VERBATIM de la norma afectante. Sin esto no habría fila: lo
    -- impide `afectacion_soporte_no_vacio`.
    a.texto_soporte, a.fecha_regla,
    a.derivation::text || ' · tier ' || a.tier::text, a.url_fuente::text
  from public.afectacion a
  join objetivo o on o.id = a.norma_afectada_id
  join public.norma af on af.id = a.norma_afectante_id
  order by a.fecha_efecto nulls last, a.articulo;
$$;
