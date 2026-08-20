-- Jurisprudencia de la Corte Constitucional (Fase 3).
--
-- Una providencia NO es una norma ni un proyecto: es una decisión judicial.
-- Puede DECLARAR INEXEQUIBLE una norma —y eso sí produce una `afectacion`, con
-- la sentencia como norma afectante— pero el registro en sí vive aquí.
--
-- 21.661 providencias medidas para 2015-2026.

create type tipo_providencia as enum (
  'Auto', 'Tutela', 'Constitucionalidad', 'Sentencia de unificación',
  -- La fuente puede publicar un tipo nuevo. Se admite MARCADO; no se rechaza
  -- el registro ni se le adjudica un tipo por parecido.
  'desconocido'
);

create table providencia (
  id                 uuid primary key default gen_random_uuid(),
  fuente_id          int  not null,
  sentencia          text not null,
  tipo               tipo_providencia not null,
  tipo_original      text not null,
  requiere_revision  boolean not null default false,

  fecha_publicacion  date,
  fecha_sentencia    date,
  expediente         text not null default '',
  magistrados        text[] not null default '{}',
  tema               text not null default '',

  -- Ruta TAL COMO la publica el índice. Se guarda, no se deriva: «A. 1126/26»
  -- no se convierte en «Autos/2026/A1126-26.htm» por ninguna regla que la
  -- fuente garantice, y adivinarla fabricaría URLs muertas.
  rutahtml           text not null,
  url_texto          url_fuente not null,

  url_fuente         url_fuente     not null,
  captured_at        timestamptz    not null,
  tier               tier_evidencia not null,

  constraint providencia_fuente_unica unique (fuente_id),
  constraint providencia_desconocido_va_a_revision
    check (requiere_revision = (tipo = 'desconocido')),
  constraint providencia_sentencia_no_vacia check (length(trim(sentencia)) > 0),
  constraint providencia_rutahtml_no_vacia  check (length(trim(rutahtml)) > 0),
  constraint providencia_fechas_coherentes
    check (fecha_sentencia is null or fecha_publicacion is null
           or fecha_sentencia <= fecha_publicacion)
);

create index providencia_tipo      on providencia (tipo, fecha_publicacion desc);
create index providencia_fecha     on providencia (fecha_publicacion desc);
create index providencia_revision  on providencia (fuente_id) where requiere_revision;
create index providencia_sentencia on providencia (sentencia);

alter table providencia add column tema_tsv tsvector
  generated always as (
    to_tsvector('spanish', public.immutable_unaccent(sentencia || ' ' || tema))
  ) stored;
create index providencia_tema_tsv on providencia using gin (tema_tsv);

alter table providencia enable row level security;
create policy "lectura pública" on providencia
  for select to anon, authenticated using (true);
