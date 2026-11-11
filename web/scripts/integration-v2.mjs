// Prueba de integración V2 contra un Supabase REAL de prueba (local con `supabase start`).
// Sala de espera, plan con reserva, asignación automática al unirse, «Ya estamos todos», checkpoints y permisos.
// Uso: SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node web/scripts/integration-v2.mjs
// NO usar contra producción: crea datos de prueba.
import { createClient } from '@supabase/supabase-js';
import { distribute, buildCheckpoints, fromFormat } from '../src/lib/plan.js';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
if (!URL || !ANON) { console.error('Faltan SUPABASE_URL o SUPABASE_ANON_KEY'); process.exit(2); }
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const run = Date.now().toString(36);
let pass = 0; let fail = 0;
const ok = (cond, name, extra) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); } };

async function user(label) {
  const c = createClient(URL, ANON, opts);
  const email = `${label}-${run}@test.reparte3.local`;
  const { data, error } = await c.auth.signUp({ email, password: 'clave-de-prueba-123', options: { data: { display_name: `${label} ${run}`, birth_date: '2004-05-01', level: 'universidad' } } });
  if (error) throw error;
  if (!data.session) { const r = await c.auth.signInWithPassword({ email, password: 'clave-de-prueba-123' }); if (r.error) throw r.error; }
  return { c, id: data.user.id };
}
const tasksOf = async (u, pid) => (await u.c.from('tasks').select('*').eq('project_id', pid).order('seq')).data || [];
const hoursFor = (ts, id) => ts.filter((t) => t.assignee === id).reduce((s, t) => s + Number(t.hours || 2), 0);

const A = await user('coord'); const B = await user('beto'); const C = await user('caro'); const D = await user('dani'); const X = await user('ajeno');

console.log('\nSala de espera: 4 esperados');
const pr = await A.c.rpc('create_project', { p_name: `Plan ${run}`, p_course: 'Prueba V2', p_due: '2026-12-15', p_expected: 4 });
const pid = pr.data;
ok(!!pid, 'crea el proyecto con 4 integrantes esperados', pr.error?.message);
const bad = await A.c.rpc('create_project', { p_name: 'Malo', p_course: '', p_due: null, p_expected: 40 });
ok(!!bad.error, 'rechaza más de 15 esperados');
const inv = (await A.c.from('invites').insert({ project_id: pid, role: 'integrante' }).select().single()).data;
const jB = await B.c.rpc('join_project', { p_code: inv.code });
ok(jB.data === pid, 'entra el segundo integrante antes del plan', jB.error?.message);

console.log('\nPlan con 2 presentes y 2 reservas');
const found = [
  { title: 'Investigar antecedentes', hours: 4 }, { title: 'Encuestar a estudiantes', hours: 3 }, { title: 'Analizar resultados', hours: 3 },
  { title: 'Redactar informe', hours: 4 }, { title: 'Diseñar diapositivas', hours: 2 }, { title: 'Revisar formato y citas', hours: 1 },
  { title: 'Integrar el documento final', hours: 2 }, { title: 'Exponer en clase', hours: 1 },
];
const plan = fromFormat(found);
const r = distribute(plan, [A.id, B.id], { expected: 4 });
const { checkpoints, taskCheckpoint, taskDue } = buildCheckpoints(plan, { today: '2026-11-11', due: '2026-12-15' });
const payload = plan.map((t) => ({ key: t.id, title: t.title, hours: t.hours, due_date: taskDue[t.id], phase: t.phase, kind: t.kind, origin: 'formato', checkpoint: taskCheckpoint[t.id], assignee: r.assign[t.id], reserved: r.assign[t.id] === null, depends: [] }));
const notCoord = await B.c.rpc('save_plan', { p_project: pid, p_checkpoints: checkpoints, p_tasks: payload });
ok(!!notCoord.error, 'solo la coordinación confirma el plan');
const sp = await A.c.rpc('save_plan', { p_project: pid, p_checkpoints: checkpoints, p_tasks: payload });
ok(sp.data === plan.length, `guarda ${plan.length} tareas y ${checkpoints.length} checkpoints`, sp.error?.message);
let ts = await tasksOf(A, pid);
const reserved = ts.filter((t) => t.reserved && !t.assignee);
ok(reserved.length === r.reserved.length && reserved.length > 0, `quedan ${reserved.length} tareas reservadas para quienes faltan`);
ok(ts.every((t) => t.checkpoint_id), 'cada tarea tiene su checkpoint');
const cps = (await B.c.from('checkpoints').select('*').eq('project_id', pid)).data || [];
ok(cps.length === checkpoints.length, 'los integrantes ven los checkpoints');
ok(((await X.c.from('checkpoints').select('*').eq('project_id', pid)).data || []).length === 0, 'una persona ajena no ve los checkpoints');
const tB = ts.filter((t) => t.assignee === B.id);
ok(tB.length > 0 && tB.every((t) => !t.accepted), 'las tareas de Beto quedan por aceptar');
const nB = (await B.c.from('notifications').select('*').eq('user_id', B.id).eq('kind', 'asignada')).data || [];
ok(nB.length === tB.length, 'a Beto le llega un aviso por cada tarea asignada');

console.log('\nEntra el tercero: recibe su parte de la reserva');
const jC = await C.c.rpc('join_project', { p_code: inv.code });
ok(jC.data === pid, 'Caro se une', jC.error?.message);
ts = await tasksOf(A, pid);
const total = ts.reduce((s, t) => s + Number(t.hours || 2), 0);
const target = total / 4;
const hC = hoursFor(ts, C.id);
ok(hC > 0 && Math.abs(hC - target) <= target * 0.15 + 2, `Caro recibe ${hC} h (parte objetivo ${target} h)`);
const tC = ts.filter((t) => t.assignee === C.id);
ok(tC.every((t) => !t.accepted), 'lo recibido queda por aceptar, aunque lo disparó Caro al unirse');
const nC = (await C.c.from('notifications').select('*').eq('user_id', C.id).eq('kind', 'asignada')).data || [];
ok(nC.length === tC.length && nC.every((n) => n.title.startsWith('Te tocó')), 'a Caro le llega «Te tocó…» por cada tarea');
const nA = (await A.c.from('notifications').select('*').eq('user_id', A.id).eq('kind', 'miembro')).data || [];
ok(nA.some((n) => /Recibió \d+ tareas de la reserva/.test(n.body)), 'la coordinación sabe cuántas tareas recibió Caro');
ok(ts.some((t) => t.reserved && !t.assignee), 'todavía queda reserva para la cuarta persona');

console.log('\nEntra la cuarta: se completa el grupo y no queda reserva');
const jD = await D.c.rpc('join_project', { p_code: inv.code });
ok(jD.data === pid, 'Dani se une', jD.error?.message);
ts = await tasksOf(A, pid);
ok(!ts.some((t) => t.reserved || !t.assignee), 'ya no queda ninguna tarea reservada ni sin responsable');
const loads = [A, B, C, D].map((u) => hoursFor(ts, u.id));
ok(Math.max(...loads) - Math.min(...loads) <= 3, `cargas finales parejas: ${loads.join(' / ')} h`);

console.log('\nSi alguien sale, sus tareas vuelven a la reserva');
const before = ts.filter((t) => t.assignee === D.id).length;
await D.c.from('memberships').delete().eq('project_id', pid).eq('user_id', D.id);
ts = await tasksOf(A, pid);
ok(ts.filter((t) => t.reserved && !t.assignee).length === before, `las ${before} tareas de Dani vuelven a la reserva`);

console.log('\n«Ya estamos todos»');
const relB = await B.c.rpc('release_reserved', { p_project: pid });
ok(!!relB.error, 'solo la coordinación puede cerrar el grupo');
const rel = await A.c.rpc('release_reserved', { p_project: pid });
ok(rel.data === before, `se reparten las ${before} tareas reservadas entre los 3 presentes`, rel.error?.message);
ts = await tasksOf(A, pid);
ok(!ts.some((t) => t.reserved || !t.assignee), 'no queda nada reservado');
const p2 = (await A.c.from('projects').select('expected_members').eq('id', pid).single()).data;
ok(p2.expected_members === 3, 'el grupo queda cerrado en 3 integrantes');

console.log('\nSin número esperado: entra alguien tarde y no recibe nada solo');
const pr2 = await A.c.rpc('create_project', { p_name: `Libre ${run}`, p_course: '', p_due: '2026-12-15' });
const plan2 = fromFormat(found.slice(0, 4));
const r2 = distribute(plan2, [A.id]);
await A.c.rpc('save_plan', { p_project: pr2.data, p_checkpoints: [], p_tasks: plan2.map((t) => ({ key: t.id, title: t.title, hours: t.hours, assignee: r2.assign[t.id], reserved: false })) });
const inv2 = (await A.c.from('invites').insert({ project_id: pr2.data, role: 'integrante' }).select().single()).data;
await X.c.rpc('join_project', { p_code: inv2.code });
const ts2 = await tasksOf(A, pr2.data);
ok(!ts2.some((t) => t.assignee === X.id), 'sin reserva, quien entra tarde no recibe tareas automáticamente');

console.log(`\nResultado: ${pass} pasan, ${fail} fallan`);
process.exit(fail ? 1 : 0);
