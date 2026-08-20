-- Suscripciones a alertas (Fase 5).
--
-- ## La primera tabla del proyecto con datos personales de verdad
--
-- Hasta aquí el corpus era información pública del Estado. Una suscripción es
-- otra cosa: el correo de un ciudadano y **los temas que le interesan**. El
-- segundo campo es el delicado — «a qué normas le sigo la pista» puede revelar
-- la actividad profesional de alguien, un litigio en curso o su posición
-- política, y la Ley 1581 protege eso aunque el correo se dé voluntariamente.
--
-- Y por eso **aquí el criterio de RLS se invierte**: no es lectura pública como
-- en el resto de las tablas, es propiedad. Van las cuatro políticas escritas
-- una a una en vez de una permisiva: una política «para todo» es fácil de
-- aflojar sin que se note en el diff.

-- Un CHECK no admite subconsultas, así que la comprobación va en una función
-- IMMUTABLE. Un tema en blanco haría que el digest casara con TODO.
create or replace function public.array_sin_blancos(arr text[])
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(bool_and(length(trim(x)) > 0), false) from unnest(arr) as x
$$;

create table suscripcion (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references auth.users(id) on delete cascade,
  temas        text[] not null,
  cadencia     text not null default 'semanal'
               check (cadencia in ('diaria', 'semanal')),
  -- Hasta dónde se informó ya. Hace el digest incremental: si un envío falla y
  -- se reintenta al día siguiente, la ventana sigue siendo la correcta.
  ultimo_envio timestamptz,
  creada_en    timestamptz not null default now(),
  activa       boolean not null default true,

  constraint suscripcion_temas_no_vacia check (cardinality(temas) > 0),
  constraint suscripcion_temas_sin_blancos check (public.array_sin_blancos(temas)),
  constraint suscripcion_unica unique (usuario_id, cadencia)
);

create index suscripcion_pendientes on suscripcion (cadencia, ultimo_envio) where activa;

alter table suscripcion enable row level security;

create policy "cada quien ve las suyas" on suscripcion
  for select to authenticated using (auth.uid() = usuario_id);
create policy "cada quien crea las suyas" on suscripcion
  for insert to authenticated with check (auth.uid() = usuario_id);
create policy "cada quien edita las suyas" on suscripcion
  for update to authenticated using (auth.uid() = usuario_id)
  with check (auth.uid() = usuario_id);
create policy "cada quien borra las suyas" on suscripcion
  for delete to authenticated using (auth.uid() = usuario_id);

-- `anon` no tiene NINGUNA política: no ve suscripciones, ni suyas ni ajenas.
-- Verificado asumiendo el rol: ve 0.
