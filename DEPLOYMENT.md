# Despliegue de PlatoPlan (web) en Vercel

PlatoPlan es una app Expo (SDK 57) con `react-native-web`. La web se exporta como
un sitio estático (SPA) con `expo export -p web`, que genera la carpeta `dist/`.

## 1. Requisitos previos

- Cuenta en [Vercel](https://vercel.com) y en [Supabase](https://supabase.com).
- El repositorio conectado a Vercel (Git) o el CLI de Vercel instalado.

## 2. Configurar Supabase (producción)

El esquema ya está definido en `supabase/migrations/` con **Row Level Security (RLS)**
activado en todas las tablas y políticas por usuario (`auth.uid() = user_id`), así que
cada usuario solo ve sus propios datos.

1. Crea un proyecto nuevo en Supabase.
2. Aplica las migraciones (una de estas opciones):
   - **Supabase CLI:** `supabase link --project-ref <ref>` y luego `supabase db push`.
   - **Manual:** abre el SQL Editor del panel y ejecuta, en orden, el contenido de:
     1. `supabase/migrations/20240101000000_initial_schema.sql`
     2. `supabase/migrations/20240102000000_add_plan_servings.sql`
     3. `supabase/migrations/20260829000000_plan_names_and_notes.sql`
3. En **Authentication → Providers**, habilita Email (y Google si vas a usar OAuth).
4. **Configura las URLs de redirección (imprescindible para el login con Google en web).**
   En **Authentication → URL Configuration**:
   - **Site URL:** `https://plato-plan.vercel.app` (tu dominio real).
   - **Redirect URLs:** añade todas las que uses, una por línea:
     - `https://plato-plan.vercel.app`
     - `https://plato-plan.vercel.app/**`
     - `http://localhost:8081` (para desarrollo web local)

   > La app pide volver a `window.location.origin` tras el login de Google. Si ese
   > origen no está en la lista de Redirect URLs, Supabase ignora la redirección y
   > la pantalla de login vuelve a aparecer.
   > En el proveedor de Google (Google Cloud Console) recuerda también añadir la
   > **Authorized redirect URI** de Supabase:
   > `https://<tu-proyecto>.supabase.co/auth/v1/callback`.
5. Copia de **Project Settings → API**:
   - `Project URL` → `EXPO_PUBLIC_SUPABASE_URL`
   - `anon public` key → `EXPO_PUBLIC_SUPABASE_ANON_KEY`

> La clave `anon` es pública por diseño; la seguridad la garantiza RLS. **Nunca**
> pongas la `service_role` key en el cliente.

## 3. Variables de entorno en Vercel

En Vercel → Project → **Settings → Environment Variables**, añade (para Production y Preview):

| Nombre | Valor |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | `https://<tu-proyecto>.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `<tu-anon-key>` |

El prefijo `EXPO_PUBLIC_` es obligatorio para que Expo las incruste en el bundle web.

## 4. Configuración de build (ya incluida)

- `vercel.json` fija el build y el redireccionamiento SPA:
  - `buildCommand`: `expo export -p web`
  - `outputDirectory`: `dist`
  - `rewrites`: todas las rutas → `/` (necesario para una SPA).
- `package.json` incluye el script `build:web` (`expo export -p web`).

Si despliegas por Git, Vercel detectará `vercel.json` automáticamente. Si usas el CLI:

```sh
npm install --global vercel@latest
vercel        # primer deploy (preview)
vercel --prod # a producción
```

## 5. SEO y favicon

- El `<head>` (título, descripción, Open Graph, Twitter, favicon, `theme-color`,
  `lang="es"`) está en `public/index.html`, que Expo usa como plantilla del SPA.
- `public/favicon.png` y `public/og-image.png` se copian a `dist/` en el export.
- `public/robots.txt` y `public/sitemap.xml` también se sirven en la raíz.

> **Nota sobre SEO:** al ser una SPA con render en cliente (`web.output: "single"`),
> el HTML inicial contiene las meta tags pero no el contenido de la app. Google
> ejecuta JavaScript y puede indexarla, pero para un SEO fuerte de contenido haría
> falta render estático/servidor (requiere migrar a Expo Router). Las meta tags,
> Open Graph y favicon sí funcionan para compartir enlaces y para la pestaña del
> navegador. Recuerda cambiar el dominio de ejemplo `platoplan.vercel.app` en
> `public/robots.txt` y `public/sitemap.xml` por tu dominio real.

## 6. Probar el build en local

```sh
npm run build:web   # genera dist/
npx expo serve      # sirve dist/ en http://localhost:8081
```
