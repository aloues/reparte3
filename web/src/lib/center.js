// Centro de proyecto (V3): lógica pura y probada (test/center.test.js).
// Flujo del proyecto, alertas formativas, ruta del proyecto, tipos de enlace y texto del chat.
import { PHASES } from './plan.js';

const daysBetween = (a, b) => { const [y1, m1, d1] = a.split('-').map(Number); const [y2, m2, d2] = b.split('-').map(Number); return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000); };

/* ------------------------------------------------------------------ estados del Flujo */

/** Estado visual de una tarea en el Flujo. Verde = lista y aprobada; amarillo = en curso o en revisión;
 *  gris = pendiente (incluye por aceptar, sin asignar y reservada); rojo = bloqueada; rojo punteado = vencida. */
export function flowState(t, today) {
  if (t.status === 'lista') return { key: 'lista', label: 'Aprobada' };
  if (t.status === 'bloqueada') return { key: 'bloqueada', label: 'Bloqueada' };
  if (t.due_date && t.due_date < today && t.status !== 'en_revision') return { key: 'vencida', label: 'Vencida' };
  if (t.status === 'en_revision') return { key: 'en_revision', label: 'En revisión' };
  if (t.status === 'en_curso') return { key: 'en_curso', label: 'En curso' };
  if (!t.assignee) return { key: 'pendiente', label: t.reserved ? 'Reservada' : 'Sin responsable' };
  if (!t.accepted) return { key: 'pendiente', label: 'Por aceptar' };
  return { key: 'pendiente', label: 'Pendiente' };
}

const STAGES = [
  { key: 's0', label: 'Investigación', phases: ['investigacion'] },
  { key: 's1', label: 'Desarrollo', phases: ['desarrollo', 'redaccion', 'diseno'] },
  { key: 's2', label: 'Revisión e integración', phases: ['revision', 'integracion'] },
  { key: 's3', label: 'Exposición', phases: ['exposicion'] },
];

/**
 * Columnas del Flujo con datos reales:
 * - por fases si las tareas tienen fase;
 * - si no, por checkpoints;
 * - si no hay ni una ni otra, en orden de creación (secuencia simple).
 * Las flechas salen solo de dependencias reales (depends_on). No se inventa ninguna relación.
 */
export function flowLayout(tasks, checkpoints = [], today) {
  const list = tasks.slice().sort((a, b) => (a.seq || 0) - (b.seq || 0));
  let mode; let columns;
  if (list.some((t) => t.phase && PHASES[t.phase])) {
    mode = 'fases';
    columns = STAGES.map((s) => ({ key: s.key, label: s.label, tasks: list.filter((t) => s.phases.includes(t.phase)) }));
    const sinFase = list.filter((t) => !t.phase || !PHASES[t.phase]);
    if (sinFase.length) columns.push({ key: 'sin', label: 'Sin fase', tasks: sinFase });
    columns = columns.filter((c) => c.tasks.length);
  } else if (checkpoints.length && list.some((t) => t.checkpoint_id)) {
    mode = 'checkpoints';
    const cps = checkpoints.slice().sort((a, b) => a.due_date.localeCompare(b.due_date));
    columns = cps.map((c) => ({ key: c.id, label: c.title, due: c.due_date, tasks: list.filter((t) => t.checkpoint_id === c.id) }));
    const resto = list.filter((t) => !t.checkpoint_id || !cps.some((c) => c.id === t.checkpoint_id));
    if (resto.length) columns.push({ key: 'sin', label: 'Sin checkpoint', tasks: resto });
    columns = columns.filter((c) => c.tasks.length);
  } else {
    mode = 'secuencia';
    const size = Math.max(1, Math.ceil(list.length / Math.min(4, Math.max(1, Math.ceil(list.length / 4)))));
    columns = [];
    for (let i = 0; i < list.length; i += size) columns.push({ key: `q${i}`, label: `Tareas ${i + 1}–${Math.min(i + size, list.length)}`, tasks: list.slice(i, i + size) });
  }
  const ids = new Set(list.map((t) => t.id));
  const edges = list.filter((t) => t.depends_on && ids.has(t.depends_on)).map((t) => ({ from: t.depends_on, to: t.id }));
  // Fase actual: la primera columna con algo sin terminar.
  const current = columns.find((c) => c.tasks.some((t) => t.status !== 'lista')) || null;
  const states = Object.fromEntries(list.map((t) => [t.id, flowState(t, today)]));
  // Una tarea está detenida por dependencia si depende de otra que no está lista.
  const waiting = list.filter((t) => t.depends_on && ids.has(t.depends_on) && t.status !== 'lista' && list.find((x) => x.id === t.depends_on)?.status !== 'lista').map((t) => t.id);
  return { mode, columns, edges, current, states, waiting };
}

/** Avance con regla visible: cuenta como avance una tarea aprobada («Lista»). También por horas. */
export function progressOf(tasks) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'lista').length;
  const h = (t) => Number(t.hours) || 2;
  const hTotal = tasks.reduce((s, t) => s + h(t), 0);
  const hDone = tasks.filter((t) => t.status === 'lista').reduce((s, t) => s + h(t), 0);
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0, hTotal, hDone, hPct: hTotal ? Math.round((hDone / hTotal) * 100) : 0 };
}

/* ------------------------------------------------------------------ alertas formativas */

/**
 * Lo que está en riesgo, con la razón de cada alerta y una acción. Solo con datos reales.
 * level: 'riesgo' (frena el avance) o 'aviso' (conviene resolver).
 */
export function projectAlerts({ project, tasks, members, today, resources = null, uid = null }) {
  const out = [];
  const open = tasks.filter((t) => t.status !== 'lista');
  const add = (a) => out.push(a);
  open.filter((t) => t.status === 'bloqueada').forEach((t) => add({ id: `b-${t.id}`, level: 'riesgo', title: `«${t.title}» está bloqueada`, why: t.blocked_reason ? `Motivo: ${t.blocked_reason}` : 'Quien la tiene pidió ayuda.', task: t.id, action: 'Ver bloqueo' }));
  open.filter((t) => t.due_date && t.due_date < today && t.status !== 'en_revision').forEach((t) => add({ id: `o-${t.id}`, level: 'riesgo', title: `«${t.title}» pasó su fecha`, why: 'Una tarea vencida retrasa las que dependen de ella. Actualiza el avance o acuerda una nueva fecha.', task: t.id, action: 'Abrir tarea' }));
  const ids = new Map(tasks.map((t) => [t.id, t]));
  open.filter((t) => t.depends_on && ids.get(t.depends_on) && ids.get(t.depends_on).status !== 'lista' && t.due_date && daysBetween(today, t.due_date) <= 2 && daysBetween(today, t.due_date) >= 0)
    .forEach((t) => add({ id: `d-${t.id}`, level: 'riesgo', title: `«${t.title}» espera a otra tarea`, why: `Depende de «${ids.get(t.depends_on).title}», que aún no está lista, y vence en ${daysBetween(today, t.due_date) === 1 ? '1 día' : `${daysBetween(today, t.due_date)} días`}.`, task: t.id, action: 'Ver dependencia' }));
  const unassigned = open.filter((t) => !t.assignee && !t.reserved);
  if (unassigned.length) add({ id: 'u', level: 'aviso', title: unassigned.length === 1 ? '1 tarea sin responsable' : `${unassigned.length} tareas sin responsable`, why: 'Una tarea sin responsable suele quedar para el último día. Repártela o que alguien la tome.', tab: 'tareas', action: 'Repartir' , who: 'coord' });
  // Las propias ya aparecen en «Qué te toca» con su botón; aquí solo las del resto del grupo.
  const unaccepted = open.filter((t) => t.assignee && !t.accepted && t.assignee !== uid);
  if (unaccepted.length) add({ id: 'a', level: 'aviso', title: unaccepted.length === 1 ? '1 tarea sin aceptar' : `${unaccepted.length} tareas sin aceptar`, why: 'Una tarea asignada no es un compromiso hasta que la persona la acepta.', tab: 'tareas', action: 'Ver tareas' });
  const noDate = open.filter((t) => !t.due_date);
  if (noDate.length && project?.due_date) add({ id: 'f', level: 'aviso', title: noDate.length === 1 ? '1 tarea sin fecha' : `${noDate.length} tareas sin fecha`, why: 'Sin fecha no hay recordatorios ni se puede saber si va a tiempo.', tab: 'tareas', action: 'Poner fechas' });
  if (!project?.brief_text && !project?.brief_path) add({ id: 'c', level: 'aviso', title: 'Falta la consigna', why: 'Con la consigna a la vista, todos trabajan sobre lo mismo y cada tarea cita de dónde sale.', tab: 'consigna', action: 'Subir consigna', who: 'coord' });
  if (resources === 0 && tasks.length) add({ id: 'r', level: 'aviso', title: 'Aún no hay archivos ni enlaces', why: 'Guarden aquí el documento de trabajo para no buscarlo en el chat.', tab: 'archivos', action: 'Agregar enlace' });
  const missing = Math.max(0, (project?.expected_members || 0) - members.filter((m) => m.role !== 'docente').length);
  if (missing) add({ id: 'm', level: 'aviso', title: missing === 1 ? 'Falta 1 integrante' : `Faltan ${missing} integrantes`, why: tasks.some((t) => t.reserved && !t.assignee) ? 'Su parte del trabajo está reservada. Se les asigna sola cuando entren con el enlace.' : 'Invítalos con un enlace para repartir entre todos.', tab: 'equipo', action: 'Invitar', who: 'coord' });
  return out;
}

/* ------------------------------------------------------------------ ruta del proyecto (formativa) */

/**
 * Los pasos que un buen proyecto recorre. Cada uno se marca hecho con datos reales;
 * el primero sin hacer es el «siguiente paso», con la razón de por qué importa.
 */
export function projectRoute({ project, tasks, members, checkpoints }) {
  const team = members.filter((m) => m.role !== 'docente');
  const open = tasks.filter((t) => t.status !== 'lista');
  const steps = [
    { key: 'objetivo', label: 'Definir el objetivo', why: 'Un objetivo en una frase ayuda a decidir qué es importante y qué no.', done: !!project?.goal?.trim(), tab: 'resumen', action: 'Escribir objetivo' },
    { key: 'consigna', label: 'Subir la consigna', why: 'Es la fuente de lo que piden: todos leen lo mismo y cada tarea cita su línea.', done: !!(project?.brief_text || project?.brief_path), tab: 'consigna', action: 'Subir consigna' },
    { key: 'grupo', label: 'Reunir al grupo', why: 'El reparto es justo cuando se sabe quiénes son.', done: team.length >= Math.max(2, project?.expected_members || 0), tab: 'equipo', action: 'Invitar' },
    { key: 'reparto', label: 'Dar un responsable a cada tarea', why: 'Cada tarea con un responsable evita que el trabajo recaiga en una sola persona.', done: tasks.length > 0 && !open.some((t) => !t.assignee && !t.reserved), tab: 'tareas', action: 'Repartir' },
    { key: 'fechas', label: 'Acordar fechas', why: 'Con fechas y checkpoints, los avisos llegan antes de que algo se atrase.', done: tasks.length > 0 && (checkpoints.length > 0 || !open.some((t) => !t.due_date)), tab: 'tareas', action: 'Poner fechas' },
    { key: 'compromiso', label: 'Que cada quien acepte su tarea', why: 'Aceptar una tarea convierte una asignación en un compromiso.', done: tasks.length > 0 && !open.some((t) => t.assignee && !t.accepted) && !open.some((t) => !t.assignee && !t.reserved), tab: 'tareas', action: 'Ver qué falta aceptar' },
    { key: 'avance', label: 'Aprobar todas las entregas', why: 'Entregar, revisar entre pares y destrabar a tiempo: así llega la calidad antes de la nota.', done: tasks.length > 0 && !open.length, tab: 'tareas', action: 'Ir a las tareas' },
    { key: 'cierre', label: 'Cerrar y aprender', why: 'Anotar qué funcionó y qué se trabó prepara mejor el siguiente trabajo.', done: project?.status === 'archivado', tab: 'resumen', action: 'Escribir cierre' },
  ];
  const next = steps.find((s) => !s.done) || null;
  return { steps, next, doneCount: steps.filter((s) => s.done).length };
}

/* ------------------------------------------------------------------ los 4 tiempos */

export const STAGE_DEFS = [
  { n: 1, key: 'armar', label: 'Armar', what: 'Objetivo, consigna y grupo completo.', steps: ['objetivo', 'consigna', 'grupo'] },
  { n: 2, key: 'repartir', label: 'Repartir', what: 'Cada tarea con responsable, fecha y aceptada.', steps: ['reparto', 'fechas', 'compromiso'] },
  { n: 3, key: 'avanzar', label: 'Avanzar', what: 'Hacer, entregar, revisar y destrabar hasta aprobar todo.', steps: ['avance'] },
  { n: 4, key: 'cerrar', label: 'Cerrar', what: 'Escribir qué aprendieron y archivar.', steps: ['cierre'] },
];

/**
 * Los 4 tiempos de un trabajo en grupo (Armar, Repartir, Avanzar, Cerrar), calculados con datos reales.
 * state: 'done' (todos sus pasos hechos) · 'current' (el tiempo en que está el grupo) ·
 *        'open' (un tiempo anterior al actual que quedó con pasos sin hacer) · 'todo' (todavía no empieza).
 * El tiempo actual es el más avanzado que ya empezó y no está terminado; así un objetivo sin escribir
 * no «devuelve» al grupo al tiempo 1 cuando ya está entregando tareas.
 */
export function projectStages({ project, tasks, members, checkpoints }) {
  const route = projectRoute({ project, tasks, members, checkpoints });
  const byKey = Object.fromEntries(route.steps.map((s) => [s.key, s]));
  const open = tasks.filter((t) => t.status !== 'lista');
  const archived = project?.status === 'archivado';
  const begun = [
    true,
    tasks.length > 0,
    tasks.some((t) => ['en_curso', 'en_revision', 'lista', 'bloqueada'].includes(t.status)),
    archived || (tasks.length > 0 && !open.length),
  ];
  const stages = STAGE_DEFS.map((d, i) => {
    const steps = d.steps.map((k) => byKey[k]);
    return { ...d, steps, done: steps.every((s) => s.done), begun: begun[i], doneSteps: steps.filter((s) => s.done).length };
  });
  let ci = -1;
  if (!archived) for (let i = stages.length - 1; i >= 0; i--) if (stages[i].begun && !stages[i].done) { ci = i; break; }
  if (ci === -1 && !archived) ci = stages.findIndex((s) => !s.done);
  const total = tasks.length;
  const assigned = tasks.filter((t) => t.assignee).length;
  const accepted = tasks.filter((t) => t.assignee && (t.accepted || t.status === 'lista')).length;
  const approved = total - open.length;
  const metric = {
    armar: `${stages[0].doneSteps} de 3 pasos`,
    repartir: total ? `${accepted} de ${total} aceptadas` : 'Sin tareas',
    avanzar: total ? `${approved} de ${total} aprobadas` : 'Sin tareas',
    cerrar: archived ? 'Archivado' : project?.closing_notes?.trim() ? 'Cierre escrito' : 'Sin cierre',
  };
  const out = stages.map((s, i) => {
    const state = s.done ? 'done' : i === ci ? 'current' : (ci > -1 && i < ci) || archived ? 'open' : 'todo';
    const nextStep = s.steps.find((x) => !x.done) || null;
    return { ...s, state, metric: metric[s.key], nextStep };
  });
  return {
    stages: out,
    current: ci > -1 ? out[ci] : null,
    complete: ci === -1,
    counts: { total, assigned, accepted, approved, open: open.length },
    route,
  };
}

/* ------------------------------------------------------------------ enlaces */

export const LINK_KINDS = {
  doc: 'Documento de Google', sheet: 'Hoja de cálculo de Google', slides: 'Presentación de Google', form: 'Formulario de Google',
  folder: 'Carpeta de Drive', drive: 'Archivo de Drive', pdf: 'PDF', video: 'Video', web: 'Página web',
};
/** Igual que public.link_kind() en la base. */
export function linkKind(u) {
  const s = String(u || '');
  if (/docs\.google\.com\/document/i.test(s)) return 'doc';
  if (/docs\.google\.com\/spreadsheets/i.test(s)) return 'sheet';
  if (/docs\.google\.com\/presentation/i.test(s)) return 'slides';
  if (/docs\.google\.com\/forms|forms\.gle/i.test(s)) return 'form';
  if (/drive\.google\.com\/drive\/(u\/\d+\/)?folders/i.test(s)) return 'folder';
  if (/drive\.google\.com/i.test(s)) return 'drive';
  if (/\.pdf($|\?|#)/i.test(s)) return 'pdf';
  if (/youtube\.com|youtu\.be|vimeo\.com/i.test(s)) return 'video';
  return 'web';
}
export function validUrl(u) {
  try { const x = new URL(String(u).trim()); return (x.protocol === 'http:' || x.protocol === 'https:') && !!x.hostname && String(u).length <= 2000; } catch (e) { return false; }
}
/** Título legible cuando el enlace no tiene uno. */
export function linkTitle(l) {
  if (l.title?.trim()) return l.title.trim();
  try { const x = new URL(l.url); return `${LINK_KINDS[linkKind(l.url)]} en ${x.hostname.replace(/^www\./, '')}`; } catch (e) { return l.url; }
}

/* ------------------------------------------------------------------ texto del chat */

/** Parte un mensaje en texto, enlaces y referencias a tareas (#12). Nada se interpreta como HTML. */
export function chatSegments(body, tasksBySeq = {}) {
  const out = [];
  const re = /(https?:\/\/[^\s<>"']+)|(^|[\s(])#(\d{1,4})\b/g;
  let last = 0; let m;
  while ((m = re.exec(body))) {
    if (m[1]) {
      const url = m[1].replace(/[.,;:!?)\]]+$/, '');
      if (m.index > last) out.push({ type: 'text', value: body.slice(last, m.index) });
      out.push({ type: 'url', value: url });
      last = m.index + url.length;
      re.lastIndex = last;
    } else {
      const seq = Number(m[3]);
      const start = m.index + m[2].length;
      if (tasksBySeq[seq]) {
        if (start > last) out.push({ type: 'text', value: body.slice(last, start) });
        out.push({ type: 'task', value: `#${seq}`, task: tasksBySeq[seq] });
        last = start + 1 + m[3].length;
      }
    }
  }
  if (last < body.length) out.push({ type: 'text', value: body.slice(last) });
  return out;
}
