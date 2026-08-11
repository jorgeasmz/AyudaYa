-- =============================================================================
--  Sismo Chocó: 10 de agosto de 2026
--  Esquema completo de base de datos (Supabase / PostgreSQL 15+)
-- -----------------------------------------------------------------------------
--  Cómo usarlo:
--    Supabase Dashboard -> SQL Editor -> New query -> pegar TODO -> Run.
--    Es idempotente: se puede volver a ejecutar sin romper nada.
--
--  Principios de diseño:
--    1. El navegador (rol `anon`) NO puede escribir directamente en las tablas.
--       Todas las escrituras pasan por funciones RPC `security definer` que
--       validan, limpian y aplican límite de envíos por IP.
--    2. Los códigos de edición (para que quien reporta pueda marcar su propio
--       registro) se guardan HASHEADOS en el esquema `privado`, invisible para
--       el navegador.
--    3. Las IP nunca se guardan en claro: solo un hash con sal secreta, y se
--       borran a las 24 horas. (Ley 1581 de 2012: minimización de datos.)
-- =============================================================================

begin;

-- =============================================================================
--  0. ESQUEMA PRIVADO  (nada aquí es accesible desde el navegador)
-- =============================================================================

create schema if not exists privado;

revoke all on schema privado from public;
revoke all on schema privado from anon, authenticated;


-- -----------------------------------------------------------------------------
--  0.1 Configuración secreta (sales de hash generadas al instalar)
-- -----------------------------------------------------------------------------

create table if not exists privado.config (
  clave text primary key,
  valor text not null
);

insert into privado.config (clave, valor)
values ('sal_codigos', replace(gen_random_uuid()::text, '-', '') ||
                       replace(gen_random_uuid()::text, '-', ''))
on conflict (clave) do nothing;

insert into privado.config (clave, valor)
values ('sal_ip', replace(gen_random_uuid()::text, '-', '') ||
                  replace(gen_random_uuid()::text, '-', ''))
on conflict (clave) do nothing;


-- -----------------------------------------------------------------------------
--  0.2 Administradores (allowlist explícita: ver paso 5 del README)
-- -----------------------------------------------------------------------------

create table if not exists privado.administradores (
  user_id uuid primary key,
  nota    text,
  creado_en timestamptz not null default now()
);


-- -----------------------------------------------------------------------------
--  0.3 Códigos de edición hasheados
-- -----------------------------------------------------------------------------

create table if not exists privado.codigos (
  recurso     text not null,          -- 'reporte_mapa' | 'persona'
  recurso_id  uuid not null,
  codigo_hash text not null,
  creado_en   timestamptz not null default now(),
  primary key (recurso, recurso_id)
);


-- -----------------------------------------------------------------------------
--  0.4 Registro de envíos (rate limiting) y de denuncias
-- -----------------------------------------------------------------------------

create table if not exists privado.envios (
  id        bigint generated always as identity primary key,
  huella    text not null,            -- hash(ip + sal)
  accion    text not null,
  creado_en timestamptz not null default now()
);

create index if not exists idx_envios_busqueda
  on privado.envios (accion, huella, creado_en desc);

create table if not exists privado.denuncias (
  huella     text not null,
  recurso    text not null,
  recurso_id uuid not null,
  creado_en  timestamptz not null default now(),
  primary key (huella, recurso, recurso_id)
);


-- =============================================================================
--  1. TIPOS ENUMERADOS
-- =============================================================================

do $$ begin
  create type public.tipo_reporte as enum
    ('agua','alimento','refugio','atencion_medica','via_bloqueada','rescate','otro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.estado_reporte as enum ('activo','resuelto','caducado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tipo_registro_persona as enum ('busco_a_alguien','estoy_bien');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.estado_persona as enum ('buscando','encontrado');
exception when duplicate_object then null; end $$;


-- =============================================================================
--  2. FUNCIONES AUXILIARES
-- =============================================================================

-- -----------------------------------------------------------------------------
--  2.1 Normalizar texto para búsqueda (quita tildes y pasa a minúscula).
--      IMMUTABLE para poder usarla en una columna generada y en un índice.
--      El equivalente en JS está en src/lib/formato.js -> normalizar()
-- -----------------------------------------------------------------------------

create or replace function public.normalizar_texto(p_texto text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select lower(translate(
    p_texto,
    'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
    'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'
  ));
$$;


-- -----------------------------------------------------------------------------
--  2.2 Limpiar entradas de usuario (defensa en profundidad contra XSS/spam).
--      React ya escapa al renderizar; esto protege a cualquier otro consumidor
--      (exportaciones CSV, paneles, integraciones futuras).
-- -----------------------------------------------------------------------------

create or replace function privado.limpiar_texto(p_texto text, p_max int)
returns text
language sql
immutable
as $$
  select nullif(
    left(
      btrim(
        regexp_replace(
          translate(
            -- fuera caracteres de control, '<' y '>'
            regexp_replace(coalesce(p_texto, ''), '[[:cntrl:]<>]', ' ', 'g'),
            -- fuera caracteres invisibles usados para ofuscar spam
            chr(8203) || chr(8204) || chr(8205) || chr(65279), ''
          ),
          ' {2,}', ' ', 'g'
        )
      ),
      p_max
    ),
    ''
  );
$$;


-- -----------------------------------------------------------------------------
--  2.3 Códigos de edición
--
--  El código lo genera el NAVEGADOR, no el servidor (ver src/lib/identificadores.js).
--  Es lo que permite encolar envíos sin conexión: quien reporta ya tiene su
--  código antes de que exista red, y un reintento no cambia nada porque el
--  servidor solo guarda el hash.
-- -----------------------------------------------------------------------------

-- Normaliza el código tal y como lo escriba la persona: sin guiones, en
-- mayúsculas. Devuelve NULL si no cumple el mínimo de entropía exigido.
create or replace function privado.normalizar_codigo(p_codigo text)
returns text
language sql
immutable
as $$
  select nullif(
    upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g')),
    ''
  );
$$;

create or replace function privado.hash_codigo(p_codigo text)
returns text
language sql
stable
as $$
  select encode(
    sha256(convert_to(
      upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g')) ||
      (select valor from privado.config where clave = 'sal_codigos'),
      'UTF8'
    )),
    'hex'
  );
$$;

create or replace function privado.verificar_codigo(p_recurso text, p_id uuid, p_codigo text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from privado.codigos
     where recurso = p_recurso
       and recurso_id = p_id
       and codigo_hash = privado.hash_codigo(p_codigo)
  );
$$;


-- -----------------------------------------------------------------------------
--  2.4 Huella de IP + límite de envíos
--      PostgREST expone las cabeceras HTTP en `request.headers`, así que
--      podemos limitar por IP sin necesidad de un servidor intermedio.
-- -----------------------------------------------------------------------------

create or replace function privado.huella_ip()
returns text
language plpgsql
stable
as $$
declare
  v_cab json;
  v_ip  text;
begin
  begin
    v_cab := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_cab := null;
  end;

  v_ip := coalesce(
    nullif(btrim(coalesce(v_cab ->> 'cf-connecting-ip', '')), ''),
    nullif(btrim(split_part(coalesce(v_cab ->> 'x-forwarded-for', ''), ',', 1)), ''),
    nullif(btrim(coalesce(v_cab ->> 'x-real-ip', '')), ''),
    'sin-ip'
  );

  return encode(
    sha256(convert_to(
      v_ip || (select valor from privado.config where clave = 'sal_ip'),
      'UTF8'
    )),
    'hex'
  );
end $$;


create or replace function privado.exigir_limite(
  p_accion  text,
  p_maximo  int,
  p_ventana interval,
  p_mensaje text
)
returns void
language plpgsql
as $$
declare
  v_huella text;
  v_conteo int;
begin
  v_huella := privado.huella_ip();

  -- limpieza oportunista: las huellas de IP no se guardan más de 24 h
  if random() < 0.03 then
    delete from privado.envios where creado_en < now() - interval '24 hours';
  end if;

  select count(*) into v_conteo
    from privado.envios
   where accion = p_accion
     and huella = v_huella
     and creado_en > now() - p_ventana;

  if v_conteo >= p_maximo then
    raise exception '%', p_mensaje using errcode = 'P0001';
  end if;

  insert into privado.envios (huella, accion) values (v_huella, p_accion);
end $$;


-- -----------------------------------------------------------------------------
--  2.5 ¿El usuario autenticado actual es administrador?
-- -----------------------------------------------------------------------------

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public, privado, pg_temp
as $$
  select exists (
    select 1 from privado.administradores where user_id = auth.uid()
  );
$$;


-- =============================================================================
--  3. TABLA: reportes_mapa
-- =============================================================================

create table if not exists public.reportes_mapa (
  id                  uuid primary key default gen_random_uuid(),
  tipo                public.tipo_reporte  not null,
  titulo              text not null,
  descripcion         text,
  lat                 float8 not null,
  lng                 float8 not null,
  ciudad              text not null default 'Otra',
  contacto            text,
  estado              public.estado_reporte not null default 'activo',
  verificado          boolean not null default false,
  fuente_verificacion text,
  reportes_abuso      int not null default 0,
  created_at          timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),

  constraint chk_titulo_largo
    check (char_length(titulo) between 3 and 90),
  constraint chk_descripcion_larga
    check (descripcion is null or char_length(descripcion) <= 400),
  constraint chk_contacto_largo
    check (contacto is null or char_length(contacto) <= 60),
  -- Caja delimitadora de Colombia continental + insular: rechaza coordenadas basura
  constraint chk_lat check (lat between -4.5 and 16.0),
  constraint chk_lng check (lng between -82.5 and -66.0),
  constraint chk_abuso check (reportes_abuso >= 0),
  -- Un reporte solo puede estar verificado si dice QUIÉN lo verificó
  constraint chk_verificacion check (
    (verificado = false and fuente_verificacion is null)
    or
    (verificado = true and char_length(btrim(coalesce(fuente_verificacion, ''))) >= 3)
  )
);

create index if not exists idx_reportes_estado
  on public.reportes_mapa (estado, actualizado_en desc);
create index if not exists idx_reportes_tipo
  on public.reportes_mapa (tipo);
create index if not exists idx_reportes_ciudad
  on public.reportes_mapa (ciudad);
create index if not exists idx_reportes_abuso
  on public.reportes_mapa (reportes_abuso desc, created_at desc);


-- =============================================================================
--  4. TABLA: personas_busqueda
-- =============================================================================

create table if not exists public.personas_busqueda (
  id                  uuid primary key default gen_random_uuid(),
  tipo_registro       public.tipo_registro_persona not null,
  nombre_completo     text not null,
  -- columna generada: permite búsqueda sin tildes y sin distinguir mayúsculas
  nombre_normalizado  text generated always as (public.normalizar_texto(nombre_completo)) stored,
  edad_aprox          int,
  zona_barrio         text,
  ciudad              text not null default 'Otra',
  descripcion         text,
  contacto_reportante text not null,
  estado              public.estado_persona not null default 'buscando',
  reportes_abuso      int not null default 0,
  created_at          timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),

  constraint chk_nombre_largo
    check (char_length(nombre_completo) between 3 and 80),
  constraint chk_edad
    check (edad_aprox is null or edad_aprox between 0 and 120),
  -- 80 caracteres: alcanza para "Barrio El Poblado, comuna 3", no para una dirección
  constraint chk_zona_larga
    check (zona_barrio is null or char_length(zona_barrio) <= 80),
  constraint chk_desc_persona_larga
    check (descripcion is null or char_length(descripcion) <= 400),
  constraint chk_contacto_reportante
    check (char_length(contacto_reportante) between 5 and 60),
  constraint chk_abuso_persona check (reportes_abuso >= 0)
);

create index if not exists idx_personas_estado
  on public.personas_busqueda (estado, created_at desc);
create index if not exists idx_personas_ciudad
  on public.personas_busqueda (ciudad);
create index if not exists idx_personas_tipo
  on public.personas_busqueda (tipo_registro);

-- Índice trigram para búsqueda parcial rápida por nombre.
-- Es opcional: si pg_trgm no está disponible el ILIKE sigue funcionando.
do $$
begin
  create extension if not exists pg_trgm;
  execute 'create index if not exists idx_personas_nombre_trgm
             on public.personas_busqueda using gin (nombre_normalizado gin_trgm_ops)';
exception when others then
  raise notice 'pg_trgm no disponible; se usa búsqueda secuencial (suficiente a esta escala).';
end $$;


-- =============================================================================
--  5. ROW LEVEL SECURITY + PRIVILEGIOS
-- -----------------------------------------------------------------------------
--  Supabase concede por defecto ALL a `anon` y `authenticated` sobre las tablas
--  de `public`. Lo revocamos explícitamente: `anon` solo puede LEER.
-- =============================================================================

alter table public.reportes_mapa     enable row level security;
alter table public.personas_busqueda enable row level security;

revoke all on public.reportes_mapa     from anon, authenticated;
revoke all on public.personas_busqueda from anon, authenticated;

grant select on public.reportes_mapa     to anon, authenticated;
grant select on public.personas_busqueda to anon, authenticated;

-- Solo administradores autenticados moderan (además lo exige la policy de RLS)
grant update, delete on public.reportes_mapa     to authenticated;
grant update, delete on public.personas_busqueda to authenticated;

-- --- Lectura pública -----------------------------------------------------
-- Un registro con más de 5 denuncias desaparece automáticamente de la vista
-- pública hasta que un moderador lo revise.

drop policy if exists lectura_publica_reportes on public.reportes_mapa;
create policy lectura_publica_reportes
  on public.reportes_mapa for select
  to anon, authenticated
  using (public.es_admin() or reportes_abuso <= 5);

drop policy if exists lectura_publica_personas on public.personas_busqueda;
create policy lectura_publica_personas
  on public.personas_busqueda for select
  to anon, authenticated
  using (public.es_admin() or reportes_abuso <= 5);

-- --- Moderación ----------------------------------------------------------
-- No existe policy de INSERT: el navegador NO puede insertar directamente,
-- solo a través de las funciones RPC de la sección 6.

drop policy if exists admin_actualiza_reportes on public.reportes_mapa;
create policy admin_actualiza_reportes
  on public.reportes_mapa for update
  to authenticated
  using (public.es_admin())
  with check (public.es_admin());

drop policy if exists admin_elimina_reportes on public.reportes_mapa;
create policy admin_elimina_reportes
  on public.reportes_mapa for delete
  to authenticated
  using (public.es_admin());

drop policy if exists admin_actualiza_personas on public.personas_busqueda;
create policy admin_actualiza_personas
  on public.personas_busqueda for update
  to authenticated
  using (public.es_admin())
  with check (public.es_admin());

drop policy if exists admin_elimina_personas on public.personas_busqueda;
create policy admin_elimina_personas
  on public.personas_busqueda for delete
  to authenticated
  using (public.es_admin());


-- =============================================================================
--  6. FUNCIONES RPC PÚBLICAS  (la única vía de escritura desde el navegador)
-- =============================================================================

-- -----------------------------------------------------------------------------
--  6.1 Caducar reportes con más de 48 h sin actualizar
-- -----------------------------------------------------------------------------

create or replace function public.marcar_caducados()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n int;
begin
  update public.reportes_mapa
     set estado = 'caducado'
   where estado = 'activo'
     and actualizado_en < now() - interval '48 hours';
  get diagnostics v_n = row_count;
  return v_n;
end $$;


-- -----------------------------------------------------------------------------
--  6.1.b Limpieza de versiones anteriores
--
--  `create or replace` no sustituye una función si cambia su lista de
--  argumentos: crea una sobrecarga nueva y deja la vieja viva. Como estas dos
--  cambiaron de firma al volverse idempotentes, hay que retirar las anteriores
--  o PostgREST no sabría cuál llamar.
-- -----------------------------------------------------------------------------

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as firma
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('crear_reporte_mapa', 'crear_registro_persona')
  loop
    execute format('drop function if exists %s', r.firma);
  end loop;
end $$;

drop function if exists privado.generar_codigo();


-- -----------------------------------------------------------------------------
--  6.2 Crear reporte del mapa
--
--  IDEMPOTENTE A PROPÓSITO. El navegador manda el `id` y el `codigo` que él
--  mismo generó, así que reenviar el mismo reporte no crea un duplicado.
--  Esto es lo que hace segura la cola de envíos sin conexión: si una petición
--  llega al servidor pero se pierde la respuesta (algo corriente en 3G
--  saturada), el reintento es inofensivo.
--
--  Que el cliente elija el `id` no abre ningún hueco: si el id ya existe, el
--  INSERT no hace nada y el código NO se sobrescribe, de modo que nadie puede
--  apropiarse de un reporte ajeno enviando su id con un código nuevo.
-- -----------------------------------------------------------------------------

create or replace function public.crear_reporte_mapa(
  p_id          uuid,
  p_codigo      text,
  p_tipo        text,
  p_titulo      text,
  p_lat         float8,
  p_lng         float8,
  p_ciudad      text default 'Otra',
  p_descripcion text default null,
  p_contacto    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, privado, pg_temp
as $$
declare
  v_codigo text;
  v_titulo text;
begin
  if p_id is null then
    raise exception 'Falta el identificador del reporte.' using errcode = 'P0001';
  end if;

  -- Reintento de un envío que sí había llegado: ni duplica ni gasta cuota.
  if exists (select 1 from public.reportes_mapa r where r.id = p_id) then
    return p_id;
  end if;

  v_codigo := privado.normalizar_codigo(p_codigo);
  if v_codigo is null or char_length(v_codigo) < 12 then
    raise exception 'Código de edición inválido.' using errcode = 'P0001';
  end if;

  v_titulo := privado.limpiar_texto(p_titulo, 90);
  if v_titulo is null or char_length(v_titulo) < 3 then
    raise exception 'El título debe tener al menos 3 caracteres.' using errcode = 'P0001';
  end if;

  if p_lat is null or p_lng is null then
    raise exception 'Falta marcar la ubicación en el mapa.' using errcode = 'P0001';
  end if;

  perform privado.exigir_limite(
    'reporte_mapa', 5, interval '10 minutes',
    'Has enviado varios reportes en pocos minutos. Espera un momento e inténtalo de nuevo.'
  );

  insert into public.reportes_mapa (id, tipo, titulo, descripcion, lat, lng, ciudad, contacto)
  values (
    p_id,
    p_tipo::public.tipo_reporte,
    v_titulo,
    privado.limpiar_texto(p_descripcion, 400),
    round(p_lat::numeric, 6)::float8,   -- ~11 cm de precisión: suficiente y menos bytes
    round(p_lng::numeric, 6)::float8,
    coalesce(privado.limpiar_texto(p_ciudad, 40), 'Otra'),
    privado.limpiar_texto(p_contacto, 60)
  )
  on conflict (id) do nothing;

  -- Otro reintento simultáneo ganó la carrera: su código ya está registrado.
  if not found then
    return p_id;
  end if;

  insert into privado.codigos (recurso, recurso_id, codigo_hash)
  values ('reporte_mapa', p_id, privado.hash_codigo(v_codigo))
  on conflict do nothing;

  -- Mantenimiento oportunista, para no depender de pg_cron.
  if random() < 0.1 then
    perform public.marcar_caducados();
  end if;

  return p_id;
end $$;


-- -----------------------------------------------------------------------------
--  6.2.b Sin sobrecargas
--
--  NO añadas una segunda firma de esta funcion para "arreglar" un PGRST202.
--  Hubo una que omitia `p_tipo` y lo rellenaba con 'otro': el 404 desaparecia,
--  pero la app guardaba TODOS los reportes como "Otro" sin avisar a nadie.
--  Si PostgREST no encuentra la funcion, el cliente esta mandando mal los
--  parametros: hay que arreglar el cliente, no ablandar el servidor.
--
--  `diagnostico.sql` comprueba que solo exista una firma por funcion.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
--  6.3 Quien creó un reporte lo marca como resuelto (o reactiva)
-- -----------------------------------------------------------------------------

create or replace function public.actualizar_estado_reporte(
  p_id     uuid,
  p_codigo text,
  p_estado text
)
returns void
language plpgsql
security definer
set search_path = public, privado, pg_temp
as $$
begin
  perform privado.exigir_limite(
    'estado_reporte', 20, interval '10 minutes',
    'Demasiadas operaciones seguidas. Espera un momento.'
  );

  if not privado.verificar_codigo('reporte_mapa', p_id, p_codigo) then
    raise exception 'El código no corresponde a este reporte.' using errcode = 'P0001';
  end if;

  if p_estado not in ('activo', 'resuelto') then
    raise exception 'Estado no permitido.' using errcode = 'P0001';
  end if;

  update public.reportes_mapa
     set estado = p_estado::public.estado_reporte,
         actualizado_en = now()
   where reportes_mapa.id = p_id;
end $$;


-- -----------------------------------------------------------------------------
--  6.4 Crear registro de persona
-- -----------------------------------------------------------------------------

-- Idempotente igual que `crear_reporte_mapa`: ver la explicación de la 6.2.
create or replace function public.crear_registro_persona(
  p_id                  uuid,
  p_codigo              text,
  p_tipo_registro       text,
  p_nombre_completo     text,
  p_contacto_reportante text,
  p_ciudad              text default 'Otra',
  p_edad_aprox          int  default null,
  p_zona_barrio         text default null,
  p_descripcion         text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, privado, pg_temp
as $$
declare
  v_codigo   text;
  v_nombre   text;
  v_contacto text;
begin
  if p_id is null then
    raise exception 'Falta el identificador del registro.' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.personas_busqueda p where p.id = p_id) then
    return p_id;
  end if;

  v_codigo := privado.normalizar_codigo(p_codigo);
  if v_codigo is null or char_length(v_codigo) < 12 then
    raise exception 'Código de edición inválido.' using errcode = 'P0001';
  end if;

  v_nombre := privado.limpiar_texto(p_nombre_completo, 80);
  if v_nombre is null or char_length(v_nombre) < 3 then
    raise exception 'El nombre debe tener al menos 3 caracteres.' using errcode = 'P0001';
  end if;

  v_contacto := privado.limpiar_texto(p_contacto_reportante, 60);
  if v_contacto is null or char_length(v_contacto) < 5 then
    raise exception 'Deja un teléfono o correo de contacto (mínimo 5 caracteres).'
      using errcode = 'P0001';
  end if;

  perform privado.exigir_limite(
    'registro_persona', 5, interval '10 minutes',
    'Has enviado varios registros en pocos minutos. Espera un momento e inténtalo de nuevo.'
  );

  insert into public.personas_busqueda (
    id, tipo_registro, nombre_completo, edad_aprox, zona_barrio,
    ciudad, descripcion, contacto_reportante
  )
  values (
    p_id,
    p_tipo_registro::public.tipo_registro_persona,
    v_nombre,
    p_edad_aprox,
    privado.limpiar_texto(p_zona_barrio, 80),
    coalesce(privado.limpiar_texto(p_ciudad, 40), 'Otra'),
    privado.limpiar_texto(p_descripcion, 400),
    v_contacto
  )
  on conflict (id) do nothing;

  if not found then
    return p_id;
  end if;

  insert into privado.codigos (recurso, recurso_id, codigo_hash)
  values ('persona', p_id, privado.hash_codigo(v_codigo))
  on conflict do nothing;

  return p_id;
end $$;


-- -----------------------------------------------------------------------------
--  6.5 Marcar persona como encontrada  (solo con el código de quien reportó)
--      Deja de aparecer en la búsqueda principal, pero el registro se conserva
--      para que quien la estaba buscando vea la confirmación.
-- -----------------------------------------------------------------------------

create or replace function public.marcar_persona_encontrada(
  p_id     uuid,
  p_codigo text
)
returns void
language plpgsql
security definer
set search_path = public, privado, pg_temp
as $$
begin
  perform privado.exigir_limite(
    'persona_encontrada', 20, interval '10 minutes',
    'Demasiadas operaciones seguidas. Espera un momento.'
  );

  if not privado.verificar_codigo('persona', p_id, p_codigo) then
    raise exception 'El código no corresponde a este registro.' using errcode = 'P0001';
  end if;

  update public.personas_busqueda
     set estado = 'encontrado',
         actualizado_en = now()
   where personas_busqueda.id = p_id;
end $$;


-- -----------------------------------------------------------------------------
--  6.6 Borrado definitivo por parte de quien reportó
--      (Ley 1581 de 2012, art. 8: derecho de supresión del titular.)
-- -----------------------------------------------------------------------------

create or replace function public.eliminar_registro_persona(
  p_id     uuid,
  p_codigo text
)
returns void
language plpgsql
security definer
set search_path = public, privado, pg_temp
as $$
begin
  perform privado.exigir_limite(
    'eliminar_persona', 20, interval '10 minutes',
    'Demasiadas operaciones seguidas. Espera un momento.'
  );

  if not privado.verificar_codigo('persona', p_id, p_codigo) then
    raise exception 'El código no corresponde a este registro.' using errcode = 'P0001';
  end if;

  delete from public.personas_busqueda where personas_busqueda.id = p_id;
  delete from privado.codigos where recurso = 'persona' and recurso_id = p_id;
end $$;


-- -----------------------------------------------------------------------------
--  6.7 Denunciar contenido falso / resuelto  (una vez por dispositivo-IP)
-- -----------------------------------------------------------------------------

create or replace function public.reportar_abuso(
  p_recurso text,
  p_id      uuid
)
returns int
language plpgsql
security definer
set search_path = public, privado, pg_temp
as $$
declare
  v_huella text;
  v_total  int;
begin
  if p_recurso not in ('reporte_mapa', 'persona') then
    raise exception 'Recurso no válido.' using errcode = 'P0001';
  end if;

  perform privado.exigir_limite(
    'denuncia', 20, interval '10 minutes',
    'Has enviado muchas denuncias seguidas. Espera un momento.'
  );

  v_huella := privado.huella_ip();

  -- La clave primaria impide que la misma IP infle el contador
  insert into privado.denuncias (huella, recurso, recurso_id)
  values (v_huella, p_recurso, p_id)
  on conflict do nothing;

  if not found then
    raise exception 'Ya habías reportado este contenido. Gracias.' using errcode = 'P0001';
  end if;

  if p_recurso = 'reporte_mapa' then
    update public.reportes_mapa
       set reportes_abuso = reportes_abuso + 1
     where reportes_mapa.id = p_id
    returning reportes_mapa.reportes_abuso into v_total;
  else
    update public.personas_busqueda
       set reportes_abuso = reportes_abuso + 1
     where personas_busqueda.id = p_id
    returning personas_busqueda.reportes_abuso into v_total;
  end if;

  return coalesce(v_total, 0);
end $$;


-- =============================================================================
--  7. PERMISOS DE EJECUCIÓN
-- -----------------------------------------------------------------------------
--  Por defecto PostgreSQL concede EXECUTE a PUBLIC sobre funciones nuevas.
--  Lo revocamos y concedemos solo lo estrictamente necesario.
-- =============================================================================

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as firma
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'crear_reporte_mapa', 'actualizar_estado_reporte',
         'crear_registro_persona', 'marcar_persona_encontrada',
         'eliminar_registro_persona', 'reportar_abuso',
         'marcar_caducados', 'es_admin', 'normalizar_texto'
       )
  loop
    execute format('revoke all on function %s from public', r.firma);
    execute format('grant execute on function %s to anon, authenticated', r.firma);
  end loop;
end $$;

-- `marcar_caducados` no debe poder invocarse desde el navegador: es
-- mantenimiento interno (se llama sola desde crear_reporte_mapa y desde cron).
revoke all on function public.marcar_caducados() from anon, authenticated, public;


-- =============================================================================
--  8. REALTIME
--      Hace que los reportes nuevos aparezcan sin recargar la página.
-- =============================================================================

do $$
begin
  alter publication supabase_realtime add table public.reportes_mapa;
exception
  when duplicate_object then null;   -- ya estaba en la publicación
  when undefined_object then
    raise notice 'No existe la publicación supabase_realtime (¿instalación no-Supabase?).';
end $$;

-- Realtime envía la fila completa en UPDATE/DELETE solo con REPLICA IDENTITY FULL.
-- Sin esto, al moderar un reporte los demás navegadores no verían el cambio.
alter table public.reportes_mapa replica identity full;

commit;


-- =============================================================================
--  9. TAREAS PROGRAMADAS  (OPCIONAL: requiere activar pg_cron)
-- -----------------------------------------------------------------------------
--  Dashboard -> Database -> Extensions -> activar `pg_cron`.
--  Luego ejecuta este bloque aparte. Si no lo activas, la app sigue
--  funcionando: la caducidad se calcula también en el navegador y
--  `crear_reporte_mapa` limpia de forma oportunista.
-- =============================================================================

/*
select cron.schedule(
  'caducar-reportes',
  '17 * * * *',                       -- cada hora, al minuto 17
  $$ select public.marcar_caducados(); $$
);

-- Minimización de datos (Ley 1581 de 2012): los registros de personas se
-- borran a los 90 días; los reportes caducados o resueltos, a los 30.
select cron.schedule(
  'purgar-datos-antiguos',
  '23 3 * * *',                       -- todos los días a las 03:23
  $$
    delete from public.personas_busqueda where created_at < now() - interval '90 days';
    delete from public.reportes_mapa
      where estado in ('caducado','resuelto') and actualizado_en < now() - interval '30 days';
    delete from privado.codigos where creado_en < now() - interval '90 days';
    delete from privado.denuncias where creado_en < now() - interval '90 days';
    delete from privado.envios   where creado_en < now() - interval '24 hours';
  $$
);
*/


-- =============================================================================
--  10. DAR DE ALTA AL MODERADOR  (ejecutar DESPUÉS de crear el usuario)
-- -----------------------------------------------------------------------------
--  Dashboard -> Authentication -> Users -> Add user -> "Auto Confirm User"
--  Después, cambia el correo aquí abajo y ejecuta solo estas dos líneas:
-- =============================================================================

/*
insert into privado.administradores (user_id, nota)
select id, 'moderador principal' from auth.users where email = 'TU-CORREO@ejemplo.com'
on conflict (user_id) do nothing;
*/
