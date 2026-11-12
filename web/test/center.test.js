// Pruebas del centro de proyecto V3: Flujo, alertas, ruta, enlaces y texto del chat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flowState, flowLayout, progressOf, projectAlerts, projectRoute, linkKind, validUrl, linkTitle, chatSegments } from '../src/lib/center.js';

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
