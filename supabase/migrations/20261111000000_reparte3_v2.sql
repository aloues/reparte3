-- Reparte3 V2: sala de espera con integrantes esperados, reparto igualitario con reserva para quienes faltan,
-- asignación automática al unirse, checkpoints y datos del plan (origen IA, formato o manual).

-- ---------------------------------------------------------------- columnas nuevas
alter table public.projects
  add column if not exists expected_members int check (expected_members between 1 and 15);

alter table public.tasks
  add column if not exists reserved boolean not null default false,
  add column if not exists origin text not null default 'manual' check (origin in ('manual','formato','ia')),
  add column if not exists kind text check (kind in ('requisito','sugerencia')),
  add column if not exists phase text check (phase in ('investigacion','desarrollo','redaccion','diseno','revision','integracion','exposicion')),
  add column if not exists source_quote text check (char_length(source_quote) <= 300),
  add column if not exists done_criteria text check (char_length(done_criteria) <= 300),
  add column if not exists checkpoint_id uuid;

create table if not exists public.checkpoints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  seq int not null default 1,
  title text not null check (char_length(title) between 2 and 90),
  due_date date not null,
  created_at timestamptz not null default now()
);
create index if not exists checkpoints_project_idx on public.checkpoints(project_id, due_date);
alter table public.tasks drop constraint if exists tasks_checkpoint_fk;
alter table public.tasks add constraint tasks_checkpoint_fk foreign key (checkpoint_id) references public.checkpoints(id) on delete set null;

alter table public.checkpoints enable row level security;
create policy checkpoints_read on public.checkpoints for select to authenticated using (public.is_member(project_id));
create policy checkpoints_insert on public.checkpoints for insert to authenticated with check (public.is_coord(project_id));
create policy checkpoints_update on public.checkpoints for update to authenticated using (public.is_coord(project_id)) with check (public.is_coord(project_id));
create policy checkpoints_delete on public.checkpoints for delete to authenticated using (public.is_coord(project_id));
alter publication supabase_realtime add table public.checkpoints;

-- ---------------------------------------------------------------- asignaciones hechas por el sistema
-- Dentro de una transacción, r3.system = 'on' marca que Reparte3 (no una persona) asigna:
-- la tarea queda "por aceptar" aunque la persona asignada sea quien disparó la acción, y se le avisa.
create or replace function public.r3_system() returns boolean
language sql stable as $$ select coalesce(current_setting('r3.system', true), '') = 'on' $$;

create or replace function public.notify(p_user uuid, p_project uuid, p_task uuid, p_kind text,
                                         p_title text, p_body text default '', p_dedupe text default null)
returns void language plpgsql security definer set search_path = public as $$
declare pr notification_prefs;
begin
  if p_user is null or (p_user = auth.uid() and not public.r3_system()) then return; end if;
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

create or replace function public.tasks_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.seq := coalesce((select max(seq) from tasks where project_id = new.project_id), 0) + 1;
    new.accepted := new.assignee is not null and new.assignee = auth.uid() and not public.r3_system();
    if auth.uid() is not null and not public.is_coord(new.project_id)
       and new.assignee is not null and new.assignee <> auth.uid() then
      raise exception 'Solo la coordinación puede asignar tareas a otras personas.' using errcode = '42501';
    end if;
  else
    if new.project_id <> old.project_id then raise exception 'No se puede mover una tarea de proyecto.'; end if;
    if new.assignee is distinct from old.assignee then
      new.accepted := new.assignee is not null and new.assignee = auth.uid() and not public.r3_system();
      if new.status in ('en_curso','bloqueada') and not new.accepted then new.status := 'pendiente'; end if;
    end if;
  end if;
  if new.assignee is not null then new.reserved := false; end if;
  if new.assignee is not null and (tg_op = 'INSERT' or new.assignee is distinct from old.assignee) and not exists (
       select 1 from memberships where project_id = new.project_id and user_id = new.assignee and role <> 'docente') then
    raise exception 'La persona asignada no es integrante del proyecto.' using errcode = 'P0001';
  end if;
  if new.depends_on is not null and not exists (select 1 from tasks where id = new.depends_on and project_id = new.project_id) then
    raise exception 'La dependencia debe ser una tarea del mismo proyecto.' using errcode = 'P0001';
  end if;
  if new.checkpoint_id is not null and not exists (select 1 from checkpoints where id = new.checkpoint_id and project_id = new.project_id) then
    raise exception 'El checkpoint debe ser del mismo proyecto.' using errcode = 'P0001';
  end if;
  if new.status <> 'bloqueada' then new.blocked_reason := null; end if;
  return new;
end $$;

create or replace function public.tasks_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text;
begin
  select name into pname from projects where id = new.project_id;
  if new.assignee is not null and (tg_op = 'INSERT' or new.assignee is distinct from old.assignee) then
    if public.r3_system() then
      perform public.notify(new.assignee, new.project_id, new.id, 'asignada',
        'Te tocó «' || new.title || '»', pname || '. Reparte3 la asignó para igualar la carga del grupo. Acéptala o explica por qué no puedes.');
    else
      perform public.notify(new.assignee, new.project_id, new.id, 'asignada',
        public.display_name(auth.uid()) || ' te asignó «' || new.title || '»', pname || '. Acéptala o explica por qué no puedes.');
    end if;
  end if;
  if tg_op = 'UPDATE' and new.due_date is distinct from old.due_date and new.assignee is not null then
    perform public.notify(new.assignee, new.project_id, new.id, 'fecha',
      'Cambió la fecha de «' || new.title || '»',
      coalesce('Nueva fecha: ' || to_char(new.due_date, 'DD/MM'), 'Ya no tiene fecha') || '. ' || pname);
  end if;
  return new;
end $$;

-- Si alguien sale del grupo y el proyecto espera N integrantes, sus tareas abiertas vuelven a la reserva.
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
    if exists (select 1 from projects where id = p) then
      update tasks set assignee = null,
                       reserved = coalesce((select expected_members is not null from projects where id = p), false)
      where project_id = old.project_id and assignee = old.user_id and status <> 'lista';
    end if;
    return old;
  end if;
  if new.role = 'docente' then
    update tasks set assignee = null where project_id = new.project_id and assignee = new.user_id and status <> 'lista';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- reparto de lo reservado (interno)
create or replace function public.load_of(p_project uuid, p_user uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(coalesce(hours, 2)), 0) from tasks where project_id = p_project and assignee = p_user and status <> 'lista'
$$;

-- Le da a p_user un paquete de tareas reservadas hasta llegar a su parte (±15 %). Devuelve cuántas.
create or replace function public.assign_reserved_to(p_project uuid, p_user uuid) returns int
language plpgsql security definer set search_path = public as $$
declare pexp int; slots int; total numeric; target numeric; load numeric; r record; n int := 0;
begin
  select expected_members into pexp from projects where id = p_project;
  select count(*) into slots from memberships where project_id = p_project and role <> 'docente';
  slots := greatest(coalesce(pexp, 0), slots, 1);
  select coalesce(sum(coalesce(hours, 2)), 0) into total from tasks where project_id = p_project and status <> 'lista';
  target := total / slots;
  load := public.load_of(p_project, p_user);
  perform set_config('r3.system', 'on', true);
  for r in select id, coalesce(hours, 2) h from tasks
           where project_id = p_project and reserved and assignee is null and status <> 'lista'
           order by coalesce(hours, 2) desc, seq loop
    exit when load >= target * 0.85;
    if load = 0 or load + r.h <= target * 1.15 then
      update tasks set assignee = p_user where id = r.id;
      load := load + r.h; n := n + 1;
    end if;
  end loop;
  perform set_config('r3.system', 'off', true);
  return n;
end $$;

-- Reparte TODO lo reservado entre quienes ya están, a quien tenga menos carga. Devuelve cuántas.
create or replace function public.release_reserved_internal(p_project uuid) returns int
language plpgsql security definer set search_path = public as $$
declare r record; who uuid; n int := 0;
begin
  perform set_config('r3.system', 'on', true);
  for r in select id from tasks where project_id = p_project and reserved and assignee is null and status <> 'lista'
           order by coalesce(hours, 2) desc, seq loop
    select m.user_id into who from memberships m
      where m.project_id = p_project and m.role <> 'docente'
      order by public.load_of(p_project, m.user_id), m.joined_at limit 1;
    exit when who is null;
    update tasks set assignee = who where id = r.id;
    n := n + 1;
  end loop;
  perform set_config('r3.system', 'off', true);
  return n;
end $$;

-- ---------------------------------------------------------------- RPC: crear proyecto (con integrantes esperados)
drop function if exists public.create_project(text, text, date, text, text, jsonb);
create or replace function public.create_project(p_name text, p_course text, p_due date,
                                                 p_brief text default null, p_brief_file text default null,
                                                 p_tasks jsonb default '[]'::jsonb, p_expected int default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid; t jsonb;
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'Inicia sesión para crear un proyecto.' using errcode = '42501';
  end if;
  if (select count(*) from memberships where user_id = auth.uid() and role = 'coordinador') >= 30 then
    raise exception 'Llegaste al máximo de 30 proyectos coordinados.' using errcode = 'P0001';
  end if;
  if p_expected is not null and (p_expected < 1 or p_expected > 15) then
    raise exception 'El grupo puede tener entre 1 y 15 integrantes.' using errcode = 'P0001';
  end if;
  insert into projects (name, course, due_date, brief_text, brief_file, created_by, expected_members)
  values (btrim(p_name), coalesce(btrim(p_course), ''), p_due, p_brief, p_brief_file, auth.uid(), p_expected)
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

-- ---------------------------------------------------------------- RPC: guardar el plan confirmado
-- p_checkpoints: [{key, title, due_date, seq}]
-- p_tasks: [{key, title, description, hours, due_date, source_line, source_quote, done_criteria, kind, phase,
--            origin, checkpoint, assignee, reserved, depends}]
create or replace function public.save_plan(p_project uuid, p_checkpoints jsonb, p_tasks jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare c jsonb; t jsonb; cmap jsonb := '{}'::jsonb; tmap jsonb := '{}'::jsonb; nid uuid; n int := 0; nres int := 0;
begin
  if not public.is_coord(p_project) then raise exception 'Solo la coordinación confirma el plan.' using errcode = '42501'; end if;
  if exists (select 1 from projects where id = p_project and status <> 'activo') then
    raise exception 'El proyecto está archivado.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(coalesce(p_tasks, '[]'::jsonb)) = 0 then raise exception 'El plan no tiene tareas.' using errcode = 'P0001'; end if;
  if jsonb_array_length(coalesce(p_tasks, '[]'::jsonb)) > 60 then raise exception 'Máximo 60 tareas por plan.' using errcode = 'P0001'; end if;

  for c in select * from jsonb_array_elements(coalesce(p_checkpoints, '[]'::jsonb)) limit 6 loop
    insert into checkpoints (project_id, seq, title, due_date)
    values (p_project, coalesce((c->>'seq')::int, 1), left(btrim(c->>'title'), 90), (c->>'due_date')::date)
    returning id into nid;
    cmap := cmap || jsonb_build_object(c->>'key', nid);
  end loop;

  for t in select * from jsonb_array_elements(p_tasks) loop
    insert into tasks (project_id, title, description, hours, due_date, source_line, source_quote, done_criteria,
                       kind, phase, origin, checkpoint_id, assignee, reserved)
    values (p_project, left(btrim(t->>'title'), 140), left(coalesce(t->>'description', ''), 4000),
            nullif(t->>'hours', '')::numeric, nullif(t->>'due_date', '')::date, nullif(t->>'source_line', '')::int,
            nullif(left(t->>'source_quote', 300), ''), nullif(left(t->>'done_criteria', 300), ''),
            nullif(t->>'kind', ''), nullif(t->>'phase', ''), coalesce(nullif(t->>'origin', ''), 'manual'),
            (cmap->>(t->>'checkpoint'))::uuid, nullif(t->>'assignee', '')::uuid,
            coalesce((t->>'reserved')::boolean, false) and nullif(t->>'assignee', '') is null)
    returning id into nid;
    tmap := tmap || jsonb_build_object(t->>'key', nid);
    n := n + 1;
    if coalesce((t->>'reserved')::boolean, false) and nullif(t->>'assignee', '') is null then nres := nres + 1; end if;
  end loop;

  -- Dependencias (una por tarea en la base: la primera válida).
  for t in select * from jsonb_array_elements(p_tasks) loop
    if jsonb_typeof(t->'depends') = 'array' and jsonb_array_length(t->'depends') > 0 and tmap ? (t->'depends'->>0) then
      update tasks set depends_on = (tmap->>(t->'depends'->>0))::uuid where id = (tmap->>(t->>'key'))::uuid;
    end if;
  end loop;

  perform public.log_activity(p_project, null, 'plan',
    'Confirmó el plan: ' || n || ' tareas' || case when nres > 0 then ' (' || nres || ' reservadas para quienes faltan)' else '' end || '.');
  return n;
end $$;

-- ---------------------------------------------------------------- RPC: «Ya estamos todos»
create or replace function public.release_reserved(p_project uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_coord(p_project) then raise exception 'Solo la coordinación puede cerrar el grupo.' using errcode = '42501'; end if;
  update projects set expected_members = greatest(1, (select count(*) from memberships where project_id = p_project and role <> 'docente'))
    where id = p_project;
  n := public.release_reserved_internal(p_project);
  perform public.log_activity(p_project, null, 'plan', 'Cerró el grupo: se repartieron ' || n || ' tareas reservadas.');
  return n;
end $$;

-- ---------------------------------------------------------------- RPC: unirse (con asignación automática)
create or replace function public.join_project(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare i invites; pname text; pexp int; n int := 0; extra int := 0; cnt int;
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
  select name, expected_members into pname, pexp from projects where id = i.project_id;

  if i.role <> 'docente' then
    n := public.assign_reserved_to(i.project_id, auth.uid());
    select count(*) into cnt from memberships where project_id = i.project_id and role <> 'docente';
    if pexp is not null and cnt >= pexp then extra := public.release_reserved_internal(i.project_id); end if;
  end if;

  perform public.notify_roles(i.project_id, array['coordinador'], null, 'miembro',
    public.display_name(auth.uid()) || ' se unió a ' || pname,
    'Entró como ' || i.role || '.' || case when n > 0 then ' Recibió ' || n || ' tareas de la reserva.' else '' end
      || case when extra > 0 then ' Ya están todos: se repartieron ' || extra || ' tareas que quedaban.' else '' end);
  perform public.log_activity(i.project_id, null, 'miembro', 'Se unió como ' || i.role || '.'
    || case when n > 0 then ' Recibió ' || n || ' tareas de la reserva.' else '' end);
  return i.project_id;
end $$;

-- ---------------------------------------------------------------- permisos
revoke execute on all functions in schema public from public, anon;
grant execute on function public.create_project(text, text, date, text, text, jsonb, int),
  public.save_plan(uuid, jsonb, jsonb), public.release_reserved(uuid),
  public.invite_preview(text), public.join_project(text),
  public.task_action(uuid, text, text, text), public.delete_my_account(),
  public.admin_overview(), public.admin_projects(), public.admin_set_plan(uuid, text, timestamptz),
  public.is_admin(), public.is_member(uuid), public.member_role(uuid), public.can_edit(uuid),
  public.is_coord(uuid), public.is_premium(uuid), public.shares_project(uuid), public.r3_system()
  to authenticated;
revoke execute on function public.generate_reminders(boolean), public.dispatch_push(), public.notify(uuid, uuid, uuid, text, text, text, text),
  public.notify_roles(uuid, text[], uuid, text, text, text), public.log_activity(uuid, uuid, text, text),
  public.display_name(uuid), public.public_premium(uuid),
  public.assign_reserved_to(uuid, uuid), public.release_reserved_internal(uuid), public.load_of(uuid, uuid)
  from authenticated;
