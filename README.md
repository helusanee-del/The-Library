# Fichero Digital — Biblioteca Escolar

Gestión del catálogo de una biblioteca escolar: libros, códigos QR y respaldo
en Excel, con los datos en la nube (Supabase) y acceso por roles.

## Stack

Sitio estático, sin build ni dependencias que instalar. Todo son tres archivos
en la raíz y librerías por CDN:

| | |
|---|---|
| `index.html` / `style.css` / `java.js` | la aplicación completa |
| [Supabase](https://supabase.com) | base de datos Postgres + autenticación |
| qrcodejs | genera los códigos QR |
| jsQR | los lee desde la cámara |
| SheetJS (xlsx) | exporta e importa Excel |

## Roles

| | Catálogo | Escanear | Generar QR | Exportar | Crear/Editar/Borrar | Importar | Usuarios |
|---|---|---|---|---|---|---|---|
| **admin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **usuario** | ✅ | ✅ | ✅ | ✅ | — | — | — |

Quien se registra entra siempre como `usuario`. Solo un administrador puede
ascender a otro, desde la pestaña **Usuarios**.

Ocultar botones es comodidad, no seguridad: los permisos de verdad los aplica
Postgres con Row Level Security (ver `db/supabase_schema.sql`). Aunque alguien
manipule el JavaScript desde la consola del navegador, la base de datos rechaza
la escritura.

## Puesta en marcha

### 1. Base de datos

En Supabase → **SQL Editor**, ejecuta `db/supabase_schema.sql` completo. Es
idempotente: puede volver a correrse sin romper nada.

Crea la tabla `libros`, la tabla `perfiles`, el trigger que asigna rol a cada
usuario nuevo, la función `es_admin()` y las políticas RLS.

### 2. Autenticación

**Authentication → Sign In / Providers → Email**: habilitado.

Durante el desarrollo conviene desactivar *Confirm email* (el SMTP gratuito de
Supabase solo envía unos 2 correos por hora y bloquea las pruebas). Para uso
real, reactívalo y configura un SMTP propio en
**Project Settings → Authentication → SMTP**.

### 3. El primer administrador

El trigger da rol `usuario` a todo el mundo, incluido el primero. Regístrate en
la app y luego, en el SQL Editor:

```sql
update public.perfiles set rol = 'admin' where email = 'TU-CORREO-REAL@ejemplo.com';
```

Debe responder `UPDATE 1`. Si dice `UPDATE 0`, el correo no coincide; compruébalo con:

```sql
select email, rol from public.perfiles order by rol, email;
```

A partir de ahí, los demás roles se gestionan desde la pestaña **Usuarios**.

## Desarrollo local

La cámara del escáner QR **solo funciona en `https://` o `localhost`**. Abrir
`index.html` con doble clic (`file://`) la deja bloqueada, así que hay que servir
la carpeta:

```bash
npx serve .            # o la extensión Live Server de VS Code
```

El puerto **3000** es el más cómodo: coincide con el *Site URL* que Supabase trae
por defecto, así que los enlaces de confirmación y de recuperación de contraseña
redirigen bien sin tocar nada.

## Despliegue

El sitio es estático: sirve cualquier hosting con HTTPS (Vercel, Netlify,
GitHub Pages). Con Vercel basta con importar el repositorio; no hay build.

**Después del primer despliegue**, en Supabase →
**Authentication → URL Configuration**, pon la URL de producción en *Site URL* y
añádela a *Redirect URLs*. Si no, los enlaces de correo seguirán apuntando a
`localhost` y no funcionarán para nadie.

`.vercelignore` deja fuera del sitio publicado `db/` y este README.

### Sobre la clave de Supabase

La `anon key` está en `java.js` a propósito: está diseñada para ser pública y no
da ningún permiso por sí sola; todo lo filtra RLS. La que **nunca** debe aparecer
en el repositorio es la `service_role`, que salta todas las políticas.

## Limitaciones conocidas

- **`estado` y `disponibles` son independientes**: nada impide guardar 5
  ejemplares disponibles y estado "Prestado" a la vez.
- **No hay registro de préstamos**: se sabe cuántos ejemplares faltan, pero no
  quién los tiene ni desde cuándo. Haría falta una tabla `prestamos`.
- **El registro está abierto**: cualquiera con la URL puede crearse una cuenta y
  consultar el catálogo (no modificarlo). Para cerrarlo, desactiva *Allow new
  users to sign up* en Supabase y crea tú las cuentas a mano.
