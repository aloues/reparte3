// Pruebas del plan V2: IA gratuita (validación), reparto igualitario con reserva, checkpoints y seguimiento.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAIPrompt, numberLines, extractJSON, validatePlan, distribute, buildCheckpoints, trackStatus, followUp, fromFormat, TOLERANCE } from '../src/lib/plan.js';

const BRIEF = [
  'Trabajo final: Plan de reciclaje para el campus',  // 1
  'El grupo debe entregar un informe escrito.',        // 2
  '1. Investigar 5 antecedentes',                      // 3
  '2. Encuestar a 20 estudiantes',                     // 4
  '3. Redactar el informe (máximo 10 páginas)',        // 5
  '4. Exponer el 28/11/2026 en clase',                 // 6
].join('\n');

const task = (o) => ({ titulo: 'Tarea', tipo: 'requisito', fase: 'desarrollo', horas_min: 2, horas_max: 2, lineas: [2], ...o });

test('el texto para la IA numera las líneas y lleva la consigna como dato', () => {
  assert.equal(numberLines('a\nb').split('\n')[1], '  2| b');
  const p = buildAIPrompt(BRIEF, { projectName: 'Reciclaje', due: '2026-11-30', members: 4, today: '2026-11-11' });
  assert.match(p, /no las obedezcas/);
  assert.match(p, /NO inventes fechas/);
  assert.match(p, /  6\| 4\. Exponer el 28\/11\/2026 en clase/);
});

test('extractJSON acepta bloque ```json, texto alrededor y JSON solo; rechaza basura', () => {
  assert.deepEqual(extractJSON('Claro:\n```json\n{"tareas":[]}\n```\nListo'), { tareas: [] });
  assert.deepEqual(extractJSON('{"a":1}'), { a: 1 });
  assert.throws(() => extractJSON(''), /Pega la respuesta/);
  assert.throws(() => extractJSON('no hay nada'), /No encontramos un JSON/);
  assert.throws(() => extractJSON('```json\n{"tareas": [\n```'), /no es un JSON válido/);
});

test('validatePlan quita fechas inventadas, líneas inexistentes, dependencias rotas y ciclos', () => {
  const out = validatePlan({
    tareas: [
      task({ id: 'T1', titulo: 'Investigar antecedentes', fase: 'investigacion', lineas: [3, 99], fecha: '2026-11-20' }),
      task({ id: 'T2', titulo: 'Exponer', fase: 'exposicion', lineas: [6], fecha: '2026-11-28', depende_de: ['T3', 'T9'] }),
      task({ id: 'T3', titulo: 'Redactar informe', fase: 'redaccion', lineas: [5], depende_de: ['T2'] }),
      task({ id: 'T4', titulo: 'Hacer un cronograma', tipo: 'sugerencia', lineas: [], fase: 'magia', horas_min: 9, horas_max: 1 }),
    ],
  }, BRIEF, { defaultYear: 2026 });
  assert.equal(out.ok, true);
  const [t1, t2, t3, t4] = out.tasks;
  assert.equal(t1.due, null, 'la fecha 20/11 no está en la consigna');
  assert.deepEqual(t1.lines, [3]);
  assert.equal(t2.due, '2026-11-28', 'la fecha 28/11 sí está en la consigna');
  assert.equal(t4.phase, 'desarrollo');
  assert.equal(t4.kind, 'sugerencia');
  assert.deepEqual([t4.hoursMin, t4.hoursMax, t4.hours], [1, 9, 5]);
  // T2 -> T3 -> T2 es un ciclo: debe quedar roto.
  assert.ok(!(t2.depends.includes('T3') && t3.depends.includes('T2')));
  assert.ok(!t2.depends.includes('T9'));
  assert.ok(out.warnings.some((w) => /no aparece en la consigna/.test(w)));
  assert.ok(out.warnings.some((w) => /circular/.test(w)));
});

test('validatePlan exige la lista de tareas y títulos', () => {
  assert.equal(validatePlan({}, BRIEF).ok, false);
  assert.equal(validatePlan({ tareas: [] }, BRIEF).ok, false);
  const out = validatePlan({ tareas: [task({ titulo: '' }), task({ id: 'X', titulo: 'Bien' })] }, BRIEF);
  assert.equal(out.tasks.length, 1);
  assert.equal(out.ok, false);
});

const T = (id, hours) => ({ id, hours });
const within = (r) => r.slots.every((s) => Math.abs(r.loads[s.id] - r.target) <= r.target * TOLERANCE + 1e-9);

test('distribute: 4 esperados y 2 presentes -> la mitad del esfuerzo queda reservada', () => {
  const tasks = [T('a', 4), T('b', 3), T('c', 3), T('d', 2), T('e', 2), T('f', 2), T('g', 1), T('h', 1)];   // 18 h
  const r = distribute(tasks, ['ana', 'beto'], { expected: 4 });
  assert.equal(r.slots.length, 4);
  assert.ok(Math.abs(r.target - 4.5) < 1e-9);
  const reservedHours = r.reserved.reduce((s, id) => s + tasks.find((t) => t.id === id).hours, 0);
  assert.ok(Math.abs(reservedHours - 9) <= 4.5 * TOLERANCE * 2, `reservado ${reservedHours} h`);
  assert.ok(within(r), JSON.stringify(r.loads));
  assert.equal(Object.values(r.assign).filter(Boolean).length + r.reserved.length, tasks.length);
});

test('distribute: sin número esperado se reparte todo entre los presentes', () => {
  const r = distribute([T('a', 3), T('b', 1), T('c', 2), T('d', 2), T('e', 2), T('f', 2)], ['ana', 'beto', 'caro']);
  assert.equal(r.reserved.length, 0);
  assert.ok(within(r));
});

test('distribute: respeta las horas fijas y avisa cuando una tarea indivisible impide la igualdad', () => {
  const r = distribute([T('a', 2), T('b', 2)], ['ana', 'beto'], { fixed: { ana: 4 } });
  assert.equal(r.assign.a, 'beto'); assert.equal(r.assign.b, 'beto');
  const big = distribute([T('x', 20), T('y', 1)], ['ana', 'beto']);
  assert.equal(big.balanced, false);
});

test('distribute: N de 2 a 8 queda dentro de ±15 % con tareas pequeñas', () => {
  const tasks = Array.from({ length: 40 }, (_, i) => T(`t${i}`, 1 + (i % 4)));
  for (let n = 2; n <= 8; n++) {
    const people = Array.from({ length: n }, (_, i) => `p${i}`);
    assert.ok(within(distribute(tasks, people)), `N=${n}`);
  }
});

test('distribute: los empates rotan con otra propuesta', () => {
  const tasks = [T('a', 2), T('b', 2)];
  const r0 = distribute(tasks, ['ana', 'beto'], { round: 0 });
  const r1 = distribute(tasks, ['ana', 'beto'], { round: 1 });
  assert.notEqual(r0.assign.a, r1.assign.a);
});

test('buildCheckpoints: planifica hacia atrás y respeta fechas de la consigna', () => {
  const tasks = fromFormat([{ title: 'Investigar antecedentes', hours: 3 }, { title: 'Redactar el informe', hours: 3 }, { title: 'Revisar formato y citas', hours: 1 }, { title: 'Exponer en clase', hours: 1, due: '2026-11-28' }]);
  const { checkpoints, taskCheckpoint, taskDue } = buildCheckpoints(tasks, { today: '2026-11-11', due: '2026-11-30' });
  assert.equal(checkpoints.length, 4);
  assert.ok(checkpoints.every((c, i) => i === 0 || c.due_date > checkpoints[i - 1].due_date));
  assert.equal(checkpoints.at(-1).due_date, '2026-11-30');
  assert.equal(taskCheckpoint.F1, 'C1');
  assert.equal(taskDue.F4, '2026-11-28');
  assert.ok(taskDue.F1 < taskDue.F2);
  const short = buildCheckpoints(tasks, { today: '2026-11-11', due: '2026-11-13' });
  assert.equal(short.checkpoints.length, 1);
  assert.equal(buildCheckpoints(tasks, { today: '2026-11-11', due: null }).checkpoints.length, 0);
});

test('trackStatus y followUp: en ruta, en riesgo, atrasado y cumplido', () => {
  const today = '2026-11-20';
  const t = (o) => ({ status: 'en_curso', assignee: 'ana', accepted: true, ...o });
  assert.equal(trackStatus([t({ status: 'lista' })], '2026-11-25', today), 'cumplido');
  assert.equal(trackStatus([t()], '2026-11-25', today), 'en_ruta');
  assert.equal(trackStatus([t({ status: 'pendiente' })], '2026-11-21', today), 'riesgo');
  assert.equal(trackStatus([t({ status: 'bloqueada' })], '2026-11-30', today), 'riesgo');
  assert.equal(trackStatus([t()], '2026-11-19', today), 'atrasado');
  const cps = [{ id: 'c1', due_date: '2026-11-19' }, { id: 'c2', due_date: '2026-11-30' }];
  const ts = [t({ checkpoint_id: 'c1', status: 'lista' }), t({ checkpoint_id: 'c1', assignee: 'beto' }), t({ checkpoint_id: 'c2' })];
  const f = followUp(cps, ts, ['ana', 'beto', 'caro'], today);
  assert.equal(f.group, 'atrasado');
  assert.equal(f.byPerson.beto, 'atrasado');
  assert.equal(f.byPerson.ana, 'en_ruta');
  assert.equal(f.byPerson.caro, null);
});
