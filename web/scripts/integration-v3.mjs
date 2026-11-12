// Prueba de integración V3 (centro de proyecto) contra Supabase LOCAL.
// Enlaces del proyecto (RLS y tipo), enlaces del chat que pasan a Archivos, mensajes fijados,
// versión de la consigna, objetivo del proyecto y aislamiento entre proyectos.
// Uso: SUPABASE_URL=... SUPABASE_ANON_KEY=... node web/scripts/integration-v3.mjs
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL; const ANON = process.env.SUPABASE_ANON_KEY;
if (!URL || !ANON) { console.error('Faltan SUPABASE_URL o SUPABASE_ANON_KEY'); process.exit(2); }
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
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
const A = await user('coord'); const B = await user('integrante'); const X = await user('ajeno');
const pid = (await A.c.rpc('create_project', { p_name: `Centro ${run}`, p_course: 'Prueba', p_due: '2026-12-15', p_brief: 'Línea 1\n- Investigar\n- Redactar', p_tasks: [{ title: 'Investigar', hours: 2, source_line: 2 }] })).data;
const inv = (await A.c.from('invites').insert({ project_id: pid, role: 'integrante' }).select().single()).data;
await B.c.rpc('join_project', { p_code: inv.code });
const otro = (await X.c.rpc('create_project', { p_name: `Ajeno ${run}`, p_course: '', p_due: null })).data;

console.log('\nObjetivo y versión de la consigna');
const g = await A.c.from('projects').update({ goal: 'Plan de reciclaje viable' }).eq('id', pid).select('goal').single();
ok(g.data?.goal === 'Plan de reciclaje viable', 'la coordinación guarda el objetivo');
const gB = await B.c.from('projects').update({ goal: 'otro' }).eq('id', pid).select();
ok(!gB.data?.length, 'un integrante no cambia el objetivo');
const t0 = (await A.c.from('tasks').select('brief_version').eq('project_id', pid).single()).data;
ok(t0.brief_version === 1, 'la tarea creada desde la consigna recuerda la versión 1');
const v2 = await A.c.from('projects').update({ brief_text: 'Nueva versión\n- Encuestar' }).eq('id', pid).select('brief_version, brief_updated_at').single();
ok(v2.data?.brief_version === 2 && !!v2.data?.brief_updated_at, 'reemplazar la consigna sube la versión a 2 sin borrar tareas');
ok(((await A.c.from('tasks').select('id').eq('project_id', pid)).data || []).length === 1, 'las tareas existentes se conservan');

console.log('\nEnlaces del proyecto');
const l1 = await B.c.from('project_links').insert({ project_id: pid, url: 'https://docs.google.com/document/d/abc/edit', title: 'Informe', added_by: B.id }).select().single();
ok(l1.data?.kind === 'doc', 'un integrante agrega un Google Doc y se reconoce como documento', l1.error?.message);
const dup = await B.c.from('project_links').insert({ project_id: pid, url: 'https://docs.google.com/document/d/abc/edit', added_by: B.id });
ok(!!dup.error, 'el mismo enlace no se repite en el proyecto');
const bad = await B.c.from('project_links').insert({ project_id: pid, url: 'javascript:alert(1)', added_by: B.id });
ok(!!bad.error, 'se rechaza un enlace que no es http(s)');
const fake = await B.c.from('project_links').insert({ project_id: pid, url: 'https://x.org/a', added_by: A.id });
ok(!!fake.error, 'nadie agrega un enlace a nombre de otra persona');
ok(((await X.c.from('project_links').select('*').eq('project_id', pid)).data || []).length === 0, 'una persona ajena no ve los enlaces');
const xin = await X.c.from('project_links').insert({ project_id: pid, url: 'https://spam.example', added_by: X.id });
ok(!!xin.error, 'una persona ajena no agrega enlaces');
const xdel = await X.c.from('project_links').delete().eq('id', l1.data.id).select();
ok(!xdel.data?.length, 'una persona ajena no borra enlaces');

console.log('\nEl chat alimenta Archivos');
await A.c.from('messages').insert({ project_id: pid, body: 'Usemos esta hoja https://docs.google.com/spreadsheets/d/xyz/edit. Y la carpeta https://drive.google.com/drive/folders/f1' });
await A.c.from('messages').insert({ project_id: pid, body: 'Repito https://docs.google.com/spreadsheets/d/xyz/edit' });
const links = (await B.c.from('project_links').select('url, kind, source').eq('project_id', pid)).data || [];
ok(links.some((l) => l.kind === 'sheet' && l.source === 'chat'), 'la hoja compartida en el chat aparece en Archivos');
ok(links.some((l) => l.kind === 'folder'), 'la carpeta de Drive también');
ok(links.filter((l) => l.url.includes('/spreadsheets/d/xyz')).length === 1, 'repetir el enlace en el chat no lo duplica');
ok(links.every((l) => !/[.,]$/.test(l.url)), 'la puntuación final no queda pegada al enlace');

console.log('\nMensajes fijados');
const m = (await B.c.from('messages').insert({ project_id: pid, body: 'Reunión el jueves 7 pm' }).select().single()).data;
const pinB = await B.c.from('messages').update({ pinned: true }).eq('id', m.id).select();
ok(!pinB.data?.length, 'un integrante no puede fijar mensajes');
const pinA = await A.c.from('messages').update({ pinned: true }).eq('id', m.id).select('pinned').single();
ok(pinA.data?.pinned === true, 'la coordinación fija un mensaje', pinA.error?.message);
const edit = await A.c.from('messages').update({ body: 'texto cambiado' }).eq('id', m.id).select();
ok(!!edit.error || !edit.data?.length, 'fijar no permite editar el texto de otro');
ok(((await X.c.from('messages').select('*').eq('project_id', pid)).data || []).length === 0, 'el chat de un proyecto no se ve desde otro');
ok(((await A.c.from('project_links').select('*').eq('project_id', otro)).data || []).length === 0, 'los recursos tampoco cruzan de proyecto');

console.log('\nCorreo al asignar (preparación)');
const pref = await B.c.from('notification_prefs').upsert({ user_id: B.id, email: false }).select('email').single();
ok(pref.data?.email === false, 'cada persona puede apagar los correos', pref.error?.message);
const nB = (await B.c.from('notifications').select('email_sent_at').eq('user_id', B.id).limit(1)).data;
ok(Array.isArray(nB), 'los avisos tienen registro de envío de correo');

console.log(`\nResultado: ${pass} pasan, ${fail} fallan`);
process.exit(fail ? 1 : 0);
