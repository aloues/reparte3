// Prueba de integración contra un Supabase REAL (local con `supabase start` o un proyecto de prueba).
// Crea usuarios de prueba y recorre permisos, roles, chat, notificaciones y plan.
// Uso: SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node web/scripts/integration.mjs
// NO usar contra producción: crea y borra datos.
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) { console.error('Faltan SUPABASE_URL, SUPABASE_ANON_KEY o SUPABASE_SERVICE_ROLE_KEY'); process.exit(2); }

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, SERVICE, opts);
const run = Date.now().toString(36);
let pass = 0; let fail = 0;
const ok = (cond, name, extra) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function user(label, birth = '2004-05-01') {
  const c = createClient(URL, ANON, opts);
  const email = `${label}-${run}@test.reparte3.local`;
  const { data, error } = await c.auth.signUp({ email, password: 'clave-de-prueba-123', options: { data: { display_name: `${label} ${run}`, birth_date: birth, level: 'universidad' } } });
  if (error) return { error };
  if (!data.session) { const r = await c.auth.signInWithPassword({ email, password: 'clave-de-prueba-123' }); if (r.error) return { error: r.error }; }
  return { c, id: data.user.id, email };
}
const notifs = async (u, kind) => { const { data } = await u.c.from('notifications').select('*').eq('user_id', u.id).eq('kind', kind); return data || []; };

console.log('\nCuentas y edad');
const kid = await user('menor', new Date(Date.now() - 12 * 365 * 864e5).toISOString().slice(0, 10));
ok(!!kid.error, 'rechaza el registro de una persona de 12 años');
const A = await user('ana'); const B = await user('beto'); const C = await user('carla'); const D = await user('doc', '1980-01-01');
ok(!A.error && !B.error && !C.error && !D.error, 'registra cuatro cuentas de 14+ con perfil', [A, B, C, D].map((u) => u.error?.message).filter(Boolean).join('; '));
const prof = await A.c.from('profiles').select('*').eq('id', A.id).single();
ok(prof.data?.display_name === `ana ${run}` && prof.data?.is_admin === false, 'el perfil se crea desde los datos del registro');
const selfAdmin = await B.c.from('profiles').update({ is_admin: true }).eq('id', B.id).select().single();
ok(selfAdmin.data?.is_admin === false, 'nadie se da permisos de administración a sí mismo');

console.log('\nProyecto e invitaciones');
const pr = await A.c.rpc('create_project', { p_name: `Informe ${run}`, p_course: 'Curso de prueba', p_due: '2026-12-20', p_tasks: [{ title: 'Investigar fuentes', hours: 3 }, { title: 'Redactar introducción', hours: 2 }, { title: 'Diseñar diapositivas', hours: 2 }] });
const pid = pr.data;
ok(!!pid, 'la coordinación crea un proyecto con tres tareas', pr.error?.message);
const tasksA = (await A.c.from('tasks').select('*').eq('project_id', pid).order('seq')).data || [];
ok(tasksA.length === 3 && tasksA.map((t) => t.seq).join() === '1,2,3', 'las tareas se numeran 1, 2, 3');
const outsiderTasks = (await C.c.from('tasks').select('*').eq('project_id', pid)).data || [];
const outsiderProj = (await C.c.from('projects').select('*').eq('id', pid)).data || [];
ok(outsiderTasks.length === 0 && outsiderProj.length === 0, 'una persona ajena no ve el proyecto ni sus tareas');
const direct = await C.c.from('projects').insert({ name: 'Colado', course: '' });
ok(!!direct.error, 'no se puede crear un proyecto saltándose la función segura');

const invB = await A.c.from('invites').insert({ project_id: pid, role: 'integrante' }).select().single();
const invD = await A.c.from('invites').insert({ project_id: pid, role: 'docente' }).select().single();
ok(!!invB.data?.code && !!invD.data?.code, 'la coordinación crea enlaces de integrante y de docente');
const invC = await C.c.from('invites').insert({ project_id: pid, role: 'integrante' });
ok(!!invC.error, 'alguien ajeno no puede crear invitaciones');
const prev = await B.c.rpc('invite_preview', { p_code: invB.data.code });
ok(prev.data?.[0]?.valid === true && prev.data?.[0]?.members === 1, 'la vista previa muestra el grupo antes de unirse');
const jB = await B.c.rpc('join_project', { p_code: invB.data.code });
const jD = await D.c.rpc('join_project', { p_code: invD.data.code });
ok(jB.data === pid && jD.data === pid, 'integrante y docente se unen con su enlace', jB.error?.message || jD.error?.message);
await wait(300);
ok((await notifs(A, 'miembro')).length === 2, 'la coordinación recibe un aviso por cada persona que entra');
const roles = (await A.c.from('memberships').select('user_id, role').eq('project_id', pid)).data || [];
ok(roles.find((r) => r.user_id === D.id)?.role === 'docente', 'el docente entra con rol de solo lectura');

console.log('\nTareas, compromisos y revisión');
const t1 = tasksA[0];
const asg = await A.c.from('tasks').update({ assignee: B.id }).eq('id', t1.id).select().single();
ok(asg.data?.assignee === B.id && asg.data?.accepted === false, 'asignar deja la tarea pendiente de aceptar');
ok((await notifs(B, 'asignada')).length === 1, 'quien recibe la tarea recibe un aviso');
const sneaky = await B.c.from('tasks').update({ status: 'lista' }).eq('id', t1.id).select();
ok(!sneaky.data?.length, 'un integrante no puede marcar «lista» saltándose la revisión');
const toD = await A.c.from('tasks').update({ assignee: D.id }).eq('id', tasksA[1].id);
ok(!!toD.error, 'no se puede asignar una tarea a un docente');
const acc = await B.c.rpc('task_action', { p_task: t1.id, p_action: 'aceptar' });
ok(acc.data?.accepted === true, 'el integrante acepta su tarea', acc.error?.message);
ok((await notifs(A, 'aceptada')).length === 1, 'la coordinación sabe que la aceptó');
const blk = await B.c.rpc('task_action', { p_task: t1.id, p_action: 'bloquear' });
ok(!!blk.error, 'un bloqueo exige explicar el motivo');
const del = await B.c.rpc('task_action', { p_task: t1.id, p_action: 'entregar', p_url: 'https://docs.example.com/x' });
ok(del.data?.status === 'en_revision', 'el integrante entrega para revisión', del.error?.message);
ok((await notifs(A, 'entrega')).length === 1, 'la coordinación recibe el aviso de entrega');
const self = await B.c.rpc('task_action', { p_task: t1.id, p_action: 'aprobar' });
ok(!!self.error, 'nadie aprueba su propia entrega');
const docAct = await D.c.rpc('task_action', { p_task: t1.id, p_action: 'aprobar' });
ok(!!docAct.error, 'el docente no puede aprobar ni cambiar tareas');
const ap = await A.c.rpc('task_action', { p_task: t1.id, p_action: 'aprobar' });
ok(ap.data?.status === 'lista', 'la coordinación aprueba la entrega', ap.error?.message);
ok((await notifs(B, 'aprobada')).length === 1, 'el integrante recibe el aviso de aprobación');
const take = await B.c.rpc('task_action', { p_task: tasksA[2].id, p_action: 'tomar' });
ok(take.data?.assignee === B.id && take.data?.accepted === true, 'un integrante puede tomar una tarea libre');
const docSees = (await D.c.from('tasks').select('id').eq('project_id', pid)).data || [];
ok(docSees.length === 3, 'el docente ve todas las tareas');

console.log('\nChat y notificaciones de chat');
const m1 = await B.c.from('messages').insert({ project_id: pid, body: 'Hola grupo, ya subí mi parte' }).select().single();
ok(!!m1.data && m1.data.author === B.id, 'un integrante escribe en el chat del grupo', m1.error?.message);
await B.c.from('messages').insert({ project_id: pid, body: 'Y otra cosa más' });
await wait(300);
const chatA = await notifs(A, 'mensaje');
ok(chatA.length === 1 && chatA[0].body === 'Y otra cosa más', 'los mensajes seguidos se agrupan en un solo aviso', `avisos=${chatA.length}`);
ok((await notifs(D, 'mensaje')).length === 0, 'al docente no le llegan avisos de chat');
const mD = await D.c.from('messages').insert({ project_id: pid, body: 'Soy el docente' });
ok(!!mD.error, 'el docente no puede escribir en el chat');
const mC = await C.c.from('messages').select('*').eq('project_id', pid);
ok((mC.data || []).length === 0, 'alguien ajeno no lee el chat');
const com = await A.c.from('messages').insert({ project_id: pid, task_id: tasksA[2].id, body: '¿Te ayudo con las diapositivas?' });
await wait(300);
ok(!com.error && (await notifs(B, 'comentario')).length === 1, 'un comentario en la tarea avisa a quien la tiene');
await B.c.from('notification_prefs').upsert({ user_id: B.id, chat: false });
await A.c.from('messages').insert({ project_id: pid, body: 'Mensaje con avisos de chat apagados' });
await wait(300);
ok((await notifs(B, 'mensaje')).length === 0, 'si apago los avisos de chat, no me llegan');

console.log('\nRoles');
const rB = await A.c.from('memberships').update({ role: 'revisor' }).eq('project_id', pid).eq('user_id', B.id).select();
ok(rB.data?.[0]?.role === 'revisor', 'la coordinación cambia el rol de un integrante');
const rSelf = await B.c.from('memberships').update({ role: 'coordinador' }).eq('project_id', pid).eq('user_id', B.id).select();
ok(!rSelf.data?.length, 'un integrante no puede subirse de rol');
const leaveA = await A.c.from('memberships').delete().eq('project_id', pid).eq('user_id', A.id);
ok(!!leaveA.error, 'la última persona coordinadora no puede salir sin dejar a otra');

console.log('\nArchivos');
const blob = new Blob(['contenido de prueba'], { type: 'text/plain' });
const upB = await B.c.storage.from('archivos').upload(`${pid}/general/${run}.txt`, blob);
ok(!upB.error, 'un integrante sube un archivo al grupo', upB.error?.message);
const upC = await C.c.storage.from('archivos').upload(`${pid}/general/${run}-c.txt`, blob);
ok(!!upC.error, 'alguien ajeno no puede subir archivos al grupo');
const dlC = await C.c.storage.from('archivos').download(`${pid}/general/${run}.txt`);
ok(!!dlC.error, 'alguien ajeno no puede descargar archivos del grupo');

console.log('\nPlan y administración');
const admB = await B.c.rpc('admin_overview');
ok(!!admB.error, 'una persona común no ve el panel de administración');
const planA = await A.c.from('projects').update({ plan: 'gratis' }).eq('id', pid);
ok(!!planA.error, 'la coordinación no puede cambiarse el plan');
await admin.from('profiles').update({ is_admin: true }).eq('id', A.id);
const ov = await A.c.rpc('admin_overview');
ok(typeof ov.data?.users === 'number', 'la administración ve cifras generales', ov.error?.message);
const sp = await A.c.rpc('admin_set_plan', { p_project: pid, p_plan: 'gratis', p_until: null });
ok(!sp.error, 'la administración cambia el plan de un grupo');
const mFree = await B.c.from('messages').insert({ project_id: pid, body: 'Sin premium' });
ok(!!mFree.error, 'en plan gratis el chat queda desactivado');
await A.c.rpc('admin_set_plan', { p_project: pid, p_plan: 'premium', p_until: null });

console.log('\nRecordatorios');
const tomorrow = new Date(Date.now() + 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
await A.c.from('tasks').update({ due_date: tomorrow }).eq('id', tasksA[2].id);
const limaHour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Lima' }).format(new Date())) % 24;
const rem = await admin.rpc('generate_reminders');
const remB = await notifs(B, 'recordatorio');
if (limaHour >= 8 && limaHour < 20) ok(remB.length === 1, 'un día antes de la fecha llega un recordatorio', rem.error?.message);
else ok(rem.data === 0 && remB.length === 0, `en horario de silencio (${limaHour}:00 en Lima) no se generan recordatorios`, rem.error?.message);
const forced = await admin.rpc('generate_reminders', { p_ignore_quiet: true });
const remF = await notifs(B, 'recordatorio');
ok(!forced.error && remF.length === 1 && remF[0].title.startsWith('Mañana vence'), 'fuera del silencio, llega «Mañana vence…» a quien tiene la tarea', forced.error?.message);
const remAgain = await admin.rpc('generate_reminders', { p_ignore_quiet: true });
ok(!remAgain.error && (await notifs(B, 'recordatorio')).length === 1, 'el mismo recordatorio no se repite');
const t2 = (await A.c.from('tasks').update({ due_date: '2026-01-05', assignee: B.id }).eq('id', tasksA[1].id).select().single()).data;
await B.c.rpc('task_action', { p_task: t2.id, p_action: 'aceptar' });
await admin.rpc('generate_reminders', { p_ignore_quiet: true });
ok((await notifs(B, 'vencida')).length === 1, 'una tarea vencida genera su aviso diario');
const remUser = await B.c.rpc('generate_reminders');
ok(!!remUser.error, 'los usuarios no pueden disparar los recordatorios');

console.log('\nBorrar cuenta');
const dC = await C.c.rpc('delete_my_account');
const gone = await admin.auth.admin.getUserById(C.id);
ok(!dC.error && !gone.data?.user, 'una persona puede borrar su cuenta', dC.error?.message);

// limpieza
await admin.from('projects').delete().eq('id', pid);
for (const u of [A, B, D]) if (u.id) await admin.auth.admin.deleteUser(u.id);

console.log(`\n${pass} correctas, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
