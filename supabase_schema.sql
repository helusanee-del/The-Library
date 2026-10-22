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

alter table libros enable row level security;

-- Política TEMPORAL: permite leer/escribir a cualquiera que tenga la anon key.
-- Esto es solo para probar la conexión. En el paso de autenticación
-- la reemplazamos por reglas reales (por ejemplo: solo usuarios logueados).
create policy "Acceso temporal total" on libros
  for all
  using (true)
  with check (true);
