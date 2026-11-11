// Verifica la Edge Function send-push en local: secreto, envío por HTTPS a un servicio push real
// (Mozilla) con una suscripción inexistente, limpieza de suscripciones vencidas y marca de enviado.
// Requiere `supabase start` y `supabase functions serve send-push --no-verify-jwt --env-file supabase/.secrets.local`.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const secret = fs.readFileSync(new globalThis.URL('../../supabase/.secrets.local', import.meta.url), 'utf8').match(/^PUSH_CRON_SECRET=(.+)$/m)[1];
const db = createClient(URL, SERVICE, { auth: { persistSession: false } });
let pass = 0; let fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.log(`  ✗ ${m}${x ? ` — ${x}` : ''}`); } };

const run = Date.now().toString(36);
const { data: u } = await db.auth.admin.createUser({ email: `push-${run}@t.local`, password: 'clave-de-prueba-123', email_confirm: true, user_metadata: { display_name: 'Push Test', birth_date: '2004-01-01' } });
const uid = u.user.id;
// Claves de un navegador de ejemplo (P-256 + auth) para que web-push pueda cifrar.
const { webcrypto } = await import('node:crypto');
const kp = await webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const p256dh = Buffer.from(await webcrypto.subtle.exportKey('raw', kp.publicKey)).toString('base64url');
const auth = Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString('base64url');
await db.from('push_subscriptions').insert({ endpoint: `https://updates.push.services.mozilla.com/wpush/v2/gAAAAABreparte3test${run}`, user_id: uid, p256dh, auth });
await db.from('notification_prefs').upsert({ user_id: uid, quiet_start: 0, quiet_end: 0 }); // sin horario de silencio para la prueba
await db.from('notifications').insert({ user_id: uid, kind: 'asignada', title: 'Prueba de push', body: 'Hola' });

const FN = `${URL}/functions/v1/send-push`;
const bad = await fetch(FN, { method: 'POST', headers: { 'x-push-secret': 'incorrecto' } });
ok(bad.status === 403, 'rechaza llamadas sin el secreto del cron', `status ${bad.status}`);
const res = await fetch(FN, { method: 'POST', headers: { 'x-push-secret': secret, 'content-type': 'application/json' }, body: '{}' });
const body = await res.json().catch(() => ({}));
ok(res.status === 200 && body.processed >= 1, 'procesa los avisos pendientes', JSON.stringify(body));
const { data: subs } = await db.from('push_subscriptions').select('endpoint').eq('user_id', uid);
ok((subs || []).length === 0, 'envía al servicio push real por HTTPS y borra la suscripción inexistente (404/410)');
const { data: n } = await db.from('notifications').select('push_sent_at').eq('user_id', uid).single();
ok(!!n?.push_sent_at, 'marca el aviso como enviado para no repetirlo');

await db.auth.admin.deleteUser(uid);
console.log(`\n${pass} correctas, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
