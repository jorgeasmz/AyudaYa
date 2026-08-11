-- Comprobación de que el esquema quedó bien instalado.
--
-- Pégalo en el SQL Editor de Supabase después de ejecutar `schema.sql`.
-- Las ocho filas deben salir con `correcto = t`. Las que fallen aparecen
-- arriba del todo.
--
-- Sirve sobre todo para confirmar que los ajustes del proyecto (Data API,
-- exposición automática de tablas, RLS automática) no dejaron el esquema
-- a medias.

with c as (
  select
    (select count(*) from information_schema.role_table_grants
      where grantee = 'anon' and table_schema = 'public'
        and table_name in ('reportes_mapa','personas_busqueda')
        and privilege_type = 'SELECT') as lectura_anon,
    (select count(*) from information_schema.role_table_grants
      where grantee = 'anon' and table_schema = 'public'
        and table_name in ('reportes_mapa','personas_busqueda')
        and privilege_type in ('INSERT','UPDATE','DELETE')) as escritura_anon,
    (select count(*) from pg_class c2 join pg_namespace n on n.oid = c2.relnamespace
      where n.nspname = 'public'
        and c2.relname in ('reportes_mapa','personas_busqueda')
        and c2.relrowsecurity) as con_rls,
    (select count(*) from pg_policies
      where schemaname = 'public'
        and tablename in ('reportes_mapa','personas_busqueda')) as policies,
    (select count(*) from pg_policies
      where schemaname = 'public' and cmd = 'INSERT') as policies_insert,
    (select count(*) from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'reportes_mapa') as en_realtime,
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('crear_reporte_mapa','crear_registro_persona')) as firmas_creacion,
    (select has_schema_privilege('anon','privado','USAGE')) as anon_ve_privado
)
select * from (values
  ('anon puede leer las dos tablas',        (select lectura_anon    from c) = 2),
  ('anon NO puede escribir en ellas',       (select escritura_anon  from c) = 0),
  ('RLS activa en las dos tablas',          (select con_rls         from c) = 2),
  ('hay políticas creadas',                  (select policies        from c) >= 6),
  ('NO existe política de INSERT',            (select policies_insert from c) = 0),
  ('reportes_mapa está en Realtime',        (select en_realtime     from c) = 1),
  ('una sola firma por función de creación',(select firmas_creacion from c) = 2),
  ('anon NO ve el esquema privado',         (select anon_ve_privado from c) = false)
) as t(comprobacion, correcto)
order by correcto, comprobacion;
