// Pruebas del centro de proyecto V3: Flujo, alertas, ruta, enlaces y texto del chat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flowState, flowLayout, progressOf, projectAlerts, projectRoute, projectStages, linkKind, validUrl, linkTitle, chatSegments } from '../src/lib/center.js';

const today = '2026-11-20';
const T = (o) => ({ id: o.id, seq: o.seq ?? 1, title: o.title ?? o.id, status: 'pendiente', assignee: 'ana', accepted: true, ...o });

test('flowState: verde, amarillo, gris, rojo y vencida distinta de bloqueada', () => {
  assert.equal(flowState(T({ id: 'a', status: 'lista' }), today).key, 'lista');
  assert.equal(flowState(T({ id: 'a', status: 'en_curso' }), today).key, 'en_curso');
  assert.equal(flowState(T({ id: 'a', status: 'en_revision', due_date: '2026-11-01' }), today).key, 'en_revision');
  assert.equal(flowState(T({ id: 'a', status: 'bloqueada', due_date: '2026-11-01' }), today).key, 'bloqueada');
  assert.equal(flowState(T({ id: 'a', due_date: '2026-11-19' }), today).key, 'vencida');
  assert.deepEqual(flowState(T({ id: 'a', assignee: null, reserved: true }), today), { key: 'pendiente', label: 'Reservada' });
  assert.equal(flowState(T({ id: 'a', accepted: false }), today).label, 'Por aceptar');
});

test('flowLayout: por fases, por checkpoints o secuencia; flechas solo de dependencias reales', () => {
  const byPhase = flowLayout([T({ id: 'a', seq: 1, phase: 'investigacion' }), T({ id: 'b', seq: 2, phase: 'redaccion', depends_on: 'a' }), T({ id: 'c', seq: 3, phase: 'exposicion', depends_on: 'zzz' })], [], today);
  assert.equal(byPhase.mode, 'fases');
  assert.deepEqual(byPhase.columns.map((c) => c.label), ['Investigación', 'Desarrollo', 'Exposición']);
  assert.deepEqual(byPhase.edges, [{ from: 'a', to: 'b' }], 'la dependencia a una tarea inexistente no se dibuja');
  assert.equal(byPhase.current.label, 'Investigación');
  assert.deepEqual(byPhase.waiting, ['b']);

  const cps = [{ id: 'c2', title: 'Entrega', due_date: '2026-12-01' }, { id: 'c1', title: 'Avance', due_date: '2026-11-25' }];
  const byCp = flowLayout([T({ id: 'a', checkpoint_id: 'c2' }), T({ id: 'b', checkpoint_id: 'c1' })], cps, today);
  assert.equal(byCp.mode, 'checkpoints');
  assert.deepEqual(byCp.columns.map((c) => c.label), ['Avance', 'Entrega']);

  const seq = flowLayout([T({ id: 'a', seq: 1 }), T({ id: 'b', seq: 2 })], [], today);
  assert.equal(seq.mode, 'secuencia');
  assert.equal(seq.edges.length, 0);
});

test('progressOf: cuenta solo tareas aprobadas, por cantidad y por horas', () => {
  const p = progressOf([T({ id: 'a', status: 'lista', hours: 3 }), T({ id: 'b', status: 'en_revision', hours: 1 })]);
  assert.deepEqual([p.done, p.total, p.pct, p.hDone, p.hTotal, p.hPct], [1, 2, 50, 3, 4, 75]);
});

test('projectAlerts: alertas con motivo, solo cuando los datos las sustentan', () => {
  const project = { due_date: '2026-12-01', expected_members: 3, brief_text: null };
  const tasks = [
    T({ id: 'a', status: 'bloqueada', blocked_reason: 'faltan datos' }),
    T({ id: 'b', due_date: '2026-11-18' }),
    T({ id: 'c', assignee: null }),
    T({ id: 'd', accepted: false, due_date: '2026-11-30' }),
    T({ id: 'e', due_date: '2026-11-21', depends_on: 'a' }),
  ];
  const ids = projectAlerts({ project, tasks, members: [{ role: 'coordinador' }, { role: 'integrante' }], today, resources: 0 }).map((a) => a.id);
  assert.ok(ids.includes('b-a') && ids.includes('o-b') && ids.includes('d-e'));
  assert.ok(ids.includes('u') && ids.includes('a') && ids.includes('c') && ids.includes('r') && ids.includes('m') && ids.includes('f'));
  const calm = projectAlerts({ project: { brief_text: 'x' }, tasks: [T({ id: 'z', status: 'lista' })], members: [{ role: 'coordinador' }], today, resources: 2 });
  assert.equal(calm.length, 0);
});

test('projectRoute: el siguiente paso es el primero sin hacer', () => {
  const r0 = projectRoute({ project: {}, tasks: [], members: [], checkpoints: [] });
  assert.equal(r0.next.key, 'objetivo');
  const r1 = projectRoute({ project: { goal: 'Plan de reciclaje viable', brief_text: 'x', expected_members: 2 }, tasks: [T({ id: 'a', assignee: null })], members: [{ role: 'coordinador' }, { role: 'integrante' }], checkpoints: [] });
  assert.equal(r1.next.key, 'reparto');
});

test('enlaces: tipo por URL, validación y título legible', () => {
  assert.equal(linkKind('https://docs.google.com/document/d/abc/edit'), 'doc');
  assert.equal(linkKind('https://docs.google.com/spreadsheets/d/abc'), 'sheet');
  assert.equal(linkKind('https://docs.google.com/presentation/d/abc'), 'slides');
  assert.equal(linkKind('https://drive.google.com/drive/folders/abc'), 'folder');
  assert.equal(linkKind('https://drive.google.com/file/d/abc/view'), 'drive');
  assert.equal(linkKind('https://x.org/rubrica.pdf'), 'pdf');
  assert.equal(validUrl('javascript:alert(1)'), false);
  assert.equal(validUrl('https://docs.google.com/document/d/abc'), true);
  assert.equal(linkTitle({ url: 'https://www.example.org/a', title: '' }), 'Página web en example.org');
});

test('chatSegments: enlaces y #tareas sin interpretar HTML', () => {
  const segs = chatSegments('Revisen #3 y el doc https://docs.google.com/x. <b>ojo</b> #99', { 3: 't3' });
  assert.deepEqual(segs.map((s) => s.type), ['text', 'task', 'text', 'url', 'text']);
  assert.equal(segs[3].value, 'https://docs.google.com/x');
  assert.ok(segs[4].value.includes('<b>ojo</b> #99'), '#99 no existe y queda como texto; el HTML queda como texto');
});

test('projectRoute: con trabajo pendiente el siguiente paso es revisar el avance, no cerrar', () => {
  const tasks = [T({ id: 'a', status: 'lista' }), T({ id: 'b', status: 'en_curso' })];
  const r = projectRoute({ project: { goal: 'x', brief_text: 'y', expected_members: 2, due_date: '2026-12-01' }, tasks: tasks.map((t) => ({ ...t, due_date: '2026-11-30' })), members: [{ role: 'coordinador' }, { role: 'integrante' }], checkpoints: [{ id: 'c' }] });
  assert.equal(r.next.key, 'avance');
});

test('projectStages: proyecto nuevo está en Armar y lo demás no empieza', () => {
  const s = projectStages({ project: {}, tasks: [], members: [{ role: 'coordinador' }], checkpoints: [] });
  assert.equal(s.current.key, 'armar');
  assert.deepEqual(s.stages.map((x) => x.state), ['current', 'todo', 'todo', 'todo']);
});

test('projectStages: con tareas aceptadas y en curso el grupo está en Avanzar aunque falte el objetivo', () => {
  const members = [{ role: 'coordinador' }, { role: 'integrante' }];
  const tasks = [T({ id: 'a', status: 'en_curso', due_date: '2026-11-30' }), T({ id: 'b', due_date: '2026-11-30' })];
  const s = projectStages({ project: { brief_text: 'x', expected_members: 2 }, tasks, members, checkpoints: [{ id: 'c' }] });
  assert.equal(s.current.key, 'avanzar');
  assert.equal(s.stages[0].state, 'open'); // falta el objetivo: queda marcado, no retrocede
  assert.equal(s.stages[1].state, 'done');
  assert.equal(s.stages[2].metric, '0 de 2 aprobadas');
});

test('projectStages: todo aprobado lleva a Cerrar; archivado completa el proyecto', () => {
  const members = [{ role: 'coordinador' }, { role: 'integrante' }];
  const tasks = [T({ id: 'a', status: 'lista', due_date: '2026-11-30' })];
  const base = { goal: 'g', brief_text: 'x', expected_members: 2 };
  const s = projectStages({ project: base, tasks, members, checkpoints: [{ id: 'c' }] });
  assert.equal(s.current.key, 'cerrar');
  const z = projectStages({ project: { ...base, status: 'archivado' }, tasks, members, checkpoints: [{ id: 'c' }] });
  assert.equal(z.current, null);
  assert.equal(z.complete, true);
  assert.equal(z.stages[3].metric, 'Archivado');
});

test('projectStages: tareas asignadas sin aceptar dejan al grupo en Repartir', () => {
  const members = [{ role: 'coordinador' }, { role: 'integrante' }];
  const tasks = [T({ id: 'a', accepted: false, due_date: '2026-11-30' }), T({ id: 'b', accepted: false, due_date: '2026-11-30' })];
  const s = projectStages({ project: { goal: 'g', brief_text: 'x', expected_members: 2 }, tasks, members, checkpoints: [] });
  assert.equal(s.current.key, 'repartir');
  assert.equal(s.current.nextStep.key, 'compromiso');
  assert.equal(s.stages[1].metric, '0 de 2 aceptadas');
});

test('projectStages: una tarea aceptada sin trabajo empezado no salta a Avanzar', () => {
  const members = [{ role: 'coordinador' }, { role: 'integrante' }];
  const tasks = [T({ id: 'a', accepted: true }), T({ id: 'b', accepted: false }), T({ id: 'c', accepted: false })];
  const s = projectStages({ project: { goal: 'g', brief_text: 'x', expected_members: 2 }, tasks, members, checkpoints: [] });
  assert.equal(s.current.key, 'repartir');
});

test('projectStages: archivado con tareas abiertas no tiene tiempo en curso', () => {
  const members = [{ role: 'coordinador' }, { role: 'integrante' }];
  const tasks = [T({ id: 'a', status: 'en_curso' }), T({ id: 'b', status: 'lista' })];
  const s = projectStages({ project: { goal: 'g', brief_text: 'x', expected_members: 2, status: 'archivado' }, tasks, members, checkpoints: [] });
  assert.equal(s.current, null);
  assert.equal(s.complete, true);
  assert.equal(s.stages[2].state, 'open');
  assert.equal(s.stages[3].state, 'done');
});

test('projectStages: las tareas reservadas para quien falta no dejan Repartir abierto', () => {
  const members = [{ role: 'coordinador' }, { role: 'integrante' }];
  const tasks = [T({ id: 'a', due_date: '2026-11-30' }), T({ id: 'b', assignee: null, reserved: true, accepted: false, due_date: '2026-11-30' })];
  const s = projectStages({ project: { goal: 'g', brief_text: 'x', expected_members: 2 }, tasks, members, checkpoints: [] });
  assert.equal(s.stages[1].done, true);
});

test('projectStages: cierre escrito sin archivar sigue en Cerrar', () => {
  const members = [{ role: 'coordinador' }, { role: 'integrante' }];
  const s = projectStages({ project: { goal: 'g', brief_text: 'x', expected_members: 2, closing_notes: 'aprendimos' }, tasks: [T({ id: 'a', status: 'lista', due_date: '2026-11-30' })], members, checkpoints: [{ id: 'c' }] });
  assert.equal(s.current.key, 'cerrar');
  assert.equal(s.stages[3].metric, 'Cierre escrito');
});
