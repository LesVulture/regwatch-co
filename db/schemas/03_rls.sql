-- RLS desde el día 1, no en la Fase 5.
--
-- El plan agendaba «Auth + RLS» en la Fase 5. Eso era un error de orden: en
-- cuanto existe una tabla en `public`, PostgREST la expone, y el linter de
-- Supabase la marca como ERROR. Una tabla sin RLS en un proyecto con anon key
-- es escribible desde fuera — no en la Fase 5: hoy.
--
-- El criterio, que no es simétrico:
--   LECTURA  → abierta. El dato ES público (información legislativa del
--              Estado); que se pueda leer sin fricción es el objetivo del
--              proyecto, no una concesión.
--   ESCRITURA → cerrada. Sin política de INSERT/UPDATE/DELETE, anon y
--              authenticated quedan denegados por defecto. Los colectores
--              escriben con service_role, que salta RLS por diseño.
--
-- Verificado en vivo el 2026-08-20 asumiendo el rol `anon`: lee ✓, inserta ✗,
-- modifica ✗ (0 filas), borra ✗ (0 filas).

alter table captura       enable row level security;
alter table norma         enable row level security;
alter table norma_version enable row level security;
alter table afectacion    enable row level security;

create policy "lectura pública" on norma
  for select to anon, authenticated using (true);
create policy "lectura pública" on norma_version
  for select to anon, authenticated using (true);
create policy "lectura pública" on afectacion
  for select to anon, authenticated using (true);

-- `captura` NO abre lectura pública, y su ausencia de política es deliberada:
-- guarda `blob_uri` y la traza de gates, que es telemetría de ingesta, no
-- contenido para el ciudadano. El linter lo reporta como INFO
-- (`rls_enabled_no_policy`) y ese INFO es la decisión, no un descuido.
-- Si algún día se expone, será por una vista acotada, nunca abriendo la tabla.

comment on table captura is
  'Bytes crudos capturados, con su procedencia. Se persiste antes de parsear y '
  'también cuando el gate rechaza: la captura fallida es el punto de replay. '
  'RLS activo y SIN política de lectura a propósito: es telemetría de ingesta.';
