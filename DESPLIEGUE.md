# Reparte3 V1: cómo desplegarla

Reparte3 V1 es una aplicación web para trabajos en grupo. Tiene cuentas, proyectos compartidos, chat por grupo y por tarea, notificaciones dentro de la app y en el celular, recordatorios automáticos y roles (coordinación, integrante, revisión y docente), además de un panel de administración.

| Pieza | Dónde | Costo |
|---|---|---|
| Web (React + Tailwind) | `web/`, publicada en **GitHub Pages** | Gratis |
| Base de datos, cuentas, tiempo real, archivos y tareas programadas | **Supabase** (`supabase/migrations/`) | Plan gratuito |
| Envío de notificaciones push | Edge Function `supabase/functions/send-push` | Incluida en Supabase |

> Premium está activo **gratis** en todos los grupos durante el lanzamiento. El plan se cambia por grupo desde Administración (`projects.plan`).

---

## 1. Crear el proyecto en Supabase (5 minutos)

1. Entra a <https://supabase.com>, crea una cuenta y luego **New project**.
   - **Región:** South America (São Paulo), la más cercana a Perú.
   - **Contraseña de la base:** guárdala en tu gestor de contraseñas. No se usa en la app.
2. Cuando termine, ve a **Project Settings → API** y copia:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon public key**. Es pública y puede ir en la web; la seguridad la dan las reglas RLS.
   - **Project ref**: la parte `xxxx` de la URL.
3. En **Authentication → URL Configuration**:
   - **Site URL:** `https://TU-USUARIO.github.io/reparte3/`
   - **Redirect URLs:** añade la misma URL.
4. En **Authentication → Providers → Email**:
   - Deja **Confirm email** activado si quieres que cada persona confirme su correo.
   - El correo gratuito de Supabase envía **muy pocos mensajes por hora**. Para una feria o un piloto con muchas altas seguidas, desactívalo o configura tu propio SMTP en **Authentication → SMTP Settings**.

## 2. Crear la base de datos

**Opción A, sin terminal:**
1. Abre **SQL Editor → New query**.
2. Pega todo el archivo `supabase/migrations/20261110000000_reparte3_v1.sql`.
3. Pulsa **Run**.

**Opción B, con la CLI.** Necesitas un *access token* de **Account → Access Tokens**. Guárdalo en una variable de entorno; no lo pegues en archivos del repositorio.

```bash
npx supabase@2.122.0 login
npx supabase@2.122.0 link --project-ref TU_REF
npx supabase@2.122.0 db push
```

## 3. Notificaciones push (para que lleguen con la app cerrada)

```bash
node web/scripts/gen-secrets.cjs https://TU-USUARIO.github.io/reparte3/
```

Esto crea `supabase/.secrets.local` (no se sube al repositorio) y muestra `VITE_VAPID_PUBLIC_KEY`. Luego:

```bash
npx supabase@2.122.0 secrets set --env-file supabase/.secrets.local
npx supabase@2.122.0 functions deploy send-push --no-verify-jwt
```

Por último, en el **SQL Editor**, guarda en Vault la dirección de la función y el secreto del cron. El secreto es el valor de `PUSH_CRON_SECRET` en `supabase/.secrets.local`.

```sql
select vault.create_secret('https://TU_REF.supabase.co/functions/v1/send-push', 'push_url');
select vault.create_secret('PEGA_AQUI_PUSH_CRON_SECRET', 'push_secret');
```

El cron `reparte3-push` revisa cada minuto si hay avisos nuevos y llama a la función. El cron `reparte3-recordatorios` genera los recordatorios cada 15 minutos entre las 08:00 y las 20:00, hora de Lima.

## 4. Hacerte administrador

Primero crea tu cuenta en la app. Después ejecuta esto en el **SQL Editor**:

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'TU_CORREO');
```

## 5. Publicar la web en GitHub Pages

1. Crea un repositorio (por ejemplo, `reparte3`) y sube esta carpeta. El `.gitignore` de la raíz solo deja pasar `web/`, `supabase/`, `.github/` y esta guía.
2. En **Settings → Pages**, elige **Source: GitHub Actions**.
3. En **Settings → Secrets and variables → Actions → Variables**, crea estas tres. Todas son públicas:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_VAPID_PUBLIC_KEY`
4. Haz *push* a `main`. El flujo `.github/workflows/deploy.yml` corre las pruebas, construye y publica en `https://TU-USUARIO.github.io/reparte3/`.

## 6. Comprobar que todo funciona

- [ ] Crear una cuenta (con 14 años o más) e iniciar sesión.
- [ ] Crear un proyecto subiendo un PDF o Word: se proponen tareas.
- [ ] Abrir el enlace de invitación en otro navegador con otra cuenta y unirse.
- [ ] Asignar una tarea: a la otra persona le llega un aviso en la campana.
- [ ] Escribir en el chat del grupo: el mensaje aparece al instante en la otra sesión.
- [ ] En **Ajustes → Avisos en este dispositivo → Activar**, y luego cerrar la pestaña: el siguiente mensaje llega como notificación del sistema. En iPhone, primero añade la app a la pantalla de inicio.
- [ ] Entrar con un enlace de docente: se ve todo, pero no se puede escribir ni cambiar tareas.

### Pruebas automáticas (solo en local o en un proyecto de prueba)

| Script | Qué verifica | Resultado en local, 10 nov 2026 |
|---|---|---|
| `npm test` | Detección de tareas, reparto, estados y cola de acciones | 7/7 |
| `scripts/integration.mjs` | 53 reglas: edad mínima, aislamiento entre grupos, roles, aceptar, entregar y revisar, chat y su agrupación, preferencias, archivos privados, plan, administración, recordatorios y borrado de cuenta | 53/53 |
| `scripts/ui-smoke.mjs` | Dos personas en Chrome: registro, asistente con un `.docx` real, invitación, asignación con aviso en tiempo real, chat, tema oscuro y móvil. Guarda capturas en `docs/capturas/v1/` | Sin errores |
| `scripts/push-check.mjs` | La función `send-push`: rechaza llamadas sin secreto, respeta el silencio, envía por HTTPS a un servicio push real y borra suscripciones vencidas | 4/4 |

```bash
cd web
SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/integration.mjs
```

La `service_role` **nunca** va en la web ni en el repositorio.

**No probado todavía:** un aviso push entregado de verdad a un teléfono. Esto requiere la app publicada en HTTPS y un dispositivo real. También falta probar en Safari/iPhone.

## Desarrollo local

```bash
npx supabase@2.122.0 start          # requiere Docker Desktop; aplica la migración
cd web && cp .env.example .env.local  # pega la URL y la anon key que muestra `supabase status`
npm install && npm run dev          # http://localhost:5173
```

El contacto VAPID (`VAPID_SUBJECT`) debe empezar con `https://` o `mailto:`. El generador usa la URL pública si es `https`.

## Qué es real y qué falta

- **Real:**
  - cuentas;
  - proyectos compartidos;
  - roles con permisos aplicados en la base de datos (RLS);
  - chat en tiempo real;
  - avisos en la app;
  - recordatorios programados;
  - archivos privados por grupo;
  - lectura de PDF y Word en el navegador.
- **Push con la app cerrada:** requiere completar el paso 3. En iPhone solo funciona con la app añadida a la pantalla de inicio (iOS 16.4 o posterior).
- **Detección de tareas:** es **por formato** (viñetas, numeraciones y verbos de entrega). **No usa IA.**
- **Premium:** gratis por ahora; no hay cobro conectado.
- **Política de privacidad (`#/privacidad`):** es un borrador. Debe revisarla alguien con conocimiento de la Ley 29733 antes del uso público con menores de edad.
