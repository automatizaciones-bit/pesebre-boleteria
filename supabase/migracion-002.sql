-- =====================================================================
--  MIGRACIÓN 002 – Cortesías, venta en línea, arqueo de caja, anulación
--  con motivo, factura electrónica y autorización de datos.
--  Ejecutar en Supabase → SQL Editor DESPUÉS de schema.sql. Se puede
--  ejecutar más de una vez sin dañar nada.
-- =====================================================================

-- ---------- Compras: nuevas columnas --------------------------------
alter table compras add column if not exists canal text not null default 'taquilla';
alter table compras add column if not exists estado_pago text not null default 'pagado';
alter table compras add column if not exists email text;
alter table compras add column if not exists referencia_pago text;     -- # aprobación datáfono / transferencia / id Wompi
alter table compras add column if not exists autorizado_por text;      -- cortesías: admin que la autorizó
alter table compras add column if not exists motivo text;              -- cortesías: entidad / razón
alter table compras add column if not exists anulada_por text;
alter table compras add column if not exists anulada_motivo text;
alter table compras add column if not exists acepta_datos boolean not null default false;
alter table compras add column if not exists requiere_factura boolean not null default false;
alter table compras add column if not exists factura_datos jsonb;
alter table compras add column if not exists pasarela_id text;
alter table compras add column if not exists pagado_at timestamptz;

alter table compras drop constraint if exists compras_canal_check;
alter table compras add  constraint compras_canal_check check (canal in ('taquilla','cortesia','online'));
alter table compras drop constraint if exists compras_estado_pago_check;
alter table compras add  constraint compras_estado_pago_check check (estado_pago in ('pagado','pendiente','rechazado'));
alter table compras drop constraint if exists compras_metodo_pago_check;
alter table compras add  constraint compras_metodo_pago_check
  check (metodo_pago in ('efectivo','datafono','transferencia','qr','cortesia','online'));

create index if not exists compras_canal_idx on compras (canal);
create index if not exists compras_token_idx on compras (token);

-- ---------- Boletas: estado "pendiente" (compra en línea sin pagar) --
alter table boletas drop constraint if exists boletas_estado_check;
alter table boletas add  constraint boletas_estado_check check (estado in ('valida','usada','anulada','pendiente'));

-- ---------- Configuración (tope de cortesías, etc.) ------------------
create table if not exists config (
  clave      text primary key,
  valor      text not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table config enable row level security;
insert into config (clave, valor) values ('tope_cortesias', '500') on conflict (clave) do nothing;

-- ---------- Cajas (arqueo por taquilla) ------------------------------
create table if not exists cajas (
  id               bigserial primary key,
  taquilla         text not null,
  base             int  not null default 0,
  abierta_at       timestamptz not null default now(),
  cerrada_at       timestamptz,
  efectivo_sistema int,
  contado          int,
  diferencia       int,
  notas            text
);
alter table cajas enable row level security;
create unique index if not exists cajas_una_abierta on cajas (taquilla) where cerrada_at is null;

-- =====================================================================
--  crear_venta: venta de taquilla, cortesía u online (pendiente de pago)
--  Las cortesías respetan el tope de forma atómica.
-- =====================================================================
create or replace function crear_venta(p jsonb, p_boletas jsonb)
returns bigint language plpgsql as $$
declare
  v_id     bigint;
  v_canal  text := coalesce(p->>'canal', 'taquilla');
  v_pago   text := coalesce(p->>'estado_pago', 'pagado');
  v_tope   int;
  v_usadas int;
  v_nuevas int := jsonb_array_length(p_boletas);
begin
  if v_canal = 'cortesia' then
    select valor::int into v_tope from config where clave = 'tope_cortesias' for update;
    select count(*) into v_usadas
      from boletas b join compras c on c.id = b.compra_id
     where c.canal = 'cortesia' and b.estado <> 'anulada';
    if v_usadas + v_nuevas > coalesce(v_tope, 0) then
      raise exception 'TOPE_CORTESIAS: quedan % de %', greatest(coalesce(v_tope, 0) - v_usadas, 0), coalesce(v_tope, 0);
    end if;
  end if;

  insert into compras (token, cedula, nombre, celular, email, fecha_visita,
                       adultos, ninos, menores, total, metodo_pago, taquilla,
                       canal, estado_pago, referencia_pago, autorizado_por, motivo,
                       acepta_datos, requiere_factura, factura_datos, pagado_at)
  values (p->>'token', p->>'cedula', p->>'nombre', p->>'celular', nullif(p->>'email', ''),
          (p->>'fecha_visita')::date,
          (p->>'adultos')::int, (p->>'ninos')::int, (p->>'menores')::int,
          (p->>'total')::int, p->>'metodo_pago', p->>'taquilla',
          v_canal, v_pago, nullif(p->>'referencia_pago', ''), p->>'autorizado_por', nullif(p->>'motivo', ''),
          coalesce((p->>'acepta_datos')::boolean, false),
          coalesce((p->>'requiere_factura')::boolean, false),
          case when jsonb_typeof(p->'factura_datos') = 'object' then p->'factura_datos' end,
          case when v_pago = 'pagado' then now() end)
  returning id into v_id;

  insert into boletas (codigo, compra_id, tipo, precio, fecha_visita, estado)
  select b.codigo, v_id, b.tipo, b.precio, (p->>'fecha_visita')::date,
         case when v_pago = 'pagado' then 'valida' else 'pendiente' end
  from jsonb_to_recordset(p_boletas) as b(codigo text, tipo text, precio int);

  return v_id;
end $$;

-- =====================================================================
--  confirmar_pago: llamado por el webhook / la verificación de Wompi.
--  Idempotente: si llega dos veces, no hace nada la segunda.
-- =====================================================================
create or replace function confirmar_pago(p_token text, p_pasarela_id text, p_estado text, p_monto_centavos bigint)
returns jsonb language plpgsql as $$
declare c compras%rowtype;
begin
  select * into c from compras where token = p_token and canal = 'online' for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_existe'); end if;
  if c.estado_pago <> 'pendiente' then
    return jsonb_build_object('ok', true, 'estado', c.estado_pago, 'repetido', true);
  end if;

  if p_estado = 'APPROVED' then
    if p_monto_centavos <> c.total::bigint * 100 then
      return jsonb_build_object('ok', false, 'error', 'monto_no_coincide');
    end if;
    update compras set estado_pago = 'pagado', pasarela_id = p_pasarela_id,
                       referencia_pago = p_pasarela_id, pagado_at = now()
     where id = c.id;
    update boletas set estado = 'valida' where compra_id = c.id and estado = 'pendiente';
    return jsonb_build_object('ok', true, 'estado', 'pagado');
  elsif p_estado in ('DECLINED', 'VOIDED', 'ERROR') then
    update compras set estado_pago = 'rechazado', pasarela_id = p_pasarela_id where id = c.id;
    update boletas set estado = 'anulada' where compra_id = c.id and estado = 'pendiente';
    return jsonb_build_object('ok', true, 'estado', 'rechazado');
  end if;
  return jsonb_build_object('ok', true, 'estado', 'pendiente');
end $$;

-- =====================================================================
--  validar_boleta: ahora informa canal (cortesía / online) y pagos pendientes
-- =====================================================================
create or replace function validar_boleta(p_codigo text, p_puerta text)
returns jsonb language plpgsql as $$
declare
  b   boletas%rowtype;
  c   compras%rowtype;
  hoy date := (now() at time zone 'America/Bogota')::date;
  res text;
begin
  update boletas
     set estado = 'usada', usada_at = now(), puerta = p_puerta
   where codigo = p_codigo and estado = 'valida' and fecha_visita = hoy
  returning * into b;

  if found then
    res := 'ok';
  else
    select * into b from boletas where codigo = p_codigo;
    if not found then               res := 'no_existe';
    elsif b.estado = 'usada' then   res := 'usada';
    elsif b.estado = 'anulada' then res := 'anulada';
    elsif b.estado = 'pendiente' then res := 'pendiente_pago';
    elsif b.fecha_visita <> hoy then res := 'otra_fecha';
    else                            res := 'error';
    end if;
  end if;

  insert into escaneos (codigo, resultado, puerta) values (p_codigo, res, p_puerta);

  if b.compra_id is not null then
    select * into c from compras where id = b.compra_id;
  end if;

  return jsonb_build_object(
    'resultado',    res,
    'tipo',         b.tipo,
    'fecha_visita', b.fecha_visita,
    'usada_at',     b.usada_at,
    'puerta',       b.puerta,
    'nombre',       c.nombre,
    'cedula',       c.cedula,
    'canal',        c.canal,
    'motivo',       c.motivo,
    'grupo_total',  (select count(*) from boletas where compra_id = b.compra_id and estado <> 'anulada'),
    'grupo_usadas', (select count(*) from boletas where compra_id = b.compra_id and estado = 'usada')
  );
end $$;

-- =====================================================================
--  anular_compra: atómica, con responsable y motivo
-- =====================================================================
create or replace function anular_compra(p_id bigint, p_por text, p_motivo text)
returns jsonb language plpgsql as $$
declare c compras%rowtype; v_usadas int;
begin
  select * into c from compras where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'La compra no existe'); end if;
  if c.anulada then return jsonb_build_object('ok', false, 'error', 'La compra ya estaba anulada'); end if;
  select count(*) into v_usadas from boletas where compra_id = p_id and estado = 'usada';
  update compras set anulada = true, anulada_at = now(), anulada_por = p_por, anulada_motivo = p_motivo where id = p_id;
  update boletas set estado = 'anulada' where compra_id = p_id and estado in ('valida', 'pendiente');
  insert into escaneos (codigo, resultado, puerta) values ('compra:' || p_id, 'compra_anulada', p_por);
  return jsonb_build_object('ok', true, 'boletas_ya_usadas', v_usadas);
end $$;

-- =====================================================================
--  Cajas: estado, apertura y cierre (arqueo)
-- =====================================================================
create or replace function estado_caja(p_taquilla text)
returns jsonb language plpgsql stable as $$
declare k cajas%rowtype;
begin
  select * into k from cajas where taquilla = p_taquilla and cerrada_at is null;
  if not found then return jsonb_build_object('abierta', false); end if;
  return jsonb_build_object(
    'abierta', true, 'id', k.id, 'base', k.base, 'abierta_at', k.abierta_at,
    'por_metodo', (select coalesce(jsonb_object_agg(metodo_pago, jsonb_build_object('compras', n, 'total', t)), '{}'::jsonb)
                     from (select metodo_pago, count(*) n, sum(total) t from compras
                            where taquilla = p_taquilla and canal = 'taquilla' and not anulada
                              and created_at >= k.abierta_at group by metodo_pago) x),
    'boletas', (select coalesce(sum(adultos + ninos + menores), 0) from compras
                 where taquilla = p_taquilla and canal = 'taquilla' and not anulada and created_at >= k.abierta_at),
    'anuladas', (select count(*) from compras
                  where taquilla = p_taquilla and canal = 'taquilla' and anulada and created_at >= k.abierta_at)
  );
end $$;

create or replace function abrir_caja(p_taquilla text, p_base int)
returns jsonb language plpgsql as $$
begin
  if exists (select 1 from cajas where taquilla = p_taquilla and cerrada_at is null) then
    return jsonb_build_object('ok', false, 'error', 'Esta taquilla ya tiene una caja abierta');
  end if;
  insert into cajas (taquilla, base) values (p_taquilla, greatest(coalesce(p_base, 0), 0));
  return jsonb_build_object('ok', true);
end $$;

create or replace function cerrar_caja(p_taquilla text, p_contado int, p_notas text)
returns jsonb language plpgsql as $$
declare k cajas%rowtype; v_efectivo int; v_resumen jsonb;
begin
  select * into k from cajas where taquilla = p_taquilla and cerrada_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'No hay caja abierta'); end if;
  v_resumen := estado_caja(p_taquilla);
  select coalesce(sum(total), 0) into v_efectivo from compras
   where taquilla = p_taquilla and canal = 'taquilla' and metodo_pago = 'efectivo'
     and not anulada and created_at >= k.abierta_at;
  update cajas set cerrada_at = now(), efectivo_sistema = v_efectivo, contado = p_contado,
                   diferencia = p_contado - (k.base + v_efectivo), notas = p_notas
   where id = k.id returning * into k;
  return jsonb_build_object('ok', true, 'caja', to_jsonb(k), 'resumen', v_resumen);
end $$;

-- =====================================================================
--  resumen_dia: caja por taquilla, canales, cortesías, cajas, aforo
-- =====================================================================
create or replace function resumen_dia(p_fecha date)
returns jsonb language sql stable as $$
select jsonb_build_object(
  'caja', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
      select taquilla, metodo_pago, count(*) as compras,
             sum(adultos) as adultos, sum(ninos) as ninos, sum(menores) as menores,
             sum(total) as total
        from compras
       where not anulada and canal = 'taquilla'
         and (created_at at time zone 'America/Bogota')::date = p_fecha
       group by taquilla, metodo_pago
       order by taquilla, metodo_pago) t),
  'canales', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
      select canal, count(*) as compras, sum(adultos + ninos + menores) as boletas, sum(total) as total
        from compras
       where not anulada and estado_pago = 'pagado'
         and (created_at at time zone 'America/Bogota')::date = p_fecha
       group by canal order by canal) t),
  'cortesias', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
      select autorizado_por, coalesce(motivo, '(sin motivo)') as motivo, count(*) as compras,
             sum(adultos + ninos + menores) as boletas
        from compras
       where not anulada and canal = 'cortesia'
         and (created_at at time zone 'America/Bogota')::date = p_fecha
       group by 1, 2 order by 1, 2) t),
  'cortesias_tope', (select jsonb_build_object(
      'tope', (select valor::int from config where clave = 'tope_cortesias'),
      'usadas', (select count(*) from boletas b join compras c on c.id = b.compra_id
                  where c.canal = 'cortesia' and b.estado <> 'anulada'))),
  'cajas', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
      select id, taquilla, base, abierta_at, cerrada_at, efectivo_sistema, contado, diferencia, notas
        from cajas
       where (abierta_at at time zone 'America/Bogota')::date = p_fecha
          or cerrada_at is null
       order by abierta_at) t),
  'online_pendientes', (select count(*) from compras
       where canal = 'online' and estado_pago = 'pendiente' and not anulada),
  'aforo', (select jsonb_build_object(
      'total',      count(*),
      'ingresadas', count(*) filter (where estado = 'usada'),
      'pendientes', count(*) filter (where estado = 'valida'),
      'adultos',    count(*) filter (where tipo = 'adulto'),
      'ninos',      count(*) filter (where tipo = 'nino'),
      'menores',    count(*) filter (where tipo = 'menor'))
     from boletas where fecha_visita = p_fecha and estado in ('valida', 'usada')),
  'por_puerta', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
      select puerta, count(*) as ingresos from boletas
       where fecha_visita = p_fecha and estado = 'usada'
       group by puerta order by puerta) t),
  'escaneos', (select coalesce(jsonb_agg(e), '[]'::jsonb) from (
      select created_at, resultado, puerta, codigo from escaneos
       where (created_at at time zone 'America/Bogota')::date = p_fecha
       order by created_at desc limit 40) e),
  'acumulado', (select jsonb_build_object(
      'compras', count(*),
      'boletas', coalesce(sum(adultos + ninos + menores), 0),
      'total',   coalesce(sum(total), 0))
     from compras where not anulada and estado_pago = 'pagado')
) $$;

-- ---------- Permisos: sólo el servidor ------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'crear_venta(jsonb, jsonb)', 'confirmar_pago(text, text, text, bigint)', 'validar_boleta(text, text)',
    'anular_compra(bigint, text, text)', 'estado_caja(text)', 'abrir_caja(text, int)',
    'cerrar_caja(text, int, text)', 'resumen_dia(date)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
grant select, insert, update on config, cajas to service_role;
grant usage, select on sequence cajas_id_seq to service_role;
