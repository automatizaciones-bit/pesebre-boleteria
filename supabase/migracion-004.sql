-- =====================================================================
--  El Gran Pesebre de Tenjo 2026 · Migración 004
--  · Usuarios individuales (vendedor / portero / admin) con clave propia
--  · Modo CAPACITACIÓN: los datos de práctica quedan marcados (prueba = true)
--    y NUNCA se mezclan con los reales: reportes, caja, portería y aforo
--    filtran por ambiente. Se borran con borrar_capacitacion().
--  Se puede ejecutar varias veces sin dañar nada.
-- =====================================================================

-- ---------- Usuarios --------------------------------------------------
create table if not exists usuarios (
  id             bigserial primary key,
  nombre         text not null,
  clave_hash     text not null,
  rol            text not null default 'vendedor' check (rol in ('vendedor', 'portero', 'admin')),
  prueba         boolean not null default false,       -- usuario de capacitación
  activo         boolean not null default true,
  celular        text,
  creado_por     text,
  created_at     timestamptz not null default now(),
  ultimo_ingreso timestamptz
);
create unique index if not exists usuarios_nombre_idx on usuarios (lower(nombre));
alter table usuarios enable row level security;

-- ---------- Marca de ambiente (real / capacitación) ----------------------
alter table compras  add column if not exists prueba boolean not null default false;
alter table boletas  add column if not exists prueba boolean not null default false;
alter table cajas    add column if not exists prueba boolean not null default false;
alter table escaneos add column if not exists prueba boolean not null default false;
create index if not exists compras_prueba_idx on compras (prueba) where prueba;
create index if not exists boletas_prueba_idx on boletas (prueba) where prueba;

-- ---------- crear_venta: guarda el ambiente; el tope sólo cuenta cortesías reales
create or replace function crear_venta(p jsonb, p_boletas jsonb)
returns bigint language plpgsql as $$
declare
  v_id     bigint;
  v_canal  text := coalesce(p->>'canal', 'taquilla');
  v_pago   text := coalesce(p->>'estado_pago', 'pagado');
  v_prueba boolean := coalesce((p->>'prueba')::boolean, false);
  v_tope   int;
  v_usadas int;
  v_nuevas int := jsonb_array_length(p_boletas);
begin
  if v_canal = 'cortesia' and not v_prueba then
    select valor::int into v_tope from config where clave = 'tope_cortesias' for update;
    select count(*) into v_usadas
      from boletas b join compras c on c.id = b.compra_id
     where c.canal = 'cortesia' and b.estado <> 'anulada' and not c.prueba;
    if v_usadas + v_nuevas > coalesce(v_tope, 0) then
      raise exception 'TOPE_CORTESIAS: quedan % de %', greatest(coalesce(v_tope, 0) - v_usadas, 0), coalesce(v_tope, 0);
    end if;
  end if;

  insert into compras (token, codigo, cedula, nombre, celular, email, fecha_visita,
                       adultos, ninos, menores, total, metodo_pago, taquilla,
                       canal, estado_pago, referencia_pago, autorizado_por, motivo,
                       acepta_datos, requiere_factura, factura_datos, pagado_at, verificacion, prueba)
  values (p->>'token', p->>'codigo', p->>'cedula', p->>'nombre', p->>'celular', nullif(p->>'email', ''),
          (p->>'fecha_visita')::date,
          (p->>'adultos')::int, (p->>'ninos')::int, (p->>'menores')::int,
          (p->>'total')::int, p->>'metodo_pago', p->>'taquilla',
          v_canal, v_pago, nullif(p->>'referencia_pago', ''), p->>'autorizado_por', nullif(p->>'motivo', ''),
          coalesce((p->>'acepta_datos')::boolean, false),
          coalesce((p->>'requiere_factura')::boolean, false),
          case when jsonb_typeof(p->'factura_datos') = 'object' then p->'factura_datos' end,
          case when v_pago = 'pagado' then now() end,
          coalesce(p->>'verificacion', 'no_aplica'), v_prueba)
  returning id into v_id;

  insert into boletas (codigo, compra_id, tipo, precio, fecha_visita, estado, prueba)
  select b.codigo, v_id, b.tipo, b.precio, (p->>'fecha_visita')::date,
         case when v_pago = 'pagado' then 'valida' else 'pendiente' end, v_prueba
  from jsonb_to_recordset(p_boletas) as b(codigo text, tipo text, precio int);

  return v_id;
end $$;

-- ---------- validar_grupo: un QR de capacitación no sirve en la portería real (ni al revés)
create or replace function validar_grupo(p_codigo text, p_puerta text, p_prueba boolean)
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
  elsif c.prueba <> coalesce(p_prueba, false) then
    res := case when c.prueba then 'es_prueba' else 'es_real' end;   -- no se toca nada
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

  insert into escaneos (codigo, resultado, puerta, prueba) values ('G' || p_codigo, res, p_puerta, coalesce(p_prueba, false));
  if c.id is null then return jsonb_build_object('resultado', res, 'grupo', true); end if;
  if res in ('es_prueba', 'es_real') then
    return jsonb_build_object('resultado', res, 'grupo', true, 'nombre', c.nombre);
  end if;

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
    'verificacion', c.verificacion, 'metodo_pago', c.metodo_pago, 'prueba', c.prueba
  );
end $$;

-- ---------- resumen_dia por ambiente ------------------------------------
create or replace function resumen_dia(p_fecha date, p_prueba boolean)
returns jsonb language sql stable as $$
select jsonb_build_object(
  'prueba', p_prueba,
  'caja', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
      select taquilla, metodo_pago, count(*) as compras,
             sum(adultos) as adultos, sum(ninos) as ninos, sum(menores) as menores,
             sum(total) as total
        from compras
       where not anulada and canal = 'taquilla' and prueba = p_prueba
         and (created_at at time zone 'America/Bogota')::date = p_fecha
       group by taquilla, metodo_pago
       order by taquilla, metodo_pago) t),
  'metodos', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
      select metodo_pago, count(*) as compras, sum(adultos + ninos + menores) as boletas, sum(total) as total
        from compras
       where not anulada and estado_pago = 'pagado' and canal <> 'cortesia' and prueba = p_prueba
         and (created_at at time zone 'America/Bogota')::date = p_fecha
       group by metodo_pago order by sum(total) desc) t),
  'canales', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
      select canal, count(*) as compras, sum(adultos + ninos + menores) as boletas, sum(total) as total
        from compras
       where not anulada and estado_pago = 'pagado' and prueba = p_prueba
         and (created_at at time zone 'America/Bogota')::date = p_fecha
       group by canal order by canal) t),
  'cortesias', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
      select autorizado_por, coalesce(motivo, '(sin motivo)') as motivo, count(*) as compras,
             sum(adultos + ninos + menores) as boletas
        from compras
       where not anulada and canal = 'cortesia' and prueba = p_prueba
         and (created_at at time zone 'America/Bogota')::date = p_fecha
       group by 1, 2 order by 1, 2) t),
  'cortesias_tope', (select jsonb_build_object(
      'tope', (select valor::int from config where clave = 'tope_cortesias'),
      'usadas', (select count(*) from boletas b join compras c on c.id = b.compra_id
                  where c.canal = 'cortesia' and b.estado <> 'anulada' and not c.prueba))),
  'por_verificar', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
      select id, created_at, taquilla, metodo_pago, referencia_pago, total, nombre, cedula,
             (comprobante_path is not null) as tiene_foto
        from compras where verificacion = 'pendiente' and not anulada and prueba = p_prueba
       order by created_at limit 200) t),
  'cajas', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
      select id, taquilla, cajero, email, base, abierta_at, cerrada_at, efectivo_sistema, contado, diferencia, notas, resumen
        from cajas
       where prueba = p_prueba
         and ((abierta_at at time zone 'America/Bogota')::date = p_fecha or cerrada_at is null)
       order by abierta_at) t),
  'online_pendientes', (select count(*) from compras
       where canal = 'online' and estado_pago = 'pendiente' and not anulada and prueba = p_prueba),
  'aforo', (select jsonb_build_object(
      'total',      count(*),
      'ingresadas', count(*) filter (where estado = 'usada'),
      'pendientes', count(*) filter (where estado = 'valida'),
      'adultos',    count(*) filter (where tipo = 'adulto'),
      'ninos',      count(*) filter (where tipo = 'nino'),
      'menores',    count(*) filter (where tipo = 'menor'))
     from boletas where fecha_visita = p_fecha and estado in ('valida', 'usada') and prueba = p_prueba),
  'grupos', (select jsonb_build_object(
      'total', count(*),
      'ingresados', count(*) filter (where exists (select 1 from boletas b where b.compra_id = c.id and b.estado = 'usada')))
     from compras c where c.fecha_visita = p_fecha and not c.anulada and c.estado_pago = 'pagado' and c.prueba = p_prueba),
  'por_puerta', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
      select puerta, count(*) as ingresos from boletas
       where fecha_visita = p_fecha and estado = 'usada' and prueba = p_prueba
       group by puerta order by puerta) t),
  'escaneos', (select coalesce(jsonb_agg(e), '[]'::jsonb) from (
      select created_at, resultado, puerta, codigo from escaneos
       where (created_at at time zone 'America/Bogota')::date = p_fecha and prueba = p_prueba
       order by created_at desc limit 40) e),
  'acumulado', (select jsonb_build_object(
      'compras', count(*),
      'boletas', coalesce(sum(adultos + ninos + menores), 0),
      'total',   coalesce(sum(total), 0))
     from compras where not anulada and estado_pago = 'pagado' and prueba = p_prueba)
) $$;

-- ---------- Compatibilidad: las versiones anteriores siguen funcionando (ambiente real)
create or replace function validar_grupo(p_codigo text, p_puerta text)
returns jsonb language sql as $$ select validar_grupo(p_codigo, p_puerta, false) $$;
create or replace function resumen_dia(p_fecha date)
returns jsonb language sql stable as $$ select resumen_dia(p_fecha, false) $$;

-- ---------- Borrar TODO lo de capacitación (nunca toca datos reales) -----
create or replace function borrar_capacitacion()
returns jsonb language plpgsql as $$
declare e int; b int; c int; k int;
begin
  delete from escaneos where prueba;                 get diagnostics e = row_count;
  delete from boletas  where prueba or compra_id in (select id from compras where prueba);
                                                     get diagnostics b = row_count;
  delete from compras  where prueba;                 get diagnostics c = row_count;
  delete from cajas    where prueba;                 get diagnostics k = row_count;
  return jsonb_build_object('ok', true, 'compras', c, 'boletas', b, 'escaneos', e, 'cajas', k);
end $$;

-- ---------- Permisos: sólo el servidor ------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'crear_venta(jsonb, jsonb)', 'validar_grupo(text, text, boolean)', 'resumen_dia(date, boolean)',
    'validar_grupo(text, text)', 'resumen_dia(date)',
    'borrar_capacitacion()']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
