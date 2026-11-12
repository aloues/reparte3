// Reparte3 · Edge Function "send-email"
// La invoca pg_cron cada minuto (public.dispatch_email) con el encabezado x-push-secret.
// Envía UN correo por persona con sus asignaciones nuevas (kind = 'asignada') de los últimos minutos,
// con un botón «Revisar asignación» que abre la tarea en la app. Abrir el enlace no acepta nada:
// la persona entra, revisa y elige «Aceptar» o «No puedo», como siempre.
//
// Idempotencia: cada aviso se «reserva» (email_sent_at = now()) ANTES de enviar, con una condición
// email_sent_at is null; dos ejecuciones simultáneas no pueden enviar el mismo aviso. Un fallo queda
// registrado (email_status = 'error') y no se reintenta en bucle.
//
// Proveedor (uno de los dos, por secreto):
//   RESEND_API_KEY + EMAIL_FROM          p. ej. "Reparte3 <avisos@tu-dominio.com>" (dominio verificado en Resend)
//   BREVO_API_KEY  + EMAIL_FROM_ADDRESS  remitente verificado en Brevo; EMAIL_FROM_NAME opcional ("Reparte3")
// Además: PUSH_CRON_SECRET (el mismo de send-push) y APP_URL (URL pública de la app).
// Desplegar con: supabase functions deploy send-email --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const env = (k: string) => Deno.env.get(k) ?? '';
const APP = (env('APP_URL') || 'https://aloues.github.io/reparte3/').replace(/#.*$/, '');
const esc = (s: string) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const fmtDate = (iso: string | null) => (iso ? new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`)) : 'sin fecha');

type Item = { nid: number; title: string; project: string; projectId: string; taskId: string; due: string | null };

function render(name: string, items: Item[]) {
  const projects = [...new Set(items.map((i) => i.project))];
  const subject = items.length === 1 ? `Te asignaron «${items[0].title}»` : projects.length === 1 ? `Te asignaron ${items.length} tareas en ${projects[0]}` : `Tienes ${items.length} tareas nuevas en Reparte3`;
  const first = `${APP}#/p/${items[0].projectId}?tarea=${items[0].taskId}`;
  const rows = items.map((i) => `
      <tr><td style="padding:12px 0;border-top:1px solid #F4F4F5;">
        <a href="${APP}#/p/${i.projectId}?tarea=${i.taskId}" style="font-size:15px;font-weight:600;color:#18181B;text-decoration:none;">${esc(i.title)}</a>
        <div style="margin-top:3px;font-size:13px;color:#71717A;">${esc(i.project)}. Fecha: ${esc(fmtDate(i.due))}.</div>
      </td></tr>`).join('');
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>${esc(subject)}</title></head>
<body style="margin:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181B;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F5;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;border:1px solid #E4E4E7;">
  <tr><td style="padding:28px 32px 0 32px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td><img src="${APP}icon-192.png" width="36" height="36" alt="" style="display:block;border-radius:9px;"></td>
    <td style="padding-left:10px;font-size:17px;font-weight:600;color:#18181B;">Reparte3</td></tr></table></td></tr>
  <tr><td style="padding:22px 32px 4px 32px;">
    <h1 style="margin:0 0 10px 0;font-size:21px;line-height:1.3;font-weight:600;color:#18181B;">${esc(name)}, ${items.length === 1 ? 'tienes una tarea nueva' : `tienes ${items.length} tareas nuevas`}</h1>
    <p style="margin:0;font-size:15px;line-height:1.6;color:#3F3F46;">Revísala${items.length === 1 ? '' : 's'} y acéptala${items.length === 1 ? '' : 's'}, o explica por qué no puedes: así el grupo sabe con quién cuenta.</p>
  </td></tr>
  <tr><td style="padding:8px 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>
  <tr><td style="padding:12px 32px 24px 32px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:#2B59FF;">
    <a href="${first}" style="display:inline-block;padding:13px 24px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;">Revisar asignación</a>
  </td></tr></table></td></tr>
  <tr><td style="padding:18px 32px 26px 32px;border-top:1px solid #F4F4F5;"><p style="margin:0;font-size:12px;line-height:1.6;color:#A1A1AA;">Abrir el enlace no acepta la tarea por ti. Puedes apagar estos correos en Reparte3, en Ajustes, sección Avisos.</p></td></tr>
</table></td></tr></table></body></html>`;
  const text = `${name}, ${items.length === 1 ? 'tienes una tarea nueva' : `tienes ${items.length} tareas nuevas`} en Reparte3:\n\n${items.map((i) => `- ${i.title} (${i.project}, ${fmtDate(i.due)}): ${APP}#/p/${i.projectId}?tarea=${i.taskId}`).join('\n')}\n\nAbrir el enlace no acepta la tarea por ti. Puedes apagar estos correos en Ajustes, sección Avisos.`;
  return { subject, html, text };
}

async function send(to: string, m: { subject: string; html: string; text: string }) {
  if (env('RESEND_API_KEY')) {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env('EMAIL_FROM'), to: [to], subject: m.subject, html: m.html, text: m.text }) });
    if (!r.ok) throw new Error(`resend ${r.status} ${(await r.text()).slice(0, 160)}`);
    return;
  }
  if (env('BREVO_API_KEY')) {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': env('BREVO_API_KEY'), 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: { email: env('EMAIL_FROM_ADDRESS'), name: env('EMAIL_FROM_NAME') || 'Reparte3' }, to: [{ email: to }], subject: m.subject, htmlContent: m.html, textContent: m.text }) });
    if (!r.ok) throw new Error(`brevo ${r.status} ${(await r.text()).slice(0, 160)}`);
    return;
  }
  throw new Error('no_provider');
}

Deno.serve(async (req) => {
  if (req.headers.get('x-push-secret') !== env('PUSH_CRON_SECRET') || !env('PUSH_CRON_SECRET')) return new Response('forbidden', { status: 403 });
  const provider = env('RESEND_API_KEY') ? 'resend' : env('BREVO_API_KEY') ? 'brevo' : null;
  if (!provider) return Response.json({ skipped: 'no_provider' });
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const since = new Date(Date.now() - 2 * 3600e3).toISOString();
  const delay = Number(env('EMAIL_DELAY_SECONDS') || 45);   // margen para agrupar un reparto completo en un solo correo
  const until = new Date(Date.now() - delay * 1000).toISOString();
  const { data: pending } = await db.from('notifications').select('id, user_id, project_id, task_id').eq('kind', 'asignada').is('email_sent_at', null).gte('created_at', since).lte('created_at', until).limit(300);
  if (!pending?.length) return Response.json({ sent: 0 });

  const byUser = new Map<string, typeof pending>();
  pending.forEach((n) => byUser.set(n.user_id, [...(byUser.get(n.user_id) || []), n]));
  let sent = 0; let skipped = 0; let failed = 0;
  const done: { user: string; status: string }[] = [];   // solo identificadores, para auditoría
  for (const [userId, list] of byUser) {
    // Reserva atómica: solo los avisos que nadie más tomó.
    const { data: claimed } = await db.from('notifications').update({ email_sent_at: new Date().toISOString() }).in('id', list.map((n) => n.id)).is('email_sent_at', null).select('id, project_id, task_id');
    if (!claimed?.length) continue;
    const ids = claimed.map((n) => n.id);
    const { data: pref } = await db.from('notification_prefs').select('email').eq('user_id', userId).maybeSingle();
    if (pref && pref.email === false) { await db.from('notifications').update({ email_status: 'omitido' }).in('id', ids); skipped += ids.length; done.push({ user: userId, status: 'omitido' }); continue; }
    const taskIds = claimed.map((n) => n.task_id).filter(Boolean);
    const { data: tasks } = await db.from('tasks').select('id, title, due_date, project_id, assignee, status, projects(name)').in('id', taskIds);
    // Solo tareas que siguen asignadas a esta persona y abiertas (si la reasignaron, no se avisa).
    const items: Item[] = (tasks || []).filter((t) => t.assignee === userId && t.status !== 'lista').map((t) => ({ nid: 0, title: t.title, project: (t as { projects?: { name?: string } }).projects?.name || 'Proyecto', projectId: t.project_id, taskId: t.id, due: t.due_date }));
    if (!items.length) { await db.from('notifications').update({ email_status: 'omitido' }).in('id', ids); skipped += ids.length; continue; }
    const { data: u } = await db.auth.admin.getUserById(userId);
    const { data: prof } = await db.from('profiles').select('display_name').eq('id', userId).maybeSingle();
    const to = u?.user?.email;
    if (!to) { await db.from('notifications').update({ email_status: 'omitido' }).in('id', ids); skipped += ids.length; continue; }
    try {
      await send(to, render((prof?.display_name || '').split(' ')[0] || 'Hola', items));
      await db.from('notifications').update({ email_status: 'enviado' }).in('id', ids); sent += 1; done.push({ user: userId, status: 'enviado' });
    } catch (e) {
      console.error('send-email', String((e as Error).message).slice(0, 200));
      await db.from('notifications').update({ email_status: 'error' }).in('id', ids); failed += 1; done.push({ user: userId, status: 'error' });
    }
  }
  return Response.json({ provider, sent, skipped, failed, done });
});
