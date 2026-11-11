// Pruebas de la lógica pura de la web (sin servidor). Ejecutar: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBrief, findDates, proposeDistribution, estimateHours } from '../src/lib/detect.js';
import { displayStatus, myQueue, relDays, initials, isPremium } from '../src/lib/format.js';

const T = '2026-11-10';

test('analyzeBrief detecta viñetas, numeraciones y verbos de entrega', () => {
  const text = [
    'Trabajo final de Comunicación',
    'El grupo debe entregar un informe escrito.',
    '1. Investigar antecedentes del problema',
    '- Redactar la introducción',
    '• Diseñar las diapositivas para el 25/11/2026',
    'Texto suelto sin tarea',
    '- Redactar la introducción',
  ].join('\n');
  const out = analyzeBrief(text, 2026);
  assert.deepEqual(out.map((x) => x.title), [
    'El grupo debe entregar un informe escrito.',
    'Investigar antecedentes del problema',
    'Redactar la introducción',
    'Diseñar las diapositivas para el 25/11/2026',
  ]);
  assert.equal(out[1].line, 3);
  assert.equal(out[3].due, '2026-11-25');
});

test('findDates reconoce fechas numéricas y escritas, y descarta inválidas', () => {
  assert.deepEqual(findDates('entrega el 3 de diciembre', 2026).map((d) => d.iso), ['2026-12-03']);
  assert.deepEqual(findDates('el 31/02/2026 no existe', 2026), []);
  assert.equal(findDates('vence 5/12', 2026)[0].yearInferred, true);
});

test('estimateHours da más horas a tareas de investigación o redacción', () => {
  assert.equal(estimateHours('Investigar el mercado'), 3);
  assert.equal(estimateHours('Revisar formato APA'), 1);
  assert.equal(estimateHours('Exponer'), 2);
});

test('proposeDistribution reparte primero lo largo a quien tiene menos carga y rota empates', () => {
  const tasks = [
    { id: 'a', seq: 1, hours: 4, status: 'pendiente' },
    { id: 'b', seq: 2, hours: 2, status: 'pendiente' },
    { id: 'c', seq: 3, hours: 2, status: 'pendiente' },
    { id: 'd', seq: 4, hours: 3, status: 'pendiente', assignee: 'ana' },
  ];
  const m = proposeDistribution(tasks, ['ana', 'beto'], 0);
  assert.equal(m.d, undefined, 'no toca tareas ya asignadas');
  assert.equal(m.a, 'beto', 'la tarea larga va a quien tiene 0 h');
  assert.equal(m.b, 'ana');
  const r1 = proposeDistribution([{ id: 'x', seq: 1, hours: 2, status: 'pendiente' }], ['ana', 'beto'], 1);
  assert.equal(r1.x, 'beto', 'el empate rota con la ronda');
});

test('displayStatus prioriza bloqueo y vencimiento, y distingue por aceptar', () => {
  const base = { status: 'pendiente', assignee: 'u', accepted: true, due_date: '2026-11-20' };
  assert.equal(displayStatus({ ...base, status: 'lista', due_date: '2026-11-01' }, T), 'done');
  assert.equal(displayStatus({ ...base, status: 'bloqueada' }, T), 'blocked');
  assert.equal(displayStatus({ ...base, due_date: '2026-11-09' }, T), 'overdue');
  assert.equal(displayStatus({ ...base, status: 'en_revision', due_date: '2026-11-09' }, T), 'review');
  assert.equal(displayStatus({ ...base, assignee: null }, T), 'unassigned');
  assert.equal(displayStatus({ ...base, accepted: false }, T), 'accept');
  assert.equal(displayStatus({ ...base, status: 'en_curso' }, T), 'progress');
});

test('myQueue: acepto lo mío, reviso lo ajeno solo si mi rol revisa, y el docente no actúa', () => {
  const projects = [{ id: 'p1', myRole: 'integrante' }, { id: 'p2', myRole: 'revisor' }, { id: 'p3', myRole: 'docente' }];
  const tasks = [
    { id: 1, project_id: 'p1', assignee: 'me', accepted: false, status: 'pendiente' },
    { id: 2, project_id: 'p1', assignee: 'otro', accepted: true, status: 'en_revision' },
    { id: 3, project_id: 'p2', assignee: 'otro', accepted: true, status: 'en_revision', due_date: '2026-11-12' },
    { id: 4, project_id: 'p2', assignee: 'me', accepted: true, status: 'en_revision' },
    { id: 5, project_id: 'p3', assignee: 'me', accepted: false, status: 'pendiente' },
    { id: 6, project_id: 'p1', assignee: 'me', accepted: true, status: 'bloqueada' },
  ];
  const q = myQueue(tasks, projects, 'me', T);
  assert.deepEqual(q.map((x) => [x.t.id, x.kind]), [[3, 'review'], [1, 'accept'], [6, 'blocked']]);
});

test('utilidades de texto', () => {
  assert.equal(initials('Informe de gestión ambiental'), 'IG');
  assert.equal(initials(''), '?');
  assert.equal(typeof relDays('2026-12-01'), 'string');
  assert.equal(isPremium({ plan: 'premium' }), true);
  assert.equal(isPremium({ plan: 'premium', premium_until: '2000-01-01T00:00:00Z' }), false);
  assert.equal(isPremium({ plan: 'gratis' }), false);
});
