-- Reparte3 V3: «centro de proyecto».
-- Todo es aditivo y compatible con V2 (columnas nuevas con valores por defecto, tablas nuevas con RLS).
--   - Proyecto: objetivo, archivo original de la consigna (visor) con versión, notas de cierre.
--   - Recursos: enlaces del proyecto (Google Docs/Sheets/Slides/Drive, PDF, web), con vínculo opcional a tarea.
--     Los enlaces que se comparten en el chat se guardan solos como recursos.
--   - Chat: mensajes fijados (coordinación).
--   - Correo al asignar: preferencia por persona y registro de envío por aviso.

-- ---------------------------------------------------------------- proyecto
alter table public.projects
  add column if not exists goal text check (char_length(goal) <= 400),
  add column if not exists brief_path text check (char_length(brief_path) <= 300),
  add column if not exists brief_mime text check (char_length(brief_mime) <= 120),
  add column if not exists brief_size bigint,
  add column if not exists brief_version int not null default 1,
  add column if not exists brief_updated_at timestamptz,
  add column if not exists closing_notes text check (char_length(closing_notes) <= 2000);

-- Cada vez que cambia el texto de la consigna sube la versión (las tareas guardan la línea de la versión con la que se crearon).
create or replace function public.projects_brief_version() returns trigger
language plpgsql as $$
begin
  if new.brief_text is distinct from old.brief_text or new.brief_path is distinct from old.brief_path then
    new.brief_version := coalesce(old.brief_version, 1) + case when old.brief_text is null and old.brief_path is null then 0 else 1 end;
    new.brief_updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists projects_brief_version on public.projects;
create trigger projects_brief_version before update on public.projects for each row execute function public.projects_brief_version();

alter table public.tasks add column if not exists brief_version int;
-- Una tarea que nace de una línea de la consigna recuerda la versión de esa consigna.
create or replace function public.tasks_brief_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.source_line is not null and new.brief_version is null then
    new.brief_version := (select brief_version from projects where id = new.project_id);
  end if;
  return new;
end $$;
drop trigger if exists tasks_brief_version on public.tasks;
create trigger tasks_brief_version before insert on public.tasks for each row execute function public.tasks_brief_version();

-- ---------------------------------------------------------------- recursos (enlaces)
create table if not exists public.project_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  url text not null check (url ~* '^https?://' and char_length(url) <= 2000),
  title text not null default '' check (char_length(title) <= 200),
  kind text not null default 'web' check (kind in ('doc','sheet','slides','form','drive','folder','pdf','video','web')),
  source text not null default 'manual' check (source in ('manual','chat','drive')),
  added_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (project_id, url)
);
create index if not exists project_links_project_idx on public.project_links(project_id, created_at desc);
alter table public.project_links enable row level security;
create policy links_read on public.project_links for select to authenticated using (public.is_member(project_id));
create policy links_insert on public.project_links for insert to authenticated
  with check (public.can_edit(project_id) and added_by = auth.uid());
create policy links_update on public.project_links for update to authenticated
  using (added_by = auth.uid() or public.is_coord(project_id)) with check (public.can_edit(project_id));
create policy links_delete on public.project_links for delete to authenticated
  using (added_by = auth.uid() or public.is_coord(project_id));

create or replace function public.link_kind(u text) returns text
language sql immutable as $$
  select case
    when u ~* 'docs\.google\.com/document' then 'doc'
    when u ~* 'docs\.google\.com/spreadsheets' then 'sheet'
    when u ~* 'docs\.google\.com/presentation' then 'slides'
    when u ~* 'docs\.google\.com/forms|forms\.gle' then 'form'
    when u ~* 'drive\.google\.com/drive/(u/\d+/)?folders' then 'folder'
    when u ~* 'drive\.google\.com' then 'drive'
    when u ~* '\.pdf($|\?|#)' then 'pdf'
    when u ~* 'youtube\.com|youtu\.be|vimeo\.com' then 'video'
    else 'web' end
$$;

create or replace function public.links_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.url := btrim(new.url);
  new.kind := public.link_kind(new.url);
  if new.task_id is not null and not exists (select 1 from tasks where id = new.task_id and project_id = new.project_id) then
    raise exception 'La tarea no pertenece a este proyecto.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists links_before on public.project_links;
create trigger links_before before insert or update on public.project_links for each row execute function public.links_before();

-- Enlaces compartidos en el chat → recursos del proyecto (sin duplicar). Máximo 5 por mensaje.
create or replace function public.messages_links() returns trigger
language plpgsql security definer set search_path = public as $$
declare m text[]; u text; n int := 0;
begin
  for m in select regexp_matches(new.body, '(https?://[^\s<>"'']+)', 'g') loop
    exit when n >= 5;
    u := regexp_replace(m[1], '[\.,;:!\?\)\]]+$', '');
    if char_length(u) <= 2000 then
      insert into project_links (project_id, task_id, url, title, source, added_by)
      values (new.project_id, new.task_id, u, '', 'chat', new.author)
      on conflict (project_id, url) do nothing;
      n := n + 1;
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists messages_links on public.messages;
create trigger messages_links after insert on public.messages for each row execute function public.messages_links();

-- ---------------------------------------------------------------- chat: mensajes fijados
alter table public.messages add column if not exists pinned boolean not null default false;
drop policy if exists messages_pin on public.messages;
create policy messages_pin on public.messages for update to authenticated
  using (public.is_coord(project_id)) with check (public.is_coord(project_id));
revoke update on public.messages from authenticated;
grant update (pinned) on public.messages to authenticated;

-- ---------------------------------------------------------------- correo al asignar
alter table public.notification_prefs add column if not exists email boolean not null default true;
alter table public.notifications add column if not exists email_sent_at timestamptz;
alter table public.notifications add column if not exists email_status text check (email_status in ('enviado','omitido','error'));
create index if not exists notifications_email_idx on public.notifications(created_at) where email_sent_at is null and kind = 'asignada';

-- Llama a la Edge Function send-email si hay asignaciones sin correo (misma idea que dispatch_push).
create or replace function public.dispatch_email() returns void
language plpgsql security definer set search_path = public as $$
declare url text; secret text;
begin
  if not exists (select 1 from notifications where kind = 'asignada' and email_sent_at is null
                 and created_at > now() - interval '2 hours' and created_at < now() - interval '45 seconds') then return; end if;
  select decrypted_secret into url from vault.decrypted_secrets where name = 'email_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_secret';
  if url is null or secret is null then return; end if;
  perform net.http_post(url := url, body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', secret));
end $$;
revoke execute on function public.dispatch_email() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('reparte3-email') where exists (select 1 from cron.job where jobname = 'reparte3-email');
    perform cron.schedule('reparte3-email', '* * * * *', 'select public.dispatch_email()');
  end if;
end $$;

-- ---------------------------------------------------------------- realtime y permisos
alter publication supabase_realtime add table public.project_links;
revoke execute on function public.messages_links(), public.links_before(), public.projects_brief_version(), public.tasks_brief_version() from public, anon, authenticated;
grant execute on function public.link_kind(text) to authenticated;
