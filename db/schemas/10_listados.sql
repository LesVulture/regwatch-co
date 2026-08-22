-- Listados y fichas: lo que la búsqueda híbrida no cubre.
--
-- `hybrid_search` exige una consulta de texto. Explorar proyectos por
-- legislatura o providencias por año no es una búsqueda: es un recorte del
-- corpus capturado. Estas funciones no hacen FTS ni RRF. El OFFSET pagina
-- sobre un orden determinista (captura, id).

create or replace function listar_proyectos(
  filtro_legislatura text default null,
  filtro_estado      text default null,
  filtro_camara      text default null,
  filtro_comision    text default null,
  filtro_anio        int  default null,
  limite             int  default 20,
  desplazamiento     int  default 0
)
returns table (
  origen origen_resultado, id uuid, titulo text, referencia text, estado text,
  fecha date, legislatura text, autor text, comision text, estado_camara text,
  url_fuente text, captured_at timestamptz, tier tier_evidencia
)
language sql
stable
set search_path = ''
as $$
  select
    'proyecto_ley'::public.origen_resultado,
    p.id, p.titulo, p.numero_senado_canonico, p.estado::text,
    null::date, p.legislatura, p.autor, p.comision, p.estado_camara::text,
    p.url_fuente::text, p.captured_at, p.tier
  from public.proyecto_ley p
  where (filtro_legislatura is null or p.legislatura = filtro_legislatura)
    and (filtro_estado is null or p.estado::text = filtro_estado)
    and (filtro_camara is null or p.estado_camara::text = filtro_camara)
    and (filtro_comision is null or p.comision = filtro_comision)
    and (filtro_anio is null or p.legislatura like ('%' || filtro_anio::text || '%'))
  order by p.captured_at desc, p.id
  limit limite
  offset greatest(desplazamiento, 0);
$$;

create or replace function listar_providencias(
  filtro_anio int  default null,
  filtro_tipo text default null,
  limite      int  default 20,
  desplazamiento int default 0
)
returns table (
  origen origen_resultado, id uuid, titulo text, referencia text, estado text,
  fecha date, url_fuente text, captured_at timestamptz, tier tier_evidencia
)
language sql
stable
set search_path = ''
as $$
  select
    'providencia'::public.origen_resultado,
    pr.id,
    nullif(pr.tema, 'Sin información'),
    pr.sentencia,
    pr.tipo::text,
    pr.fecha_publicacion,
    pr.url_texto::text, pr.captured_at, pr.tier
  from public.providencia pr
  where (filtro_tipo is null or pr.tipo::text = filtro_tipo)
    and (filtro_anio is null
         or extract(year from pr.fecha_publicacion)::int = filtro_anio)
  order by pr.fecha_publicacion desc nulls last, pr.id
  limit limite
  offset greatest(desplazamiento, 0);
$$;

create or replace function ficha_proyecto(proyecto uuid)
returns table (
  id uuid, titulo text, referencia text, legislatura text, cuatrenio text,
  autor text, comision text, estado text, estado_original text, estado_camara text,
  numero_senado_canonico text, numero_camara_raw text,
  crosswalk text, crosswalk_motivo text,
  url_fuente text, captured_at timestamptz, tier tier_evidencia
)
language sql
stable
set search_path = ''
as $$
  select
    p.id, p.titulo, p.numero_senado_canonico, p.legislatura, p.cuatrenio,
    p.autor, p.comision, p.estado::text, p.estado_original, p.estado_camara::text,
    p.numero_senado_canonico, p.numero_camara_raw,
    p.crosswalk::text, p.crosswalk_motivo,
    p.url_fuente::text, p.captured_at, p.tier
  from public.proyecto_ley p
  where p.id = proyecto;
$$;

create or replace function ficha_providencia(prov uuid)
returns table (
  id uuid, titulo text, sentencia text, tipo text,
  fecha_publicacion date, fecha_sentencia date, expediente text,
  magistrados text[],
  url_fuente text, url_texto text, captured_at timestamptz, tier tier_evidencia
)
language sql
stable
set search_path = ''
as $$
  select
    pr.id, nullif(pr.tema, 'Sin información'), pr.sentencia, pr.tipo::text,
    pr.fecha_publicacion, pr.fecha_sentencia, pr.expediente,
    pr.magistrados,
    pr.url_fuente::text, pr.url_texto::text, pr.captured_at, pr.tier
  from public.providencia pr
  where pr.id = prov;
$$;

-- Valores observados en lo capturado, no una taxonomía. Sirven para rellenar
-- <select> sin inventar opciones que la base no tiene.
create or replace function opciones_filtro_proyectos()
returns table (
  legislaturas text[],
  estados      text[],
  camaras      text[],
  comisiones   text[]
)
language sql
stable
set search_path = ''
as $$
  select
    coalesce((select array_agg(distinct p.legislatura order by p.legislatura)
              from public.proyecto_ley p), '{}'),
    coalesce((select array_agg(distinct p.estado::text order by p.estado::text)
              from public.proyecto_ley p), '{}'),
    coalesce((select array_agg(distinct p.estado_camara::text order by p.estado_camara::text)
              from public.proyecto_ley p
              where p.estado_camara is not null), '{}'),
    coalesce((select array_agg(distinct p.comision order by p.comision)
              from public.proyecto_ley p
              where length(trim(p.comision)) > 0), '{}');
$$;

create or replace function opciones_filtro_providencias()
returns table (
  anios int[],
  tipos text[]
)
language sql
stable
set search_path = ''
as $$
  select
    coalesce((select array_agg(distinct extract(year from pr.fecha_publicacion)::int
                               order by extract(year from pr.fecha_publicacion)::int)
              from public.providencia pr
              where pr.fecha_publicacion is not null), '{}'),
    coalesce((select array_agg(distinct pr.tipo::text order by pr.tipo::text)
              from public.providencia pr), '{}');
$$;

grant execute on function public.listar_proyectos(text, text, text, text, int, int, int)
  to anon, authenticated;
grant execute on function public.listar_providencias(int, text, int, int)
  to anon, authenticated;
grant execute on function public.ficha_proyecto(uuid) to anon, authenticated;
grant execute on function public.ficha_providencia(uuid) to anon, authenticated;
grant execute on function public.opciones_filtro_proyectos() to anon, authenticated;
grant execute on function public.opciones_filtro_providencias() to anon, authenticated;
