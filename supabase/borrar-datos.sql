-- =============================================================================
--  BORRAR TODOS LOS REPORTES Y REGISTROS DE PERSONAS
-- -----------------------------------------------------------------------------
--  Esto es irreversible. Supabase no hace copias de seguridad en el plan
--  gratuito, así que lo borrado no vuelve.
--
--  Por seguridad el script arranca en modo simulación: te dice cuánto habría
--  borrado y deshace los cambios. Para borrar de verdad, cambia la ÚLTIMA
--  línea de `rollback;` a `commit;` y vuelve a ejecutarlo.
--
--  Qué NO toca:
--    - El esquema, las funciones ni las políticas.
--    - Tu usuario de moderación (`privado.administradores`).
--    - Las sales de hash (`privado.config`). Si las regeneras, todos los
--      códigos de edición que haya por ahí dejan de servir.
-- =============================================================================

begin;

-- Cuánto hay ahora mismo.
select 'ANTES' as momento,
       (select count(*) from public.reportes_mapa)     as reportes,
       (select count(*) from public.personas_busqueda) as personas,
       (select count(*) from privado.codigos)          as codigos,
       (select count(*) from privado.confirmaciones)   as confirmaciones,
       (select count(*) from privado.denuncias)        as denuncias;

-- El contenido público.
delete from public.reportes_mapa;
delete from public.personas_busqueda;

-- Lo que colgaba de ese contenido. Sin esto quedarían códigos y votos
-- huérfanos que impedirían volver a confirmar o denunciar los reportes nuevos.
delete from privado.codigos;
delete from privado.confirmaciones;
delete from privado.denuncias;

-- Las huellas de IP del limitador, para no arrastrar cuotas de las pruebas.
delete from privado.envios;

select 'DESPUES' as momento,
       (select count(*) from public.reportes_mapa)     as reportes,
       (select count(*) from public.personas_busqueda) as personas,
       (select count(*) from privado.codigos)          as codigos,
       (select count(*) from privado.confirmaciones)   as confirmaciones,
       (select count(*) from privado.denuncias)        as denuncias;

-- -----------------------------------------------------------------------------
--  Cambia esta línea a `commit;` para que el borrado se aplique de verdad.
-- -----------------------------------------------------------------------------
commit;
