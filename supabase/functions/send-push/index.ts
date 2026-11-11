// Reparte3 · Edge Function "send-push"
// La invoca pg_cron cada minuto (public.dispatch_push) con el encabezado x-push-secret.
// Envía como notificación push del navegador los avisos aún no enviados, respetando las
// preferencias y el horario de silencio de cada persona. Borra suscripciones vencidas (404/410).
//
// Secretos requeridos (supabase secrets set ...):
//   PUSH_CRON_SECRET    mismo valor que el secreto 'push_secret' guardado en Vault
//   VAPID_PUBLIC_KEY    clave pública VAPID (también va en VITE_VAPID_PUBLIC_KEY de la web)
//   VAPID_PRIVATE_KEY   clave privada VAPID (solo aquí)
//   VAPID_SUBJECT       mailto:tu-correo o la URL de la app
//   APP_URL             URL pública de la app, p. ej. https://usuario.github.io/reparte3/
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase automáticamente.
// Desplegar con: supabase functions deploy send-push --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

const env = (k: string) => Deno.env.get(k) ?? '';

// Los servicios push exigen un contacto https: o mailto:.
const subject = () => [env('VAPID_SUBJECT'), env('APP_URL')].find((s) => /^(https:|mailto:)/.test(s)) || 'https://localhost';

function limaHour(): number {
  return Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Lima' }).format(new Date())) % 24;
}
function inQuiet(h: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start > end ? h >= start || h < end : h >= start && h < end;
}

Deno.serve(async (req) => {
  if (req.headers.get('x-push-secret') !== env('PUSH_CRON_SECRET') || !env('PUSH_CRON_SECRET')) {
    return new Response('forbidden', { status: 403 });
  }
  try {
    webpush.setVapidDetails(subject(), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
  } catch (e) {
    return new Response(`Configuración VAPID inválida: ${(e as Error).message}`, { status: 500 });
  }
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: pending, error } = await db
    .from('notifications')
    .select('id, user_id, project_id, task_id, kind, title, body')
    .is('push_sent_at', null)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(300);
  if (error) return new Response(error.message, { status: 500 });
  if (!pending?.length) return Response.json({ sent: 0 });

  const users = [...new Set(pending.map((n) => n.user_id))];
  const [{ data: subs }, { data: prefs }] = await Promise.all([
    db.from('push_subscriptions').select('endpoint, user_id, p256dh, auth').in('user_id', users),
    db.from('notification_prefs').select('user_id, push, quiet_start, quiet_end').in('user_id', users),
  ]);
  const prefOf = new Map((prefs ?? []).map((p) => [p.user_id, p]));
  const h = limaHour();
  const base = env('APP_URL').replace(/\/?$/, '/');
  let sent = 0;
  const done: number[] = [];
  const deferred: number[] = [];

  for (const n of pending) {
    const pr = prefOf.get(n.user_id) ?? { push: true, quiet_start: 20, quiet_end: 8 };
    if (!pr.push) { done.push(n.id); continue; }
    if (inQuiet(h, pr.quiet_start, pr.quiet_end)) { deferred.push(n.id); continue; } // se intentará al terminar el silencio (si sigue dentro de 1 h)
    const targets = (subs ?? []).filter((s) => s.user_id === n.user_id);
    const url = n.task_id ? `${base}#/p/${n.project_id}?tarea=${n.task_id}` : n.project_id ? `${base}#/p/${n.project_id}${n.kind === 'mensaje' ? '/chat' : ''}` : `${base}#/`;
    const payload = JSON.stringify({ title: n.title, body: n.body, url, tag: `${n.kind}:${n.task_id ?? n.project_id ?? n.id}` });
    for (const s of targets) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 12 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        else console.error('push no enviado', code ?? '', (e as Error).message);
      }
    }
    done.push(n.id);
  }
  if (done.length) await db.from('notifications').update({ push_sent_at: new Date().toISOString() }).in('id', done);
  return Response.json({ sent, processed: done.length, deferred: deferred.length });
});
