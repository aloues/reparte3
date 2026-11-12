// Fechas en hora de Lima. Las fechas de tareas llegan como 'YYYY-MM-DD'.
export const TZ = 'America/Lima';
export const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

export const parseISO = (s) => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const daysFrom = (iso) => { if (!iso) return null; return Math.round((parseISO(iso) - parseISO(todayISO())) / 86400000); };

const fShort = new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short' });
const fDay = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });
const fLong = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' });
const fWd = new Intl.DateTimeFormat('es', { weekday: 'short' });
const fTime = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const fDateTime = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ });

export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export const fmtShort = (iso) => (iso ? fShort.format(parseISO(iso)) : 'Sin fecha');
export const fmtDay = (iso) => (iso ? fDay.format(parseISO(iso)) : 'Sin fecha');
export const fmtWd = (iso) => fWd.format(parseISO(iso)).replace('.', '');
export const fmtToday = () => cap(fLong.format(parseISO(todayISO())));
export function relDays(iso) {
  const n = daysFrom(iso);
  if (n == null) return '';
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  if (n === -1) return 'ayer';
  return n < 0 ? `hace ${-n} días` : `en ${n} días`;
}
export function ago(ts) {
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 50) return 'ahora';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400 && new Date(ts).toDateString() === new Date().toDateString()) return fTime.format(new Date(ts));
  return fDateTime.format(new Date(ts));
}
export const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

const STOP = new Set(['de', 'del', 'la', 'el', 'y', 'en', 'los', 'las']);
export const initials = (name = '') => name.split(/\s+/).filter((w) => w && !STOP.has(w.toLowerCase())).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

/* ---------- estados ---------- */
// Estado que se muestra, derivado de la tarea en la base (status + accepted + fecha).
export function displayStatus(t, today = todayISO()) {
  if (t.status === 'lista') return 'done';
  if (t.status === 'bloqueada') return 'blocked';
  if (t.due_date && t.due_date < today && t.status !== 'en_revision') return 'overdue';
  if (t.status === 'en_revision') return 'review';
  if (!t.assignee) return t.reserved ? 'reserved' : 'unassigned';
  if (!t.accepted) return 'accept';
  if (t.status === 'en_curso') return 'progress';
  return 'todo';
}
export const STATUS = {
  // Mismos colores que el Flujo (tokens --st-*): ámbar = en curso / en revisión, rosa = bloqueada o vencida,
  // esmeralda = lista. El azul de acento queda para lo que pide una acción tuya (por aceptar).
  overdue:    { label: 'Vencida',     dot: 'ring-[2px] ring-inset ring-st-blocked', badge: 'bg-transparent text-red ring-st-blocked/45' },
  blocked:    { label: 'Bloqueada',   dot: 'bg-st-blocked', badge: 'bg-st-blocked/10 text-red ring-st-blocked/30' },
  accept:     { label: 'Por aceptar', dot: 'bg-accent',     badge: 'bg-accent/10 text-accent ring-accent/25' },
  review:     { label: 'En revisión', dot: 'ring-[2px] ring-inset ring-st-progress', badge: 'bg-st-progress/10 text-amber ring-st-progress/35' },
  progress:   { label: 'En curso',    dot: 'bg-st-progress', badge: 'bg-st-progress/15 text-amber ring-st-progress/35' },
  todo:       { label: 'Pendiente',   dot: 'ring-[1.5px] ring-inset ring-fg-3', badge: 'bg-hov text-fg-2 ring-line' },
  unassigned: { label: 'Sin asignar', dot: 'border border-dashed border-fg-3', badge: 'text-fg-2 ring-line' },
  reserved:   { label: 'Reservada',   dot: 'border border-dashed border-accent', badge: 'text-accent ring-accent/30' },
  done:      { label: 'Aprobada',       dot: 'bg-st-done', badge: 'bg-st-done/10 text-st-done-text ring-st-done/30' },
};
export const COLUMNS = [
  { id: 'pendiente', label: 'Pendiente', dot: 'todo' },
  { id: 'en_curso', label: 'En curso', dot: 'progress' },
  { id: 'en_revision', label: 'En revisión', dot: 'review' },
  { id: 'bloqueada', label: 'Bloqueada', dot: 'blocked' },
  { id: 'lista', label: 'Aprobada', dot: 'done' },
];
export const GROUPS = [
  { id: 'atencion', label: 'Requieren atención', st: 'blocked', test: (s) => s === 'blocked' || s === 'overdue' },
  { id: 'accept', label: 'Por aceptar', st: 'accept', test: (s) => s === 'accept' },
  { id: 'review', label: 'En revisión', st: 'review', test: (s) => s === 'review' },
  { id: 'progress', label: 'En curso', st: 'progress', test: (s) => s === 'progress' },
  { id: 'todo', label: 'Pendientes', st: 'todo', test: (s) => s === 'todo' || s === 'unassigned' },
  { id: 'reserved', label: 'Reservadas para quienes faltan', st: 'reserved', test: (s) => s === 'reserved' },
  { id: 'done', label: 'Completadas', st: 'done', test: (s) => s === 'done', closed: true },
];
export const ROLES = {
  coordinador: { label: 'Coordinación', short: 'Coordinador', desc: 'Reparte, invita, asigna roles y revisa.' },
  integrante: { label: 'Integrante', short: 'Integrante', desc: 'Acepta, avanza y entrega sus tareas.' },
  revisor: { label: 'Revisión', short: 'Revisor', desc: 'Además de sus tareas, aprueba o pide cambios en las entregas.' },
  docente: { label: 'Docente', short: 'Docente', desc: 'Ve el avance y los bloqueos. No edita ni escribe.' },
};
export const LEVELS = { universidad: 'Universidad', instituto: 'Instituto', colegio: 'Colegio (secundaria)', otro: 'Otro' };

export const isPremium = (p) => p && p.plan === 'premium' && (!p.premium_until || new Date(p.premium_until) > new Date());

/** Lo que me toca hacer ahora, en todos mis proyectos. */
export function myQueue(tasks, projects, uid, today = todayISO()) {
  // Un proyecto archivado no se puede editar: sus tareas no son pendientes de nadie.
  const roleOf = Object.fromEntries(projects.filter((p) => p.status !== 'archivado').map((p) => [p.id, p.myRole]));
  const q = [];
  tasks.forEach((t) => {
    const role = roleOf[t.project_id];
    if (!role || role === 'docente') return;
    if (t.assignee === uid && !t.accepted && t.status !== 'lista') q.push({ kind: 'accept', t });
    else if (t.status === 'en_revision' && t.assignee !== uid && (role === 'revisor' || role === 'coordinador')) q.push({ kind: 'review', t });
    else if (t.assignee === uid && t.status === 'bloqueada') q.push({ kind: 'blocked', t });
    else if (t.status === 'bloqueada' && role === 'coordinador') q.push({ kind: 'unblock', t });
    else if (t.assignee === uid && t.due_date && t.due_date < today && !['lista', 'en_revision'].includes(t.status)) q.push({ kind: 'overdue', t });
  });
  const time = (x) => x.t.due_date || '9999-12-31';
  return q.sort((a, b) => time(a).localeCompare(time(b)));
}
