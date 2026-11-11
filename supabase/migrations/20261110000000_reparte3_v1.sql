-- =====================================================================================
-- Reparte3 V1 · esquema completo para Supabase (Postgres + Auth + RLS + Realtime + Storage + pg_cron)
-- Aplicar UNA vez en un proyecto nuevo: SQL Editor > New query > pegar todo > Run.
-- Reemplaza el borrador de integracion/supabase/schema.sql (que nunca se ejecutó).
--
-- Seguridad: el navegador solo tiene la clave pública "anon". Todo lo que protege los datos
-- está aquí: políticas RLS por membresía y rol, y funciones SECURITY DEFINER que validan
-- cada cambio de estado de una tarea.
-- =====================================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------- perfiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 60),
  birth_date date not null,
  level text not null default 'universidad' check (level in ('universidad','colegio','instituto','otro')),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.guard_profile() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.birth_date > (current_date - interval '14 years')::date then
    raise exception 'Reparte3 es para personas de 14 años o más.' using errcode = 'P0001';
  end if;
  if new.birth_date < date '1920-01-01' then
    raise exception 'La fecha de nacimiento no es válida.' using errcode = 'P0001';
  end if;
  -- Nadie se da permisos de administrador desde la app. Solo desde el SQL Editor (auth.uid() es null).
  if auth.uid() is not null then
    new.is_admin := case when tg_op = 'INSERT' then false else old.is_admin end;
  end if;
  new.display_name := btrim(new.display_name);
  return new;
end $$;
create trigger profiles_guard before insert or update on public.profiles
  for each row execute function public.guard_profile();

-- Crea el perfil al registrarse con los datos enviados en signUp(options.data).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.raw_user_meta_data ? 'birth_date' then
    insert into public.profiles (id, display_name, birth_date, level)
    values (
      new.id,
      coalesce(nullif(btrim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1)),
      (new.raw_user_meta_data->>'birth_date')::date,
      coalesce(new.raw_user_meta_data->>'level', 'universidad')
    );
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- proyectos y membresías
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 90),
  course text not null default '' check (char_length(course) <= 60),
  due_date date,
  brief_text text check (char_length(brief_text) <= 100000),
  brief_file text check (char_length(brief_file) <= 200),
  plan text not null default 'premium' check (plan in ('gratis','premium')),  -- lanzamiento: Premium gratis
  premium_until timestamptz,
  status text not null default 'activo' check (status in ('activo','archivado')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'integrante' check (role in ('coordinador','integrante','revisor','docente')),
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index memberships_user_idx on public.memberships(user_id);

create table public.invites (
  code text primary key default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  project_id uuid not null references public.projects(id) on delete cascade,
  role text not null default 'integrante' check (role in ('integrante','revisor','docente')),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  expires_at timestamptz not null default now() + interval '14 days',
  max_uses int not null default 30 check (max_uses between 1 and 200),
  uses int not null default 0,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- tareas
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  seq int not null default 0,
  title text not null check (char_length(title) between 2 and 140),
  description text not null default '' check (char_length(description) <= 4000),
  assignee uuid references public.profiles(id) on delete set null,
  accepted boolean not null default false,
  status text not null default 'pendiente' check (status in ('pendiente','en_curso','bloqueada','en_revision','lista')),
  blocked_reason text check (char_length(blocked_reason) <= 300),
  due_date date,
  hours numeric(5,1) check (hours is null or (hours > 0 and hours <= 200)),
  depends_on uuid references public.tasks(id) on delete set null,
  source_line int,
  delivery_url text check (delivery_url is null or delivery_url ~* '^https?://'),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (depends_on is distinct from id)
);
create index tasks_project_idx on public.tasks(project_id);
create index tasks_assignee_idx on public.tasks(assignee);

-- ---------------------------------------------------------------- chat, archivos, actividad
create table public.messages (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,   -- null = chat del grupo
  author uuid references public.profiles(id) on delete set null default auth.uid(),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index messages_project_idx on public.messages(project_id, created_at desc);
create index messages_task_idx on public.messages(task_id, created_at);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  path text not null unique,
  name text not null check (char_length(name) <= 200),
  size bigint not null check (size between 0 and 10485760),
  mime text,
  uploaded_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.activity (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  actor uuid references public.profiles(id) on delete set null,
  kind text not null,
  summary text not null,
  created_at timestamptz not null default now()
);
create index activity_project_idx on public.activity(project_id, created_at desc);

-- ---------------------------------------------------------------- notificaciones
create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  actor uuid references public.profiles(id) on delete set null,
  dedupe_key text unique,
  read_at timestamptz,
  push_sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);
create index notifications_push_idx on public.notifications(created_at) where push_sent_at is null;

create table public.notification_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade default auth.uid(),
  push boolean not null default true,
  chat boolean not null default true,
  reminders boolean not null default true,
  quiet_start smallint not null default 20 check (quiet_start between 0 and 23),
  quiet_end smallint not null default 8 check (quiet_end between 0 and 23)
);

create table public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- utilidades
create or replace function public.touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger projects_touch before update on public.projects for each row execute function public.touch();
create trigger tasks_touch before update on public.tasks for each row execute function public.touch();

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false)
$$;
create or replace function public.member_role(p uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from memberships where project_id = p and user_id = auth.uid()
$$;
create or replace function public.is_member(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where project_id = p and user_id = auth.uid())
$$;
create or replace function public.can_edit(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.member_role(p) in ('coordinador','integrante','revisor'), false)
$$;
create or replace function public.is_coord(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.member_role(p) = 'coordinador', false)
$$;
create or replace function public.is_premium(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from projects where id = p and plan = 'premium' and (premium_until is null or premium_until > now()))
$$;
create or replace function public.shares_project(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships a join memberships b on a.project_id = b.project_id
    where a.user_id = auth.uid() and b.user_id = other)
$$;
create or replace function public.display_name(u uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select display_name from profiles where id = u), 'Alguien')
$$;

-- Crea una notificación respetando las preferencias. No notifica a quien hizo la acción.
create or replace function public.notify(p_user uuid, p_project uuid, p_task uuid, p_kind text,
                                         p_title text, p_body text default '', p_dedupe text default null)
returns void language plpgsql security definer set search_path = public as $$
declare pr notification_prefs;
begin
  if p_user is null or p_user = auth.uid() then return; end if;
  select * into pr from notification_prefs where user_id = p_user;
  if found then
    if p_kind in ('mensaje','comentario') and not pr.chat then return; end if;
    if p_kind in ('recordatorio','vencida','por_aceptar') and not pr.reminders then return; end if;
  end if;
  insert into notifications (user_id, project_id, task_id, kind, title, body, actor, dedupe_key)
  values (p_user, p_project, p_task, p_kind, left(p_title, 160), left(coalesce(p_body, ''), 300), auth.uid(), p_dedupe)
  on conflict (dedupe_key) do update
    set title = excluded.title, body = excluded.body, actor = excluded.actor,
        created_at = now(), read_at = null, push_sent_at = null;
end $$;

create or replace function public.notify_roles(p_project uuid, p_roles text[], p_task uuid, p_kind text,
                                               p_title text, p_body text default '')
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select user_id from memberships where project_id = p_project and role = any(p_roles) loop
    perform public.notify(r.user_id, p_project, p_task, p_kind, p_title, p_body);
  end loop;
end $$;

create or replace function public.log_activity(p_project uuid, p_task uuid, p_kind text, p_summary text)
returns void language sql security definer set search_path = public as $$
  insert into activity (project_id, task_id, actor, kind, summary) values (p_project, p_task, auth.uid(), p_kind, left(p_summary, 300))
$$;

-- ---------------------------------------------------------------- reglas sobre tareas
create or replace function public.tasks_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.seq := coalesce((select max(seq) from tasks where project_id = new.project_id), 0) + 1;
    new.accepted := new.assignee is not null and new.assignee = auth.uid();
    if auth.uid() is not null and not public.is_coord(new.project_id)
       and new.assignee is not null and new.assignee <> auth.uid() then
      raise exception 'Solo la coordinación puede asignar tareas a otras personas.' using errcode = '42501';
    end if;
  else
    if new.project_id <> old.project_id then raise exception 'No se puede mover una tarea de proyecto.'; end if;
    if new.assignee is distinct from old.assignee then
      new.accepted := new.assignee is not null and new.assignee = auth.uid();
      if new.status in ('en_curso','bloqueada') and not new.accepted then new.status := 'pendiente'; end if;
    end if;
  end if;
  if new.assignee is not null and (tg_op = 'INSERT' or new.assignee is distinct from old.assignee) and not exists (
       select 1 from memberships where project_id = new.project_id and user_id = new.assignee and role <> 'docente') then
    raise exception 'La persona asignada no es integrante del proyecto.' using errcode = 'P0001';
  end if;
  if new.depends_on is not null and not exists (select 1 from tasks where id = new.depends_on and project_id = new.project_id) then
    raise exception 'La dependencia debe ser una tarea del mismo proyecto.' using errcode = 'P0001';
  end if;
  if new.status <> 'bloqueada' then new.blocked_reason := null; end if;
  return new;
end $$;
create trigger tasks_before before insert or update on public.tasks for each row execute function public.tasks_before();

create or replace function public.tasks_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text;
begin
  select name into pname from projects where id = new.project_id;
  if new.assignee is not null and (tg_op = 'INSERT' or new.assignee is distinct from old.assignee) then
    perform public.notify(new.assignee, new.project_id, new.id, 'asignada',
      public.display_name(auth.uid()) || ' te asignó «' || new.title || '»', pname || '. Acéptala o explica por qué no puedes.');
  end if;
  if tg_op = 'UPDATE' and new.due_date is distinct from old.due_date and new.assignee is not null then
    perform public.notify(new.assignee, new.project_id, new.id, 'fecha',
      'Cambió la fecha de «' || new.title || '»',
      coalesce('Nueva fecha: ' || to_char(new.due_date, 'DD/MM'), 'Ya no tiene fecha') || '. ' || pname);
  end if;
  return new;
end $$;
create trigger tasks_after after insert or update on public.tasks for each row execute function public.tasks_after();

-- Ningún integrante puede quedar sin coordinación.
create or replace function public.guard_membership() returns trigger
language plpgsql security definer set search_path = public as $$
declare p uuid := coalesce(old.project_id, new.project_id);
begin
  if (tg_op = 'DELETE' or new.role <> 'coordinador') and old.role = 'coordinador'
     and not exists (select 1 from memberships where project_id = p and role = 'coordinador' and user_id <> old.user_id)
     and exists (select 1 from projects where id = p) then
    raise exception 'El proyecto necesita al menos una persona coordinadora. Asigna otra antes.' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    -- Si se está borrando el proyecto entero (cascada), no se tocan sus tareas.
    if exists (select 1 from projects where id = p) then
      update tasks set assignee = null where project_id = old.project_id and assignee = old.user_id and status <> 'lista';
    end if;
    return old;
  end if;
  if new.role = 'docente' then
    update tasks set assignee = null where project_id = new.project_id and assignee = new.user_id and status <> 'lista';
  end if;
  return new;
end $$;
create trigger memberships_guard before update or delete on public.memberships
  for each row execute function public.guard_membership();

-- ---------------------------------------------------------------- chat → notificaciones
create or replace function public.messages_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text; tname text; who text; r record; win text := floor(extract(epoch from now()) / 600)::text;
begin
  select name into pname from projects where id = new.project_id;
  who := public.display_name(new.author);
  if new.task_id is null then
    for r in select user_id from memberships where project_id = new.project_id and role <> 'docente' and user_id <> new.author loop
      perform public.notify(r.user_id, new.project_id, null, 'mensaje', who || ' escribió en ' || pname, new.body,
                            'chat:' || new.project_id || ':' || r.user_id || ':' || win);
    end loop;
  else
    select title into tname from tasks where id = new.task_id;
    for r in
      select distinct u from (
        select assignee as u from tasks where id = new.task_id
        union select author from messages where task_id = new.task_id
        union select user_id from memberships where project_id = new.project_id and role = 'coordinador'
      ) s where u is not null and u <> new.author
        and exists (select 1 from memberships m where m.project_id = new.project_id and m.user_id = s.u)
    loop
      perform public.notify(r.u, new.project_id, new.task_id, 'comentario', who || ' comentó en «' || tname || '»', new.body,
                            'com:' || new.task_id || ':' || r.u || ':' || win);
    end loop;
  end if;
  return new;
end $$;
create trigger messages_after after insert on public.messages for each row execute function public.messages_after();

create or replace function public.messages_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.author := auth.uid();
  new.body := btrim(new.body);
  if new.task_id is not null and not exists (select 1 from tasks where id = new.task_id and project_id = new.project_id) then
    raise exception 'La tarea no pertenece a este proyecto.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger messages_before before insert on public.messages for each row execute function public.messages_before();

-- ---------------------------------------------------------------- RPC: crear proyecto
create or replace function public.create_project(p_name text, p_course text, p_due date,
                                                 p_brief text default null, p_brief_file text default null,
                                                 p_tasks jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid; t jsonb;
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'Inicia sesión para crear un proyecto.' using errcode = '42501';
  end if;
  if (select count(*) from memberships where user_id = auth.uid() and role = 'coordinador') >= 30 then
    raise exception 'Llegaste al máximo de 30 proyectos coordinados.' using errcode = 'P0001';
  end if;
  insert into projects (name, course, due_date, brief_text, brief_file, created_by)
  values (btrim(p_name), coalesce(btrim(p_course), ''), p_due, p_brief, p_brief_file, auth.uid())
  returning id into pid;
  insert into memberships (project_id, user_id, role) values (pid, auth.uid(), 'coordinador');
  for t in select * from jsonb_array_elements(coalesce(p_tasks, '[]'::jsonb)) limit 60 loop
    insert into tasks (project_id, title, hours, due_date, source_line)
    values (pid, left(btrim(t->>'title'), 140), nullif(t->>'hours', '')::numeric,
            nullif(t->>'due_date', '')::date, nullif(t->>'source_line', '')::int);
  end loop;
  perform public.log_activity(pid, null, 'proyecto', 'Creó el proyecto.');
  return pid;
end $$;

-- ---------------------------------------------------------------- RPC: invitaciones
create or replace function public.invite_preview(p_code text)
returns table (project_id uuid, project_name text, course text, role text, members int, valid boolean, already boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.course, i.role,
         (select count(*)::int from memberships m where m.project_id = p.id),
         (not i.revoked and i.expires_at > now() and i.uses < i.max_uses and p.status = 'activo'),
         exists (select 1 from memberships m where m.project_id = p.id and m.user_id = auth.uid())
  from invites i join projects p on p.id = i.project_id
  where i.code = p_code
$$;

create or replace function public.join_project(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare i invites; pname text;
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'Inicia sesión para unirte.' using errcode = '42501';
  end if;
  select * into i from invites where code = p_code for update;
  if not found then raise exception 'El enlace de invitación no existe.' using errcode = 'P0001'; end if;
  if exists (select 1 from memberships where project_id = i.project_id and user_id = auth.uid()) then return i.project_id; end if;
  if i.revoked or i.expires_at < now() or i.uses >= i.max_uses then
    raise exception 'Este enlace ya no es válido. Pide uno nuevo a la coordinación.' using errcode = 'P0001';
  end if;
  if (select count(*) from memberships where project_id = i.project_id) >= 15 then
    raise exception 'El grupo ya tiene 15 personas, el máximo.' using errcode = 'P0001';
  end if;
  insert into memberships (project_id, user_id, role) values (i.project_id, auth.uid(), i.role);
  update invites set uses = uses + 1 where code = p_code;
  select name into pname from projects where id = i.project_id;
  perform public.notify_roles(i.project_id, array['coordinador'], null, 'miembro',
    public.display_name(auth.uid()) || ' se unió a ' || pname, 'Entró como ' || i.role || '.');
  perform public.log_activity(i.project_id, null, 'miembro', 'Se unió como ' || i.role || '.');
  return i.project_id;
end $$;

-- ---------------------------------------------------------------- RPC: acciones sobre una tarea
create or replace function public.task_action(p_task uuid, p_action text, p_note text default null, p_url text default null)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare t tasks; role text; me uuid := auth.uid(); pname text; note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into t from tasks where id = p_task for update;
  if not found then raise exception 'La tarea no existe.' using errcode = 'P0001'; end if;
  role := public.member_role(t.project_id);
  if role is null or role = 'docente' then raise exception 'No tienes permiso para cambiar esta tarea.' using errcode = '42501'; end if;
  if exists (select 1 from projects where id = t.project_id and status <> 'activo') then
    raise exception 'El proyecto está archivado.' using errcode = 'P0001';
  end if;
  select name into pname from projects where id = t.project_id;

  if p_action = 'aceptar' then
    if t.assignee is distinct from me then raise exception 'Solo la persona asignada puede aceptar.' using errcode = '42501'; end if;
    update tasks set accepted = true where id = t.id returning * into t;
    perform public.notify_roles(t.project_id, array['coordinador'], t.id, 'aceptada', public.display_name(me) || ' aceptó «' || t.title || '»', pname);
    perform public.log_activity(t.project_id, t.id, 'aceptar', 'Aceptó la tarea.');

  elsif p_action = 'rechazar' then
    if t.assignee is distinct from me then raise exception 'Solo la persona asignada puede rechazar.' using errcode = '42501'; end if;
    if note is null then raise exception 'Explica brevemente por qué no puedes tomarla.' using errcode = 'P0001'; end if;
    update tasks set assignee = null, accepted = false, status = 'pendiente' where id = t.id returning * into t;
    perform public.notify_roles(t.project_id, array['coordinador'], t.id, 'rechazada', public.display_name(me) || ' no puede tomar «' || t.title || '»', note);
    perform public.log_activity(t.project_id, t.id, 'rechazar', 'No pudo tomarla: ' || note);

  elsif p_action = 'tomar' then
    if t.assignee is not null then raise exception 'La tarea ya tiene responsable.' using errcode = 'P0001'; end if;
    update tasks set assignee = me where id = t.id returning * into t;
    perform public.notify_roles(t.project_id, array['coordinador'], t.id, 'aceptada', public.display_name(me) || ' tomó «' || t.title || '»', pname);
    perform public.log_activity(t.project_id, t.id, 'tomar', 'Tomó la tarea.');

  elsif p_action = 'iniciar' then
    if t.assignee is distinct from me or not t.accepted then raise exception 'Primero acepta la tarea.' using errcode = 'P0001'; end if;
    update tasks set status = 'en_curso' where id = t.id returning * into t;
    perform public.log_activity(t.project_id, t.id, 'iniciar', 'Empezó a trabajar.');

  elsif p_action = 'bloquear' then
    if t.assignee is distinct from me and role <> 'coordinador' then raise exception 'Solo quien la tiene o la coordinación puede marcar un bloqueo.' using errcode = '42501'; end if;
    if note is null then raise exception 'Cuenta qué te bloquea para que el grupo pueda ayudar.' using errcode = 'P0001'; end if;
    update tasks set status = 'bloqueada', blocked_reason = left(note, 300) where id = t.id returning * into t;
    perform public.notify_roles(t.project_id, array['coordinador','revisor'], t.id, 'bloqueo', '«' || t.title || '» está bloqueada', note);
    perform public.log_activity(t.project_id, t.id, 'bloquear', 'Bloqueo: ' || note);

  elsif p_action = 'desbloquear' then
    if t.assignee is distinct from me and role <> 'coordinador' then raise exception 'No tienes permiso.' using errcode = '42501'; end if;
    update tasks set status = case when accepted then 'en_curso' else 'pendiente' end where id = t.id returning * into t;
    perform public.notify(t.assignee, t.project_id, t.id, 'desbloqueo', 'Se destrabó «' || t.title || '»', coalesce(note, 'Puedes continuar.'));
    perform public.log_activity(t.project_id, t.id, 'desbloquear', 'Quitó el bloqueo.');

  elsif p_action = 'entregar' then
    if t.assignee is distinct from me then raise exception 'Solo la persona asignada puede entregar.' using errcode = '42501'; end if;
    if p_url is not null and p_url !~* '^https?://' then raise exception 'El enlace debe empezar con http:// o https://' using errcode = 'P0001'; end if;
    update tasks set status = 'en_revision', accepted = true, delivery_url = coalesce(p_url, delivery_url) where id = t.id returning * into t;
    perform public.notify_roles(t.project_id, array['revisor','coordinador'], t.id, 'entrega', public.display_name(me) || ' entregó «' || t.title || '»', 'Te toca revisarla.');
    perform public.log_activity(t.project_id, t.id, 'entregar', 'Entregó para revisión.');

  elsif p_action in ('aprobar','pedir_cambios') then
    if role not in ('revisor','coordinador') then raise exception 'Solo revisión o coordinación pueden revisar.' using errcode = '42501'; end if;
    if t.assignee = me then raise exception 'No puedes revisar tu propia entrega.' using errcode = 'P0001'; end if;
    if t.status <> 'en_revision' then raise exception 'La tarea no está en revisión.' using errcode = 'P0001'; end if;
    if p_action = 'aprobar' then
      update tasks set status = 'lista' where id = t.id returning * into t;
      perform public.notify(t.assignee, t.project_id, t.id, 'aprobada', 'Aprobaron «' || t.title || '»', coalesce(note, '¡Buen trabajo!'));
      perform public.log_activity(t.project_id, t.id, 'aprobar', 'Aprobó la entrega.');
    else
      if note is null then raise exception 'Explica qué cambios hacen falta.' using errcode = 'P0001'; end if;
      update tasks set status = 'en_curso' where id = t.id returning * into t;
      perform public.notify(t.assignee, t.project_id, t.id, 'cambios', 'Piden cambios en «' || t.title || '»', note);
      perform public.log_activity(t.project_id, t.id, 'cambios', 'Pidió cambios: ' || note);
    end if;

  elsif p_action = 'reabrir' then
    if role <> 'coordinador' then raise exception 'Solo la coordinación puede reabrir.' using errcode = '42501'; end if;
    update tasks set status = 'en_curso' where id = t.id returning * into t;
    perform public.notify(t.assignee, t.project_id, t.id, 'cambios', 'Se reabrió «' || t.title || '»', coalesce(note, ''));
    perform public.log_activity(t.project_id, t.id, 'reabrir', 'Reabrió la tarea.');
  else
    raise exception 'Acción desconocida: %', p_action using errcode = 'P0001';
  end if;
  return t;
end $$;

-- ---------------------------------------------------------------- recordatorios (pg_cron cada 15 min)
-- p_ignore_quiet solo sirve para pruebas desde el servidor; el cron la llama sin argumentos.
create or replace function public.generate_reminders(p_ignore_quiet boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'America/Lima')::date;
        h int := extract(hour from now() at time zone 'America/Lima');
        r record; n int := 0;
begin
  if not p_ignore_quiet and (h < 8 or h >= 20) then return 0; end if;   -- horario de silencio 20:00–08:00 (Lima)
  for r in
    select t.*, p.name as pname from tasks t join projects p on p.id = t.project_id
    where p.status = 'activo' and public_premium(p.id) and t.assignee is not null and t.status <> 'lista' and t.status <> 'en_revision'
  loop
    if r.due_date = today + 1 then
      perform public.notify(r.assignee, r.project_id, r.id, 'recordatorio', 'Mañana vence «' || r.title || '»', r.pname, 'due1:' || r.id || ':' || r.due_date); n := n + 1;
    elsif r.due_date = today then
      perform public.notify(r.assignee, r.project_id, r.id, 'recordatorio', 'Hoy vence «' || r.title || '»', r.pname, 'due0:' || r.id || ':' || r.due_date); n := n + 1;
    elsif r.due_date < today then
      perform public.notify(r.assignee, r.project_id, r.id, 'vencida', '«' || r.title || '» está vencida', r.pname || '. Actualiza el avance o avisa al grupo.', 'over:' || r.id || ':' || today); n := n + 1;
    end if;
    if not r.accepted and r.updated_at < now() - interval '24 hours'
       and (select count(*) from notifications where task_id = r.id and kind = 'por_aceptar') < 2 then
      perform public.notify(r.assignee, r.project_id, r.id, 'por_aceptar', 'Falta que aceptes «' || r.title || '»', r.pname, 'acc:' || r.id || ':' || today); n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- alias interno sin depender de auth.uid() (el cron no tiene sesión)
create or replace function public.public_premium(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from projects where id = p and plan = 'premium' and (premium_until is null or premium_until > now()))
$$;

-- Llama a la Edge Function send-push si hay avisos sin enviar. La URL y el secreto viven en Vault.
create or replace function public.dispatch_push() returns void
language plpgsql security definer set search_path = public as $$
declare url text; secret text;
begin
  if not exists (select 1 from notifications where push_sent_at is null and created_at > now() - interval '1 hour') then return; end if;
  select decrypted_secret into url from vault.decrypted_secrets where name = 'push_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_secret';
  if url is null or secret is null then return; end if;
  perform net.http_post(url := url, body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', secret));
end $$;

-- ---------------------------------------------------------------- administración (solo is_admin)
create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo administración.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'users', (select count(*) from profiles),
    'users_7d', (select count(*) from profiles where created_at > now() - interval '7 days'),
    'projects', (select count(*) from projects),
    'projects_active', (select count(*) from projects where status = 'activo'),
    'premium', (select count(*) from projects where plan = 'premium'),
    'tasks', (select count(*) from tasks),
    'tasks_done', (select count(*) from tasks where status = 'lista'),
    'messages_7d', (select count(*) from messages where created_at > now() - interval '7 days'),
    'push_devices', (select count(*) from push_subscriptions),
    'by_level', (select coalesce(jsonb_object_agg(level, c), '{}'::jsonb) from (select level, count(*) c from profiles group by level) s)
  );
end $$;

create or replace function public.admin_projects()
returns table (id uuid, name text, course text, plan text, premium_until timestamptz, status text,
               members int, tasks int, tasks_done int, coordinator text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo administración.' using errcode = '42501'; end if;
  return query
    select p.id, p.name, p.course, p.plan, p.premium_until, p.status,
           (select count(*)::int from memberships m where m.project_id = p.id),
           (select count(*)::int from tasks t where t.project_id = p.id),
           (select count(*)::int from tasks t where t.project_id = p.id and t.status = 'lista'),
           (select pr.display_name from memberships m join profiles pr on pr.id = m.user_id
             where m.project_id = p.id and m.role = 'coordinador' order by m.joined_at limit 1),
           p.created_at
    from projects p order by p.created_at desc limit 500;
end $$;

create or replace function public.admin_set_plan(p_project uuid, p_plan text, p_until timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo administración.' using errcode = '42501'; end if;
  update projects set plan = p_plan, premium_until = p_until where id = p_project;
end $$;

-- Solo administración cambia el plan; la coordinación edita el resto del proyecto.
create or replace function public.guard_project() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and (new.plan is distinct from old.plan or new.premium_until is distinct from old.premium_until) then
    raise exception 'El plan solo lo cambia la administración.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger projects_guard before update on public.projects for each row execute function public.guard_project();

-- Borrar la propia cuenta (derecho de supresión).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then return; end if;
  if exists (select 1 from profiles where id = auth.uid() and is_admin) then
    raise exception 'Una cuenta de administración no se borra desde la app.' using errcode = 'P0001';
  end if;
  -- Proyectos donde soy la única persona: se borran. En los demás, se libera mi lugar.
  delete from projects p where p.id in (select project_id from memberships where user_id = auth.uid())
    and (select count(*) from memberships m where m.project_id = p.id) = 1;
  update memberships m set role = 'coordinador'
    where m.user_id = (select m2.user_id from memberships m2
                       where m2.project_id = m.project_id and m2.user_id <> auth.uid() and m2.role <> 'docente'
                       order by m2.joined_at limit 1)
      and m.project_id in (select project_id from memberships where user_id = auth.uid() and role = 'coordinador')
      and not exists (select 1 from memberships x where x.project_id = m.project_id and x.role = 'coordinador' and x.user_id <> auth.uid());
  delete from memberships where user_id = auth.uid();   -- libera mis tareas abiertas antes de borrar la cuenta
  delete from auth.users where id = auth.uid();
end $$;

-- ---------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.memberships enable row level security;
alter table public.invites enable row level security;
alter table public.tasks enable row level security;
alter table public.messages enable row level security;
alter table public.files enable row level security;
alter table public.activity enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.push_subscriptions enable row level security;

create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_project(id) or public.is_admin());
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy projects_read on public.projects for select to authenticated using (public.is_member(id) or public.is_admin());
create policy projects_update on public.projects for update to authenticated using (public.is_coord(id)) with check (public.is_coord(id));
create policy projects_delete on public.projects for delete to authenticated using (public.is_coord(id));

create policy memberships_read on public.memberships for select to authenticated using (public.is_member(project_id) or public.is_admin());
create policy memberships_update on public.memberships for update to authenticated using (public.is_coord(project_id)) with check (public.is_coord(project_id));
create policy memberships_delete on public.memberships for delete to authenticated using (public.is_coord(project_id) or user_id = auth.uid());

create policy invites_read on public.invites for select to authenticated using (public.is_coord(project_id));
create policy invites_insert on public.invites for insert to authenticated with check (public.is_coord(project_id));
create policy invites_update on public.invites for update to authenticated using (public.is_coord(project_id));
create policy invites_delete on public.invites for delete to authenticated using (public.is_coord(project_id));

create policy tasks_read on public.tasks for select to authenticated using (public.is_member(project_id));
create policy tasks_insert on public.tasks for insert to authenticated with check (public.can_edit(project_id));
create policy tasks_update on public.tasks for update to authenticated using (public.is_coord(project_id)) with check (public.is_coord(project_id));
create policy tasks_delete on public.tasks for delete to authenticated using (public.is_coord(project_id));

create policy messages_read on public.messages for select to authenticated using (public.is_member(project_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (public.can_edit(project_id) and public.is_premium(project_id));
create policy messages_delete on public.messages for delete to authenticated using (author = auth.uid());

create policy files_read on public.files for select to authenticated using (public.is_member(project_id));
create policy files_insert on public.files for insert to authenticated with check (public.can_edit(project_id) and uploaded_by = auth.uid());
create policy files_delete on public.files for delete to authenticated using (uploaded_by = auth.uid() or public.is_coord(project_id));

create policy activity_read on public.activity for select to authenticated using (public.is_member(project_id));

create policy notifications_read on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy prefs_all on public.notification_prefs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_all on public.push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Funciones: nadie anónimo las ejecuta; las de cron e internas no se exponen.
revoke execute on all functions in schema public from public, anon;
grant execute on function public.create_project(text, text, date, text, text, jsonb),
  public.invite_preview(text), public.join_project(text),
  public.task_action(uuid, text, text, text), public.delete_my_account(),
  public.admin_overview(), public.admin_projects(), public.admin_set_plan(uuid, text, timestamptz),
  public.is_admin(), public.is_member(uuid), public.member_role(uuid), public.can_edit(uuid),
  public.is_coord(uuid), public.is_premium(uuid), public.shares_project(uuid)
  to authenticated;
revoke execute on function public.generate_reminders(boolean), public.dispatch_push(), public.notify(uuid, uuid, uuid, text, text, text, text),
  public.notify_roles(uuid, text[], uuid, text, text, text), public.log_activity(uuid, uuid, text, text),
  public.display_name(uuid), public.public_premium(uuid)
  from authenticated;

-- ---------------------------------------------------------------- Storage: archivos privados por proyecto
insert into storage.buckets (id, name, public, file_size_limit)
values ('archivos', 'archivos', false, 10485760)
on conflict (id) do nothing;

create policy archivos_read on storage.objects for select to authenticated
  using (bucket_id = 'archivos' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         and public.is_member(((storage.foldername(name))[1])::uuid));
create policy archivos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'archivos' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
              and public.can_edit(((storage.foldername(name))[1])::uuid));
create policy archivos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'archivos' and (owner = auth.uid()
         or ((storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and public.is_coord(((storage.foldername(name))[1])::uuid))));

-- ---------------------------------------------------------------- Realtime
alter publication supabase_realtime add table public.tasks, public.messages, public.notifications,
  public.memberships, public.projects, public.files;

-- ---------------------------------------------------------------- tareas programadas
select cron.schedule('reparte3-recordatorios', '*/15 * * * *', $$select public.generate_reminders()$$);
select cron.schedule('reparte3-push', '* * * * *', $$select public.dispatch_push()$$);
