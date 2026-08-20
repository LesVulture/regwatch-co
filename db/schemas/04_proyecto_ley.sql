-- Proyectos de ley en trámite.
--
-- La Fase 1 recolectaba 1.694 proyectos y no tenía dónde ponerlos: el esquema
-- solo modelaba NORMAS, o sea lo ya aprobado. Un proyecto no es una norma —no
-- tiene Diario Oficial y no tiene vigencia— y meterlo en `norma` habría roto
-- justo las restricciones que sostienen R1.
--
-- Estado desplegado tras las migraciones 05 y 06.

-- Los 14 estados canónicos de collectors/src/senado/estados.ts. Como enum para
-- que la base rechace un estado que el normalizador no conozca, en vez de
-- guardar texto libre y contar mal después.
create type estado_tramite as enum (
  'radicado','en_comision','en_plenaria','aprobado_camara_origen',
  'en_camara_revisora','conciliacion','aprobado_congreso','sancion_presidencial',
  'ley','objetado','control_constitucional','archivado','retirado','desconocido'
);

-- Resultado del crosswalk contra Cámara. `no_declarado` es el caso mayoritario
-- (62,1 % medido sobre 1.694 filas) y NO es un fallo: es que la fuente calla.
create type estado_crosswalk as enum ('declarado','no_declarado','ilegible','acumulado');

-- El segundo eje de los estados de trámite. Va separado a propósito: deducir la
-- cámara desde el estado exigiría conocer la cámara de ORIGEN del proyecto, y
-- este endpoint no la publica.
create type camara as enum ('senado','camara');

create table proyecto_ley (
  id                     uuid primary key default gen_random_uuid(),
  fuente_id              int  not null,
  legislatura            text not null,
  cuatrenio              text not null,

  numero_senado_raw      text not null,
  numero_senado_canonico text,
  numero_camara_raw      text not null default '',

  crosswalk              estado_crosswalk not null,
  -- POR QUÉ quedó así. Procedencia, no log: permite auditar una no-coincidencia
  -- sin volver a ejecutar nada.
  crosswalk_motivo       text not null,
  -- Dígitos que el campo NOMBRA y el parser no interpretó (van sin año).
  --
  -- Caso real (fuente_id 9018): `054/23 ACUM 087,095,109`. Los tres acumulados
  -- van sin `/año`, el regex lo exige, y la fila se clasificaba como
  -- `declarado` —un crosswalk 1:1 limpio— con TRES proyectos desaparecidos sin
  -- dejar rastro. No se arregla infiriendo el año compartido: deducir
  -- identidades por convención tipográfica es emparejar por parecido con otro
  -- nombre. Se guarda lo que no se interpretó y la fila va a revisión humana.
  crosswalk_residuo      text[] not null default '{}',

  titulo                 text not null,
  autor                  text not null,
  comision               text not null default '',

  estado                 estado_tramite not null,
  -- El valor tal como lo publicó la fuente. NUNCA se descarta al normalizar.
  estado_original        text not null,
  estado_camara          camara,
  requiere_revision      boolean not null default false,

  url_fuente             url_fuente     not null,
  captured_at            timestamptz    not null,
  tier                   tier_evidencia not null,

  constraint proyecto_fuente_unica unique (fuente_id),

  -- `requiere_revision` cubre los DOS motivos por los que una fila necesita un
  -- humano: un estado que el normalizador no conoce, o un crosswalk que dejó
  -- números sin contar. Es un `=`, no un `or`: marcar de más también miente.
  constraint proyecto_revision_cubre_ambos_ejes check (
    requiere_revision = (estado = 'desconocido' or cardinality(crosswalk_residuo) > 0)
  ),
  constraint proyecto_estado_original_no_vacio
    check (length(trim(estado_original)) > 0),
  constraint proyecto_crosswalk_declarado_tiene_numero
    check (crosswalk not in ('declarado','acumulado') or length(trim(numero_camara_raw)) > 0)
);

create index proyecto_legislatura   on proyecto_ley (legislatura, estado);
create index proyecto_estado        on proyecto_ley (estado);
create index proyecto_revision      on proyecto_ley (requiere_revision) where requiere_revision;
create index proyecto_numero_senado on proyecto_ley (numero_senado_canonico);
create index proyecto_crosswalk     on proyecto_ley (crosswalk);
create index proyecto_crosswalk_residuo on proyecto_ley (fuente_id)
  where cardinality(crosswalk_residuo) > 0;

-- Búsqueda en español sobre el título. ESTA es la columna generada que el gate 2
-- demostró que NO se crea sin el wrapper IMMUTABLE de 01_procedencia.sql.
alter table proyecto_ley add column titulo_tsv tsvector
  generated always as (to_tsvector('spanish', public.immutable_unaccent(titulo))) stored;
create index proyecto_titulo_tsv on proyecto_ley using gin (titulo_tsv);

alter table proyecto_ley enable row level security;
create policy "lectura pública" on proyecto_ley
  for select to anon, authenticated using (true);

comment on table proyecto_ley is
  'Proyectos de ley en trámite. NO son normas: sin Diario Oficial y sin vigencia.';
comment on column proyecto_ley.crosswalk_residuo is
  'Dígitos que numero_camara NOMBRA y el parser no interpretó. No vacío = la '
  'relación con Cámara está CONTADA DE MENOS y la fila necesita adjudicación humana.';
