-- Vigencia: el modelo que hace funcionar todo.
--
-- `vigente` NO es un booleano. Es una función del tiempo sobre un grafo de
-- afectaciones tipadas. Esa es la diferencia entre este proyecto y las
-- compilaciones que ya existen — incluida la de Función Pública, que publica
-- una semántica parecida y se autodesautoriza en la misma página.
--
-- PLAN-V2.md §5.2.

-- ---------------------------------------------------------------------------
-- Normas y sus versiones en el tiempo.
-- ---------------------------------------------------------------------------
create table norma (
  id                 uuid primary key default gen_random_uuid(),
  tipo               text not null,        -- ley, decreto, acto_legislativo…
  numero             text not null,
  anio               int  not null,
  titulo             text not null,
  -- Publicación oficial que le da existencia. Sin esto no hay norma.
  diario_oficial     text,
  fecha_publicacion  date,

  url_fuente         url_fuente  not null,
  captured_at        timestamptz not null,
  tier               tier_evidencia not null,

  constraint norma_anio_razonable check (anio between 1810 and 2100)
);

create unique index norma_identidad on norma (tipo, numero, anio);

-- ---------------------------------------------------------------------------
-- Una versión de la norma vigente durante un intervalo.
--
-- La consulta que el sistema existe para responder:
--
--   select * from norma_version
--   where norma_id = ?
--     and vigente_desde <= '2024-03-03'
--     and (vigente_hasta is null or vigente_hasta > '2024-03-03');
--
-- `vigente_hasta` NULL significa «sigue vigente hasta donde sabemos», que no
-- es lo mismo que «vigente para siempre». La diferencia se declara en la UI.
-- ---------------------------------------------------------------------------
create table norma_version (
  id             uuid primary key default gen_random_uuid(),
  norma_id       uuid not null references norma(id) on delete cascade,
  vigente_desde  date not null,
  vigente_hasta  date,
  texto_uri      text,

  url_fuente     url_fuente  not null,
  captured_at    timestamptz not null,
  tier           tier_evidencia not null,

  constraint version_intervalo_valido
    check (vigente_hasta is null or vigente_hasta > vigente_desde)
);

create index norma_version_lookup
  on norma_version (norma_id, vigente_desde, vigente_hasta);

-- ---------------------------------------------------------------------------
-- Tipos de afectación. Los 22 medidos, no una taxonomía inventada.
--
-- `decae_pierde_fuerza_ejecutoria` tiene 5 causales en el CPACA art. 91; un
-- escéptico detectó que a la investigación original le faltaba la quinta
-- («cuando pierdan vigencia»).
-- ---------------------------------------------------------------------------
create type tipo_afectacion as enum (
  'deroga_expresa',
  'deroga_tacita',
  'deroga_organica',
  'modifica',
  'adiciona',
  'sustituye',
  'subroga',
  'reglamenta',
  'compila',
  'declara_inexequible_total',
  'declara_inexequible_parcial',
  'declara_exequible_condicionada',
  'suspende_provisionalmente',
  'anula',
  'decae_pierde_fuerza_ejecutoria',
  'derogada_por_referendo'
);

-- Cómo se obtuvo la arista. La distinción que un escéptico pilló falsificada:
-- una afectación inferida de un tercero, presentada como declarada en la norma.
create type derivation_arista as enum (
  'declarado_en_norma',  -- leído del texto de la norma AFECTANTE
  'parsed_from_text'     -- inferido de un tercero que la cita
);

-- ---------------------------------------------------------------------------
-- Cómo se obtuvo la fecha de efecto.
--
-- ESTE ENUM ES EL QUE SOSTIENE R1. `vigente_hasta` se deriva de
-- `afectacion.fecha_efecto`; si un LLM escribe esa fecha, la vigencia sale del
-- modelo por la puerta de atrás y la regla «la vigencia nunca sale del LLM»
-- queda en papel mojado.
--
-- `no_determinable` NO es un fallo: es la respuesta correcta cuando la
-- cláusula no fija fecha, y hace que la consulta devuelva «vigencia no
-- confirmada con fuente primaria», que es exactamente lo que R1 promete.
-- ---------------------------------------------------------------------------
create type derivation_fecha as enum (
  'declarada_en_texto',            -- la cláusula da fecha explícita
  'derivada_deterministicamente',  -- regla computable + Diario Oficial, sin LLM
  'no_determinable'                -- vacatio ambigua o condicionada
);

-- ---------------------------------------------------------------------------
-- El corazón del sistema: la arista tipada norma → norma.
-- ---------------------------------------------------------------------------
create table afectacion (
  id                  uuid primary key default gen_random_uuid(),
  norma_afectante_id  uuid not null references norma(id) on delete restrict,
  norma_afectada_id   uuid not null references norma(id) on delete restrict,
  tipo                tipo_afectacion not null,
  -- Artículo concreto afectado. NULL = la norma entera.
  articulo            text,

  fecha_efecto        date,
  fecha_derivation    derivation_fecha not null,
  -- La regla aplicada cuando fecha_derivation = 'derivada_deterministicamente'.
  -- Se guarda la REGLA, no solo el resultado: es lo que hace re-ejecutable el
  -- cálculo y auditable la conclusión.
  fecha_regla         text,

  -- El texto de la cláusula, verbatim de la norma AFECTANTE. Es la prueba.
  texto_soporte       text not null,
  derivation          derivation_arista not null,

  url_fuente          url_fuente  not null,
  captured_at         timestamptz not null,
  tier                tier_evidencia not null,
  -- Diario Oficial de la norma AFECTANTE, que es lo que cierra la cadena.
  diario_oficial      text,

  -- Una norma no se afecta a sí misma.
  constraint afectacion_no_reflexiva
    check (norma_afectante_id <> norma_afectada_id),

  -- R1 EN EL ESQUEMA: si hay fecha, tiene que decir de dónde salió; y si se
  -- derivó por regla, la regla tiene que estar escrita. Una fecha sin
  -- procedencia no entra, por mucho que parezca correcta.
  constraint afectacion_fecha_con_procedencia check (
    (fecha_efecto is null and fecha_derivation = 'no_determinable')
    or (fecha_efecto is not null and fecha_derivation <> 'no_determinable')
  ),
  constraint afectacion_regla_escrita check (
    fecha_derivation <> 'derivada_deterministicamente' or fecha_regla is not null
  ),

  -- Una afirmación de vigencia exige fuente primaria. No es una preferencia:
  -- es la regla que separa este proyecto de las compilaciones existentes.
  constraint afectacion_vigencia_exige_primaria check (
    derivation <> 'declarado_en_norma' or tier = 'primaria'
  ),

  -- El texto de soporte no puede estar vacío: sin cláusula citada no hay arista.
  constraint afectacion_soporte_no_vacio check (length(trim(texto_soporte)) > 0)
);

create index afectacion_afectada on afectacion (norma_afectada_id, fecha_efecto);
create index afectacion_afectante on afectacion (norma_afectante_id);

comment on table afectacion is
  'Arista tipada norma→norma. Ninguna entra sin la cláusula citada de la norma '
  'AFECTANTE y su Diario Oficial. fecha_derivation sostiene R1: si un LLM '
  'escribiera fecha_efecto, la vigencia saldría del modelo por la puerta de atrás.';

comment on column afectacion.fecha_regla is
  'La regla aplicada, no solo su resultado. Ej.: "rige desde su publicación en '
  'el Diario Oficial" + DO 52.819 de 2024-07-16. Hace el cálculo re-ejecutable.';
