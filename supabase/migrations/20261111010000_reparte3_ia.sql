-- Reparte3 V2: registro de uso de la IA (Edge Function analizar-consigna).
-- Sirve para limitar el gasto (por proyecto y por mes) y para medir el costo real por análisis.
-- Solo la Edge Function (service_role) lee y escribe; nadie más tiene políticas.
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  project_id uuid references public.projects(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  ms int,
  ok boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_project_idx on public.ai_usage(project_id, created_at desc);
create index if not exists ai_usage_created_idx on public.ai_usage(created_at desc);
alter table public.ai_usage enable row level security;

-- Panel de administración: análisis con IA del mes y tokens usados.
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
    'by_level', (select coalesce(jsonb_object_agg(level, c), '{}'::jsonb) from (select level, count(*) c from profiles group by level) s),
    'ai_month', (select count(*) from ai_usage where ok and created_at > date_trunc('month', now())),
    'ai_tokens_in', (select coalesce(sum(input_tokens), 0) from ai_usage where created_at > date_trunc('month', now())),
    'ai_tokens_out', (select coalesce(sum(output_tokens), 0) from ai_usage where created_at > date_trunc('month', now()))
  );
end $$;
