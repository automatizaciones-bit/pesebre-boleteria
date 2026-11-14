-- =====================================================================
--  BOLETERÍA – EL GRAN PESEBRE DE TENJO 2026
--  Ejecutar completo en Supabase → SQL Editor → "Run"
-- =====================================================================

-- ---------- Compras (una por transacción en taquilla) ----------------
create table if not exists compras (
  id            bigserial primary key,
  token         text unique not null,           -- enlace público /c/<token> (WhatsApp)
  cedula        text not null,
  nombre        text not null,
  celular       text not null,
  fecha_visita  date not null,
  adultos       int  not null default 0 check (adultos >= 0),
  ninos         int  not null default 0 check (ninos >= 0),
  menores       int  not null default 0 check (menores >= 0),
  total         int  not null check (total >= 0),
  metodo_pago   text not null check (metodo_pago in ('efectivo','datafono','transferencia','qr')),
  taquilla      text not null,                  -- quién vendió (usuario de la sesión)
  anulada       boolean not null default false,
  anulada_at    timestamptz,
  -- Fase 2: factura electrónica (proveedor tecnológico)
  factura_numero text,
  factura_estado text,
  created_at    timestamptz not null default now()
);
create index if not exists compras_cedula_idx  on compras (cedula);
create index if not exists compras_celular_idx on compras (celular);
create index if not exists compras_dia_idx     on compras (((created_at at time zone 'America/Bogota')::date));

-- ---------- Boletas (una por persona, incluye menores de 6 gratis) ---
create table if not exists boletas (
  id            bigserial primary key,
  codigo        text unique not null,           -- código aleatorio (el QR lleva además la firma)
  compra_id     bigint not null references compras(id),
  tipo          text not null check (tipo in ('adulto','nino','menor')),
  precio        int  not null,
  fecha_visita  date not null,
  estado        text not null default 'valida' check (estado in ('valida','usada','anulada')),
  usada_at      timestamptz,
  puerta        text,
  created_at    timestamptz not null default now()
);
create index if not exists boletas_compra_idx on boletas (compra_id);
create index if not exists boletas_fecha_idx  on boletas (fecha_visita, estado);

-- ---------- Bitácora de escaneos ------------------------------------
create table if not exists escaneos (
  id         bigserial primary key,
  codigo     text,
  resultado  text not null,   -- ok | usada | anulada | otra_fecha | no_existe | firma_invalida
  puerta     text,
  created_at timestamptz not null default now()
);
create index if not exists escaneos_dia_idx on escaneos (((created_at at time zone 'America/Bogota')::date));

-- ---------- Seguridad: nadie entra con la llave pública -------------
alter table compras  enable row level security;
alter table boletas  enable row level security;
alter table escaneos enable row level security;
-- (sin políticas = sólo el servidor con la service_role key puede leer/escribir)

-- =====================================================================
--  crear_venta: inserta compra + boletas en UNA transacción
-- =====================================================================
create or replace function crear_venta(p jsonb, p_boletas jsonb)
returns bigint language plpgsql as $$
declare v_id bigint;
begin
  insert into compras (token, cedula, nombre, celular, fecha_visita,
                       adultos, ninos, menores, total, metodo_pago, taquilla)
  values (p->>'token', p->>'cedula', p->>'nombre', p->>'celular', (p->>'fecha_visita')::date,
          (p->>'adultos')::int, (p->>'ninos')::int, (p->>'menores')::int,
          (p->>'total')::int, p->>'metodo_pago', p->>'taquilla')
  returning id into v_id;

  insert into boletas (codigo, compra_id, tipo, precio, fecha_visita)
  select b.codigo, v_id, b.tipo, b.precio, (p->>'fecha_visita')::date
  from jsonb_to_recordset(p_boletas) as b(codigo text, tipo text, precio int);

  return v_id;
end $$;

-- =====================================================================
--  validar_boleta: marca la boleta como usada de forma ATÓMICA.
--  Si dos puertas escanean la misma boleta al mismo tiempo, sólo una pasa.
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
    if not found then            res := 'no_existe';
    elsif b.estado = 'usada' then res := 'usada';
    elsif b.estado = 'anulada' then res := 'anulada';
    elsif b.fecha_visita <> hoy then res := 'otra_fecha';
    else                          res := 'error';
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
    'grupo_total',  (select count(*) from boletas where compra_id = b.compra_id and estado <> 'anulada'),
    'grupo_usadas', (select count(*) from boletas where compra_id = b.compra_id and estado = 'usada')
  );
end $$;

-- =====================================================================
--  resumen_dia: cierre de caja (por fecha de venta) + aforo (por fecha de visita)
-- =====================================================================
create or replace function resumen_dia(p_fecha date)
returns jsonb language sql stable as $$
select jsonb_build_object(
  'caja', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
      select taquilla, metodo_pago, count(*) as compras,
             sum(adultos) as adultos, sum(ninos) as ninos, sum(menores) as menores,
             sum(total) as total
        from compras
       where not anulada and (created_at at time zone 'America/Bogota')::date = p_fecha
       group by taquilla, metodo_pago
       order by taquilla, metodo_pago) t),
  'aforo', (select jsonb_build_object(
      'total',      count(*),
      'ingresadas', count(*) filter (where estado = 'usada'),
      'pendientes', count(*) filter (where estado = 'valida'),
      'adultos',    count(*) filter (where tipo = 'adulto'),
      'ninos',      count(*) filter (where tipo = 'nino'),
      'menores',    count(*) filter (where tipo = 'menor'))
     from boletas where fecha_visita = p_fecha and estado <> 'anulada'),
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
     from compras where not anulada)
) $$;

-- Las funciones sólo las puede llamar el servidor
revoke execute on function crear_venta(jsonb, jsonb)      from public, anon, authenticated;
revoke execute on function validar_boleta(text, text)     from public, anon, authenticated;
revoke execute on function resumen_dia(date)              from public, anon, authenticated;
grant  execute on function crear_venta(jsonb, jsonb)      to service_role;
grant  execute on function validar_boleta(text, text)     to service_role;
grant  execute on function resumen_dia(date)              to service_role;
