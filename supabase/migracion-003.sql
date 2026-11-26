-- =====================================================================
--  MIGRACIÓN 003 – QR por grupo, Nequi/Bancolombia/Daviplata,
--  verificación de pagos, cierres de caja con cajero, correo y resumen.
--  Ejecutar DESPUÉS de migracion-002.sql. Se puede ejecutar varias veces.
-- =====================================================================

-- ---------- Compras ---------------------------------------------------
alter table compras add column if not exists codigo text;               -- código del QR de grupo
alter table compras add column if not exists verificacion text not null default 'no_aplica';
alter table compras add column if not exists comprobante_path text;     -- foto del comprobante (Storage)
alter table compras add column if not exists verificado_por text;
alter table compras add column if not exists verificado_at timestamptz;
alter table compras add column if not exists email_enviado_at timestamptz;
alter table compras add column if not exists whatsapp_enviado_at timestamptz;

-- Código de grupo para compras anteriores (mismo alfabeto que la app: sin I, O, 0, 1)
update compras c
   set codigo = (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
                   from generate_series(1, 10) where c.id is not null)
 where codigo is null;
create unique index if not exists compras_codigo_uidx on compras (codigo);

alter table compras drop constraint if exists compras_verificacion_check;
alter table compras add  constraint compras_verificacion_check
  check (verificacion in ('no_aplica','pendiente','verificado','rechazado'));
alter table compras drop constraint if exists compras_metodo_pago_check;
alter table compras add  constraint compras_metodo_pago_check
  check (metodo_pago in ('efectivo','datafono','nequi','bancolombia','daviplata','transferencia','qr','cortesia','online'));
create index if not exists compras_verificacion_idx on compras (verificacion) where verificacion = 'pendiente';

-- ---------- Cajas: quién la maneja, a qué correo y foto del cierre ---
alter table cajas add column if not exists cajero text;
alter table cajas add column if not exists email text;
alter table cajas add column if not exists resumen jsonb;

-- ---------- Storage privado para fotos de comprobantes (sólo Supabase)
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('comprobantes', 'comprobantes', false)
    on conflict (id) do nothing;
  end if;
end $$;

-- =====================================================================
--  crear_venta: ahora guarda el código de grupo y si el pago se verifica
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

  insert into compras (token, codigo, cedula, nombre, celular, email, fecha_visita,
                       adultos, ninos, menores, total, metodo_pago, taquilla,
                       canal, estado_pago, referencia_pago, autorizado_por, motivo,
                       acepta_datos, requiere_factura, factura_datos, pagado_at, verificacion)
  values (p->>'token', p->>'codigo', p->>'cedula', p->>'nombre', p->>'celular', nullif(p->>'email', ''),
          (p->>'fecha_visita')::date,
          (p->>'adultos')::int, (p->>'ninos')::int, (p->>'menores')::int,
          (p->>'total')::int, p->>'metodo_pago', p->>'taquilla',
          v_canal, v_pago, nullif(p->>'referencia_pago', ''), p->>'autorizado_por', nullif(p->>'motivo', ''),
          coalesce((p->>'acepta_datos')::boolean, false),
          coalesce((p->>'requiere_factura')::boolean, false),
          case when jsonb_typeof(p->'factura_datos') = 'object' then p->'factura_datos' end,
          case when v_pago = 'pagado' then now() end,
          coalesce(p->>'verificacion', 'no_aplica'))
  returning id into v_id;

  insert into boletas (codigo, compra_id, tipo, precio, fecha_visita, estado)
  select b.codigo, v_id, b.tipo, b.precio, (p->>'fecha_visita')::date,
         case when v_pago = 'pagado' then 'valida' else 'pendiente' end
  from jsonb_to_recordset(p_boletas) as b(codigo text, tipo text, precio int);

  return v_id;
end $$;

-- =====================================================================
--  validar_grupo: UN QR por compra. El grupo entra COMPLETO en un solo
--  escaneo; la fila de la compra se bloquea para que dos puertas no lo
--  dejen pasar dos veces.
-- =====================================================================
create or replace function validar_grupo(p_codigo text, p_puerta text)
returns jsonb language plpgsql as $$
declare
  c        compras%rowtype;
  hoy      date := (now() at time zone 'America/Bogota')::date;
  n        int := 0;
  res      text;
  v_total  int;
  v_usadas int;
  v_ultima timestamptz;
  v_puerta text;
begin
  select * into c from compras where codigo = p_codigo for update;
  if not found then
    res := 'no_existe';
  else
    update boletas set estado = 'usada', usada_at = now(), puerta = p_puerta
     where compra_id = c.id and estado = 'valida' and fecha_visita = hoy;
    get diagnostics n = row_count;
    if n > 0 then                         res := 'ok';
    elsif c.anulada then                  res := 'anulada';
    elsif c.estado_pago = 'pendiente' then res := 'pendiente_pago';
    elsif c.estado_pago = 'rechazado' then res := 'anulada';
    elsif c.fecha_visita <> hoy then      res := 'otra_fecha';
    elsif exists (select 1 from boletas where compra_id = c.id and estado = 'usada') then res := 'usada';
    else                                  res := 'error';
    end if;
  end if;

  insert into escaneos (codigo, resultado, puerta) values ('G' || p_codigo, res, p_puerta);
  if c.id is null then return jsonb_build_object('resultado', res, 'grupo', true); end if;

  select count(*) filter (where estado <> 'anulada'), count(*) filter (where estado = 'usada'), max(usada_at)
    into v_total, v_usadas, v_ultima
    from boletas where compra_id = c.id;
  select puerta into v_puerta from boletas
   where compra_id = c.id and estado = 'usada' order by usada_at desc limit 1;

  return jsonb_build_object(
    'resultado', res, 'grupo', true, 'ingresaron_ahora', n,
    'nombre', c.nombre, 'cedula', c.cedula, 'canal', c.canal, 'motivo', c.motivo,
    'fecha_visita', c.fecha_visita, 'adultos', c.adultos, 'ninos', c.ninos, 'menores', c.menores,
    'grupo_total', v_total, 'grupo_usadas', v_usadas, 'usada_at', v_ultima, 'puerta', v_puerta,
    'verificacion', c.verificacion, 'metodo_pago', c.metodo_pago
  );
end $$;

-- =====================================================================
--  Verificación de pagos (Nequi, Bancolombia, Daviplata, otro banco)
-- =====================================================================
create or replace function verificar_pago(p_id bigint, p_ok boolean, p_por text, p_motivo text)
returns jsonb language plpgsql as $$
declare c compras%rowtype;
begin
  select * into c from compras where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'La compra no existe'); end if;
  if c.verificacion <> 'pendiente' then
    return jsonb_build_object('ok', false, 'error', 'Esa compra ya fue revisada (' || c.verificacion || ')');
  end if;
  update compras set verificacion = case when p_ok then 'verificado' else 'rechazado' end,
                     verificado_por = p_por, verificado_at = now()
   where id = p_id;
  if not p_ok then
    perform anular_compra(p_id, p_por, coalesce(nullif(p_motivo, ''), 'Pago no verificado'));
  end if;
  return jsonb_build_object('ok', true, 'verificacion', case when p_ok then 'verificado' else 'rechazado' end);
end $$;

-- =====================================================================
--  Cajas: apertura con cajero y correo; estado y cierre detallados
-- =====================================================================
create or replace function abrir_caja(p_taquilla text, p_base int, p_cajero text, p_email text)
returns jsonb language plpgsql as $$
begin
  if exists (select 1 from cajas where taquilla = p_taquilla and cerrada_at is null) then
    return jsonb_build_object('ok', false, 'error', 'Esta taquilla ya tiene una caja abierta');
  end if;
  insert into cajas (taquilla, base, cajero, email)
  values (p_taquilla, greatest(coalesce(p_base, 0), 0), nullif(trim(p_cajero), ''), nullif(lower(trim(p_email)), ''));
  return jsonb_build_object('ok', true);
end $$;

create or replace function estado_caja(p_taquilla text)
returns jsonb language plpgsql stable as $$
declare k cajas%rowtype;
begin
  select * into k from cajas where taquilla = p_taquilla and cerrada_at is null;
  if not found then return jsonb_build_object('abierta', false); end if;
  return jsonb_build_object(
    'abierta', true, 'id', k.id, 'base', k.base, 'abierta_at', k.abierta_at,
    'cajero', k.cajero, 'email', k.email,
    'por_metodo', (select coalesce(jsonb_object_agg(metodo_pago, jsonb_build_object('compras', n, 'total', t, 'boletas', b)), '{}'::jsonb)
                     from (select metodo_pago, count(*) n, sum(total) t, sum(adultos + ninos + menores) b from compras
                            where taquilla = p_taquilla and canal = 'taquilla' and not anulada
                              and created_at >= k.abierta_at group by metodo_pago) x),
    'boletas', (select coalesce(sum(adultos + ninos + menores), 0) from compras
                 where taquilla = p_taquilla and canal = 'taquilla' and not anulada and created_at >= k.abierta_at),
    'por_tipo', (select jsonb_build_object('adultos', coalesce(sum(adultos), 0), 'ninos', coalesce(sum(ninos), 0), 'menores', coalesce(sum(menores), 0))
                  from compras where taquilla = p_taquilla and canal = 'taquilla' and not anulada and created_at >= k.abierta_at),
    'total', (select coalesce(sum(total), 0) from compras
               where taquilla = p_taquilla and canal = 'taquilla' and not anulada and created_at >= k.abierta_at),
    'compras', (select count(*) from compras
                 where taquilla = p_taquilla and canal = 'taquilla' and not anulada and created_at >= k.abierta_at),
    'anuladas', (select count(*) from compras
                  where taquilla = p_taquilla and canal = 'taquilla' and anulada and created_at >= k.abierta_at),
    'anuladas_total', (select coalesce(sum(total), 0) from compras
                  where taquilla = p_taquilla and canal = 'taquilla' and anulada and created_at >= k.abierta_at),
    'por_verificar', (select jsonb_build_object('compras', count(*), 'total', coalesce(sum(total), 0)) from compras
                  where taquilla = p_taquilla and canal = 'taquilla' and not anulada and verificacion = 'pendiente'
                    and created_at >= k.abierta_at),
    'primera_venta', (select min(created_at) from compras where taquilla = p_taquilla and canal = 'taquilla' and created_at >= k.abierta_at),
    'ultima_venta', (select max(created_at) from compras where taquilla = p_taquilla and canal = 'taquilla' and created_at >= k.abierta_at)
  );
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
                   diferencia = p_contado - (k.base + v_efectivo), notas = p_notas, resumen = v_resumen
   where id = k.id returning * into k;
  return jsonb_build_object('ok', true, 'caja', to_jsonb(k), 'resumen', v_resumen);
end $$;

-- =====================================================================
--  resumen_dia: agrega pagos por verificar y cierres con su detalle
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
  'metodos', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
      select metodo_pago, count(*) as compras, sum(adultos + ninos + menores) as boletas, sum(total) as total
        from compras
       where not anulada and estado_pago = 'pagado' and canal <> 'cortesia'
         and (created_at at time zone 'America/Bogota')::date = p_fecha
       group by metodo_pago order by sum(total) desc) t),
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
  'por_verificar', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
      select id, created_at, taquilla, metodo_pago, referencia_pago, total, nombre, cedula,
             (comprobante_path is not null) as tiene_foto
        from compras where verificacion = 'pendiente' and not anulada
       order by created_at limit 200) t),
  'cajas', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
      select id, taquilla, cajero, email, base, abierta_at, cerrada_at, efectivo_sistema, contado, diferencia, notas, resumen
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
  'grupos', (select jsonb_build_object(
      'total', count(*),
      'ingresados', count(*) filter (where exists (select 1 from boletas b where b.compra_id = c.id and b.estado = 'usada')))
     from compras c where c.fecha_visita = p_fecha and not c.anulada and c.estado_pago = 'pagado'),
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

-- Historial de cierres de una taquilla
create or replace function cierres_taquilla(p_taquilla text, p_limite int)
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(t), '[]'::jsonb) from (
    select id, taquilla, cajero, email, base, abierta_at, cerrada_at, efectivo_sistema, contado, diferencia, notas, resumen
      from cajas where taquilla = p_taquilla and cerrada_at is not null
     order by cerrada_at desc limit least(greatest(p_limite, 1), 50)) t
$$;

-- ---------- Permisos: sólo el servidor ------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'crear_venta(jsonb, jsonb)', 'validar_grupo(text, text)', 'verificar_pago(bigint, boolean, text, text)',
    'abrir_caja(text, int, text, text)', 'estado_caja(text)', 'cerrar_caja(text, int, text)',
    'resumen_dia(date)', 'cierres_taquilla(text, int)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
