-- =====================================================================
--  Registro de Vouchers · Proyecto Sodimac (Afix)
--  Ejecutar UNA vez en Supabase → SQL Editor → New query → Run
-- =====================================================================

-- 1) Tabla de administradores (solo estos correos pueden ver registros)
create table if not exists public.admin_emails (
  email text primary key
);
alter table public.admin_emails enable row level security;
-- Nadie la lee desde la web; solo se usa dentro de las políticas.

-- >>> CAMBIA ESTE CORREO por el tuyo (y agrega más si hace falta)
insert into public.admin_emails (email) values ('tnickbryan2@gmail.com')
on conflict do nothing;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.admin_emails
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- 2) Tabla principal de vouchers
create table if not exists public.vouchers (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  tienda      text not null check (char_length(tienda) between 2 and 80),
  promotora   text not null check (char_length(promotora) between 2 and 80),
  nombre      text not null check (char_length(nombre) between 2 and 60),
  apellido    text not null check (char_length(apellido) between 2 and 60),
  telefono    text not null check (telefono ~ '^9[0-9]{8}$'),
  foto_path   text check (char_length(foto_path) between 5 and 200),  -- opcional: null = registrado sin foto
  dispositivo text,
  acepta_datos boolean not null default false
);

create index if not exists vouchers_created_idx  on public.vouchers (created_at desc);
create index if not exists vouchers_tienda_idx   on public.vouchers (tienda);
create index if not exists vouchers_telefono_idx on public.vouchers (telefono);

alter table public.vouchers enable row level security;

-- Promotoras (sin login): SOLO pueden insertar. No pueden leer, editar ni borrar.
drop policy if exists "promotoras insertan" on public.vouchers;
create policy "promotoras insertan"
  on public.vouchers for insert
  to anon, authenticated
  with check (acepta_datos = true);   -- exige el check de consentimiento

-- Admin: puede leer y borrar
drop policy if exists "admin lee" on public.vouchers;
create policy "admin lee"
  on public.vouchers for select
  to authenticated
  using (public.is_admin());

drop policy if exists "admin borra" on public.vouchers;
create policy "admin borra"
  on public.vouchers for delete
  to authenticated
  using (public.is_admin());

-- 3) Bucket privado para las fotos de los vouchers (máx. 5 MB, solo imágenes)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vouchers', 'vouchers', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "promotoras suben fotos" on storage.objects;
create policy "promotoras suben fotos"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'vouchers');

drop policy if exists "admin ve fotos" on storage.objects;
create policy "admin ve fotos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'vouchers' and public.is_admin());

drop policy if exists "admin borra fotos" on storage.objects;
create policy "admin borra fotos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'vouchers' and public.is_admin());

-- Migración 2026-11-24: la foto del voucher pasa a ser opcional
alter table public.vouchers alter column foto_path drop not null;

-- Migración 2026-11-25: rol "lector" (solo lectura de Registros, Indicadores y Stock premios)
create table if not exists public.panel_lectores (email text primary key, creado_at timestamptz not null default now());
alter table public.panel_lectores enable row level security;
create or replace function private.is_lector() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.panel_lectores where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
create or replace function public.mi_rol() returns text language sql stable security definer set search_path = public as $$
  select case when private.is_admin() then 'admin' when private.is_lector() then 'lector' else null end;
$$;
revoke all on function public.mi_rol() from public, anon;
grant execute on function public.mi_rol() to authenticated;
create policy "lector lee vouchers" on public.vouchers for select to authenticated using (private.is_lector());
create policy "lector lee giros" on public.ruleta_giros for select to authenticated using (private.is_lector());
create policy "lector lee stock" on public.stock_movimientos for select to authenticated using (private.is_lector());
create policy "lector lee config" on public.panel_config for select to authenticated using (private.is_lector());
create policy "lector ve fotos" on storage.objects for select to authenticated using (bucket_id = 'vouchers' and private.is_lector());
-- Para dar acceso de solo lectura: crear el usuario en Authentication y luego
-- insert into public.panel_lectores (email) values ('correo@empresa.com');
