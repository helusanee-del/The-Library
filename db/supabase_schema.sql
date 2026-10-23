-- =====================================================
-- FICHERO DIGITAL — Biblioteca escolar
-- Esquema completo con autenticación y dos roles:
--   admin   -> puede crear, editar y eliminar libros
--   usuario -> solo puede consultar el catálogo
--
-- Ejecuta TODO este archivo en Supabase > SQL Editor.
-- Es idempotente: puedes volver a correrlo sin romper nada.
-- =====================================================


-- ---------- 1. CATÁLOGO ----------
create table if not exists libros (
  id bigint generated always as identity primary key,
  codigo text not null unique,
  titulo text not null,
  autor text not null,
  categoria text,
  editorial text,
  anio integer,
  ubicacion text,
  estado text not null default 'Disponible',
  cantidad integer not null default 1,
  disponibles integer not null default 1,
  created_at timestamptz not null default now()
);


-- ---------- 2. PERFILES (quién es quién) ----------
-- Una fila por usuario registrado. Guarda el rol.
create table if not exists perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  rol text not null default 'usuario' check (rol in ('admin','usuario')),
  created_at timestamptz not null default now()
);

-- Al registrarse un usuario nuevo se le crea el perfil con rol 'usuario'.
create or replace function public.crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, email, rol)
  values (new.id, new.email, 'usuario')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.crear_perfil();

-- Perfiles para los usuarios que ya existieran antes de este cambio.
insert into public.perfiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;


-- ---------- 3. ¿EL USUARIO ACTUAL ES ADMIN? ----------
-- security definer: la función NO vuelve a pasar por RLS.
-- Sin esto, una política de "perfiles" que consulte "perfiles" se llama
-- a sí misma en bucle y Postgres aborta la consulta.
create or replace function public.es_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol = 'admin'
  );
$$;

-- Postgres otorga execute a PUBLIC por defecto, así que primero se quita:
-- es una función security definer y no tiene por qué alcanzarla un visitante.
revoke execute on function public.es_admin() from public, anon;
grant  execute on function public.es_admin() to authenticated;


-- ---------- 4. RLS: QUIÉN PUEDE HACER QUÉ ----------
alter table libros   enable row level security;
alter table perfiles enable row level security;

-- Fuera la política abierta de la etapa de pruebas.
drop policy if exists "Acceso temporal total" on libros;

drop policy if exists "libros: leer autenticados"  on libros;
drop policy if exists "libros: insertar admin"     on libros;
drop policy if exists "libros: actualizar admin"   on libros;
drop policy if exists "libros: eliminar admin"     on libros;

-- Cualquiera que haya iniciado sesión puede CONSULTAR el catálogo.
create policy "libros: leer autenticados" on libros
  for select to authenticated
  using (true);

-- Solo el admin ESCRIBE. Se separa por operación porque insert usa
-- "with check" (fila nueva) y delete usa "using" (fila existente).
create policy "libros: insertar admin" on libros
  for insert to authenticated
  with check (public.es_admin());

create policy "libros: actualizar admin" on libros
  for update to authenticated
  using (public.es_admin())
  with check (public.es_admin());

create policy "libros: eliminar admin" on libros
  for delete to authenticated
  using (public.es_admin());

drop policy if exists "perfiles: ver el propio"     on perfiles;
drop policy if exists "perfiles: admin cambia rol"  on perfiles;

-- Cada uno ve su perfil; el admin ve todos (para administrar roles).
create policy "perfiles: ver el propio" on perfiles
  for select to authenticated
  using (id = auth.uid() or public.es_admin());

-- Nadie puede ascenderse a sí mismo: solo un admin cambia roles.
create policy "perfiles: admin cambia rol" on perfiles
  for update to authenticated
  using (public.es_admin())
  with check (public.es_admin());

-- Nota: el rol "anon" (visitante sin sesión) no tiene ninguna política,
-- así que no puede leer ni escribir nada. La anon key del JS ya no basta.


-- ---------- 5. CREAR EL PRIMER ADMIN ----------
-- El trigger da rol 'usuario' a todo el mundo, incluido el primero.
-- Regístrate en la app y luego ejecuta esta línea con TU correo:
--
--   update public.perfiles set rol = 'admin' where email = 'tu-correo@ejemplo.com';
--
-- Para ver quién es quién:
--   select email, rol from public.perfiles order by rol, email;
