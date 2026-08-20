-- Procedencia: el contrato de evidencia como esquema.
--
-- Todo lo demás depende de este fichero. La regla del proyecto —ningún dato
-- sin URL checkeable y fecha de captura— no se deja a la disciplina de quien
-- escribe el INSERT: se hace cumplir aquí, donde no se puede olvidar.
--
-- PLAN-V2.md §10.

create extension if not exists "pgcrypto";
-- unaccent es obligatorio para la búsqueda en español (§8.3). Se crea aquí,
-- en la Fase 0, y no como descubrimiento de la Fase 4.
create extension if not exists "unaccent";

-- ---------------------------------------------------------------------------
-- Wrapper IMMUTABLE sobre unaccent.
--
-- Sin esto, una columna generada de tsvector NO SE CREA: unaccent() es STABLE,
-- no IMMUTABLE, y Postgres rechaza usarla en una expresión generada. Y sin
-- cualificar el esquema, el dump/restore se rompe cuando search_path cambia.
-- Los dos detalles están medidos; no son cautela teórica.
-- ---------------------------------------------------------------------------
create or replace function public.immutable_unaccent(text)
returns text
language sql
immutable
parallel safe
strict
as $$
  select public.unaccent('public.unaccent'::regdictionary, $1)
$$;

comment on function public.immutable_unaccent(text) is
  'Wrapper IMMUTABLE de unaccent, esquema-cualificado. Necesario para columnas '
  'generadas de tsvector; sin él la tabla de búsqueda no se crea.';

-- ---------------------------------------------------------------------------
-- Jerarquía probatoria. El orden importa y se compara.
-- ---------------------------------------------------------------------------
create type tier_evidencia as enum (
  'primaria',       -- la entidad que produce el acto lo publica
  'institucional',  -- un tercero oficial lo recoge
  'secundaria'      -- prensa, compilaciones privadas
);

-- ---------------------------------------------------------------------------
-- Capturas crudas.
--
-- Se persisten ANTES de cualquier parseo, incluso cuando los gates las
-- rechazan: la captura fallida es el punto de replay y la prueba de que la
-- fuente se rompió (§7).
--
-- El CUERPO no vive aquí: los ~500 MB del plan Free no aguantan un archivo
-- documental de gacetas y CONPES. Esta tabla guarda el puntero y el hash; el
-- objeto vive en el repositorio commons o en almacenamiento externo (§8.4).
-- ---------------------------------------------------------------------------
create table captura (
  id              uuid primary key default gen_random_uuid(),
  source_key      text        not null,
  url             text        not null,
  captured_at     timestamptz not null,
  content_hash    text        not null,
  content_type    text,
  http_status     int         not null,
  byte_length     bigint      not null,
  -- Dónde vive el cuerpo. NULL mientras el gate 3 de la Fase 0 no decida el
  -- destino: preferir un NULL honesto a una ruta inventada.
  blob_uri        text,
  -- Veredicto del gate. Una captura bloqueada se conserva: es evidencia.
  gate_outcome    text        not null default 'ok'
                  check (gate_outcome in ('ok', 'bloqueado')),
  gate_regla      text,

  constraint captura_url_http check (url ~* '^https?://'),
  constraint captura_hash_sha256 check (content_hash ~ '^[0-9a-f]{64}$'),
  -- Si el gate bloqueó, tiene que decir por qué. Un bloqueo sin motivo no es
  -- auditable, y este proyecto vive de que todo lo sea.
  constraint captura_bloqueo_motivado
    check (gate_outcome = 'ok' or gate_regla is not null)
);

-- El mismo contenido capturado dos veces no se duplica: es la palanca que
-- convierte el OCR de pago en coste marginal solo por documento nuevo (§7).
create unique index captura_url_hash_uniq on captura (url, content_hash);
create index captura_source_fecha on captura (source_key, captured_at desc);

comment on table captura is
  'Bytes crudos capturados, con su procedencia. Se persiste antes de parsear y '
  'también cuando el gate rechaza: la captura fallida es el punto de replay.';

-- ---------------------------------------------------------------------------
-- Tipo compuesto de procedencia.
--
-- Cada tabla de hechos lo incrusta. No es un patrón elegante por gusto: es lo
-- que impide que alguien cree una tabla nueva y olvide la procedencia, porque
-- las restricciones vienen con el tipo.
-- ---------------------------------------------------------------------------
create domain url_fuente as text
  check (value ~* '^https?://');

comment on domain url_fuente is
  'URL de fuente primaria. Acepta http:// explícito a propósito: la Secretaría '
  'del Senado solo responde por HTTP (el 443 hace timeout). Está medido.';
