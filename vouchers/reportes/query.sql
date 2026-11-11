-- Semana anterior (lunes a domingo, hora Lima) + la semana previa para comparar.
-- Para otra semana, reemplaza la línea de "s" por: select date '2026-11-02' as s
with params as (
  select s, s + 6 as e from (
    select (date_trunc('week', (now() at time zone 'America/Lima'))::date - 7) as s
  ) x
),
v as (
  select (created_at at time zone 'America/Lima') as ts, tienda, promotora, premio,
         left(md5(telefono), 10) as k, acepta_datos, coalesce(unidades, 0) as u, productos
  from public.vouchers, params
  where (created_at at time zone 'America/Lima')::date between params.s - 7 and params.e
)
select json_build_object(
  'semana_inicio', (select s from params),
  'semana_fin', (select e from params),
  'meta_promotora_mes', (select meta_promotora_mes from public.panel_config where id = 1),
  'dias_activacion', (select dias_activacion from public.panel_config where id = 1),
  'vouchers', coalesce((select json_agg(json_build_object(
      'f', ts::date, 'h', extract(hour from ts)::int, 't', tienda, 'p', promotora,
      'z', premio, 'k', k, 'a', acepta_datos, 'u', u, 'pr', productos)) from v), '[]'::json),
  'stock', coalesce((select json_agg(x) from (
      select promotora as p, premio as z,
             coalesce(sum(cantidad) filter (where tipo = 'entrega'), 0) as rec,
             coalesce(sum(cantidad) filter (where tipo = 'devolucion'), 0) as dev
      from public.stock_movimientos, params where fecha <= params.e group by 1, 2) x), '[]'::json),
  'clientes_premio', coalesce((select json_agg(x) from (
      select promotora as p, premio as z, count(*) as n
      from public.vouchers, params
      where premio is not null and (created_at at time zone 'America/Lima')::date <= params.e
      group by 1, 2) x), '[]'::json),
  'inicio_campana', (select min((created_at at time zone 'America/Lima')::date) from public.vouchers),
  'total_historico', (select count(*) from public.vouchers, params
      where (created_at at time zone 'America/Lima')::date <= params.e)
) as data;
