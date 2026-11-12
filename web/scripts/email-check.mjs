// Prueba de la Edge Function «send-email» contra Supabase LOCAL, con un proveedor FALSO (no sale ningún correo).
// Verifica: el secreto es obligatorio, cada aviso se reserva una sola vez aunque haya dos ejecuciones a la vez,
// la preferencia «no quiero correos» se respeta y un fallo del proveedor queda registrado sin reintentos.
// Requiere `supabase functions serve --env-file supabase/functions/.env` con PUSH_CRON_SECRET=prueba-local,
// RESEND_API_KEY falsa y EMAIL_DELAY_SECONDS=0.
// Uso: SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node web/scripts/email-check.mjs
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL; const ANON = process.env.SUPABASE_ANON_KEY; const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = process.env.PUSH_CRON_SECRET || 'prueba-local';
if (!URL || !ANON || !SERVICE) { console.error('Faltan SUPABASE_URL, SUPABASE_ANON_KEY o SUPABASE_SERVICE_ROLE_KEY'); process.exit(2); }
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, SERVICE, opts);
const run = Date.now().toString(36);
let pass = 0; let fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.log(`  ✗ ${m}${x ? ` — ${x}` : ''}`); } };
async function user(label) {
  const c = createClient(URL, ANON, opts);
  const email = `${label}-${run}@test.reparte3.local`;
  const { data, error } = await c.auth.signUp({ email, password: 'clave-de-prueba-123', options: { data: { display_name: label, birth_date: '2004-05-01', level: 'universidad' } } });
  if (error) throw error;
  if (!data.session) await c.auth.signInWithPassword({ email, password: 'clave-de-prueba-123' });
  return { c, id: data.user.id };
}
const call = (secret) => fetch(`${URL}/functions/v1/send-email`, { method: 'POST', headers: { 'x-push-secret': secret, 'Content-Type': 'application/json' }, body: '{}' });

const A = await user('coord'); const B = await user('beto'); const C = await user('caro');
const pid = (await A.c.rpc('create_project', { p_name: `Correo ${run}`, p_course: '', p_due: '2026-12-15' })).data;
const inv = (await A.c.from('invites').insert({ project_id: pid, role: 'integrante' }).select().single()).data;
await B.c.rpc('join_project', { p_code: inv.code }); await C.c.rpc('join_project', { p_code: inv.code });
await C.c.from('notification_prefs').upsert({ user_id: C.id, email: false });
await A.c.rpc('save_plan', { p_project: pid, p_checkpoints: [], p_tasks: [
  { key: 'a', title: 'Investigar antecedentes', hours: 2, assignee: B.id }, { key: 'b', title: 'Redactar introducción', hours: 2, assignee: B.id },
  { key: 'c', title: 'Diseñar diapositivas', hours: 2, assignee: C.id },
] });

console.log('\nSeguridad');
ok((await call('secreto-equivocado')).status === 403, 'sin el secreto del cron, la función no hace nada');

console.log('\nDos ejecuciones a la vez');
const [r1, r2] = await Promise.all([call(SECRET), call(SECRET)]);
const j1 = await r1.json(); const j2 = await r2.json();
ok(r1.status === 200 && r2.status === 200, 'ambas responden', JSON.stringify([j1, j2]));
const rows = (await admin.from('notifications').select('user_id, email_sent_at, email_status').eq('project_id', pid).eq('kind', 'asignada')).data || [];
const beto = rows.filter((r) => r.user_id === B.id); const caro = rows.filter((r) => r.user_id === C.id);
ok(beto.length === 2 && beto.every((r) => r.email_sent_at), 'los 2 avisos de Beto quedan reservados para un solo correo');
const betoRuns = [...(j1.done || []), ...(j2.done || [])].filter((d) => d.user === B.id);
ok(betoRuns.length === 1, 'se intentó UN solo correo para Beto (no uno por aviso ni uno por ejecución)', JSON.stringify(betoRuns));
ok(beto.every((r) => r.email_status === 'error'), 'el fallo del proveedor (clave falsa) queda registrado como error');
ok(caro.every((r) => r.email_status === 'omitido'), 'Caro apagó los correos: su aviso se marca omitido y no se envía');
const again = await (await call(SECRET)).json();
ok(!(again.done || []).some((d) => d.user === B.id || d.user === C.id), 'una tercera ejecución no reenvía nada a Beto ni a Caro', JSON.stringify(again));

console.log(`\nResultado: ${pass} pasan, ${fail} fallan`);
process.exit(fail ? 1 : 0);
