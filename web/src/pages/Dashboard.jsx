import { useEffect, useMemo, useRef, useState } from 'react';
import { List, Columns3, Search, X, Check, ArrowUpRight, FolderOpen, Plus, Link2, CheckCheck } from 'lucide-react';
import { useApp } from '../lib/store';
import { useLocal } from '../lib/hooks';
import { go } from '../lib/router';
import { myQueue, displayStatus, fmtDay, relDays, todayISO, fmtToday } from '../lib/format';
import { projectStages } from '../lib/center';
import { Btn, Dot, Mono, AvatarStack, UnderlineTabs, Empty, Spinner, StageRail } from '../components/ui';
import { ListView, BoardView, openTask } from '../components/TaskViews';

const KIND = {
  accept: { label: 'Por aceptar', st: 'accept', verb: 'Aceptar', cta: 'Aceptar tarea' },
  review: { label: 'Por revisar', st: 'review', verb: 'Revisar', cta: 'Revisar entrega' },
  blocked: { label: 'Bloqueada', st: 'blocked', verb: 'Destrabar', cta: 'Ver bloqueo' },
  unblock: { label: 'Por destrabar', st: 'blocked', verb: 'Ayudar a destrabar', cta: 'Ver bloqueo' },
  overdue: { label: 'Vencida', st: 'overdue', verb: 'Ponerse al día con', cta: 'Actualizar avance' },
};

function Welcome({ onNew }) {
  const [link, setLink] = useState('');
  const join = (e) => {
    e.preventDefault();
    const m = link.trim().match(/unirse\/([A-Za-z0-9]+)/) || link.trim().match(/^([A-Za-z0-9]{6,20})$/);
    if (m) go(`/unirse/${m[1]}`);
  };
  return (
    <div className="anim-enter mx-auto max-w-2xl py-6 text-center sm:py-12">
      <img src="./icon.svg" alt="" className="mx-auto h-12 w-12" />
      <h2 className="mt-6 text-[28px] font-semibold tracking-[-0.03em]" style={{ textWrap: 'balance' }}>Empecemos tu primer trabajo en grupo</h2>
      <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-fg-2">Crea un proyecto y sube la consigna, o entra al grupo que ya armó un compañero.</p>
      <div className="mt-10 grid gap-4 text-left sm:grid-cols-2">
        <div className="flex flex-col rounded-2xl bg-card p-6 ring-1 ring-inset ring-line">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-on-accent"><Plus className="sw-bold h-5 w-5" /></span>
          <h3 className="mt-4 text-[15px] font-semibold">Crear un proyecto</h3>
          <p className="mt-1 flex-1 text-[13.5px] text-fg-2">Subes la consigna, Reparte3 propone las tareas y luego invitas a tu grupo.</p>
          <Btn kind="primary" className="mt-5 w-full" onClick={onNew}>Nuevo proyecto</Btn>
        </div>
        <form onSubmit={join} className="flex flex-col rounded-2xl bg-card p-6 ring-1 ring-inset ring-line">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-hov2"><Link2 className="h-5 w-5" /></span>
          <h3 className="mt-4 text-[15px] font-semibold">Tengo una invitación</h3>
          <label htmlFor="wl-link" className="mt-1 text-[13.5px] text-fg-2">Pega el enlace que te mandaron.</label>
          <input id="wl-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…/#/unirse/…" className="field mt-3" />
          <Btn kind="secondary" type="submit" className="mt-3 w-full" disabled={!link.trim()}>Unirme</Btn>
        </form>
      </div>
    </div>
  );
}

function NextStrip({ queue }) {
  const { taskAction, toast, project } = useApp();
  if (!queue.length) return null;
  const it = queue[0]; const k = KIND[it.kind];
  return (
    <div key={it.t.id} className="anim-enter mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl bg-card px-4 py-3 ring-1 ring-inset ring-line sm:px-5">
      <Dot st={k.st} />
      <p className="min-w-0 flex-1 text-[13.5px]">
        <span className="text-fg-2">Lo tuyo ahora: </span>
        <button type="button" onClick={() => openTask(it.t.id)} className="font-medium underline-offset-4 hover:underline">{k.verb} «{it.t.title}»</button>
        <span className="hidden text-fg-2 md:inline">, {project(it.t.project_id)?.name}</span>
      </p>
      {queue.length > 1 && <Mono className="hidden text-fg-3 sm:inline">+{queue.length - 1} más</Mono>}
      {it.kind === 'accept'
        ? <Btn kind="primary" size="sm" onClick={async () => { if (await taskAction(it.t.id, 'aceptar')) toast('Aceptaste la tarea.'); }}><Check className="sw-bold h-4 w-4" />Aceptar tarea</Btn>
        : <Btn kind="primary" size="sm" onClick={() => openTask(it.t.id)}>{k.cta}<ArrowUpRight className="h-4 w-4" /></Btn>}
    </div>
  );
}

/* ---------------- Hoy: tus pendientes por acción + tus proyectos en sus 4 tiempos ---------------- */
const COORD_STEPS = ['objetivo', 'consigna', 'grupo', 'reparto', 'cierre'];
const GROUPS = [
  { kind: 'accept', title: 'Por aceptar', hint: 'Te las asignaron. Aceptarlas confirma tu compromiso.' },
  { kind: 'review', title: 'Por revisar', hint: 'Entregas de tu grupo que esperan tu visto bueno.' },
  { kind: 'blocked', title: 'Bloqueadas', hint: 'Pediste ayuda: destrábalas con tu grupo.' },
  { kind: 'unblock', title: 'Para destrabar', hint: 'Alguien de tu grupo pidió ayuda y coordinas el proyecto.' },
  { kind: 'overdue', title: 'Vencidas', hint: 'Pasaron su fecha: actualiza el avance o acuerda otra.' },
  { kind: 'doing', title: 'Por hacer', hint: 'Tus tareas aceptadas, la más próxima primero.' },
];

function PendingRow({ it }) {
  const { taskAction, toast, project, nameOf } = useApp();
  const k = KIND[it.kind]; const p = project(it.t.project_id);
  const today = todayISO();
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 sm:flex-nowrap">
      <Dot st={k ? k.st : displayStatus(it.t, today)} label />
      <button type="button" onClick={() => openTask(it.t.id)} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[14px] font-medium hover:underline hover:underline-offset-4">{it.t.title}</span>
        <span className="block truncate text-[12.5px] text-fg-2">{p?.name}{it.kind === 'review' ? `, entrega de ${nameOf(it.t.assignee, p?.id)}` : ''}</span>
      </button>
      <span className="shrink-0 text-[12.5px] text-fg-2">{it.t.due_date ? relDays(it.t.due_date) : 'sin fecha'}</span>
      {it.kind === 'accept'
        ? <Btn kind="primary" size="sm" onClick={async () => { if (await taskAction(it.t.id, 'aceptar')) toast('Aceptaste la tarea.'); }}><Check className="sw-bold h-4 w-4" />Aceptar</Btn>
        : k && <Btn size="sm" kind="secondary" onClick={() => openTask(it.t.id)}>{k.cta}</Btn>}
    </li>
  );
}

function Today({ queue, onNew }) {
  const { tasks, projects, uid, membersOf, checkpoints } = useApp();
  const active = projects.filter((p) => p.status === 'activo');
  const inQueue = new Set(queue.map((it) => it.t.id));
  const doing = tasks
    .filter((t) => t.assignee === uid && t.accepted && !['lista', 'en_revision'].includes(t.status) && !inQueue.has(t.id) && active.some((p) => p.id === t.project_id))
    .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999')).slice(0, 6)
    .map((t) => ({ kind: 'doing', t }));
  const all = [...queue, ...doing];
  const groups = GROUPS.map((g) => ({ ...g, items: all.filter((it) => it.kind === g.kind) })).filter((g) => g.items.length);
  return (
    <div className="anim-enter grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start">
      <section aria-labelledby="pend-t" className="rounded-2xl bg-card p-5 ring-1 ring-inset ring-line sm:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="pend-t" className="text-[16px] font-semibold tracking-[-0.01em]">Tus pendientes</h2>
          {all.length > 0 && <Mono className="text-fg-2">{all.length}</Mono>}
        </div>
        {!groups.length ? (
          <p className="mt-4 flex items-center gap-3 text-[14px] text-fg-2"><span className="grid h-9 w-9 place-items-center rounded-full bg-hov2"><CheckCheck className="h-4 w-4 text-fg" /></span>Estás al día: nada por aceptar, revisar ni destrabar.</p>
        ) : groups.map((g) => (
          <div key={g.kind} className="mt-5">
            <h3 className="flex items-baseline gap-2 text-[13px] font-semibold">{g.title} <Mono className="text-fg-3">{g.items.length}</Mono></h3>
            <p className="text-[12px] text-fg-2">{g.hint}</p>
            <ul className="mt-1 divide-y divide-line">{g.items.map((it) => <PendingRow key={`${g.kind}${it.t.id}`} it={it} />)}</ul>
          </div>
        ))}
      </section>

      <section aria-labelledby="proj-t" className="rounded-2xl bg-card p-5 ring-1 ring-inset ring-line sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 id="proj-t" className="text-[16px] font-semibold tracking-[-0.01em]">Tus proyectos</h2>
          <Btn size="sm" onClick={onNew}><Plus className="h-4 w-4" />Nuevo</Btn>
        </div>
        <ul className="mt-3 flex flex-col">
          {active.map((p) => {
            const ts = tasks.filter((t) => t.project_id === p.id);
            const st = projectStages({ project: p, tasks: ts, members: membersOf(p.id), checkpoints: checkpoints.filter((c) => c.project_id === p.id) });
            const nx = st.current?.nextStep;
            return (
              <li key={p.id} className="border-t border-line first:border-t-0">
                <button type="button" onClick={() => go(`/p/${p.id}`)} className="-mx-3 block w-[calc(100%+24px)] rounded-xl p-3 text-left transition-colors hover:bg-hov">
                  <span className="flex items-center justify-between gap-3">
                    <span className="truncate text-[14px] font-medium">{p.name}</span>
                    <AvatarStack ring="card" people={membersOf(p.id).map((m) => ({ id: m.user_id, name: m.profile?.display_name || '?', me: m.user_id === uid }))} />
                  </span>
                  <span className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
                    <StageRail compact stages={st.stages} />
                    <span className="text-[12px] text-fg-2">{p.due_date ? `Entrega ${fmtDay(p.due_date)}, ${relDays(p.due_date)}` : 'Sin fecha de entrega'}</span>
                  </span>
                  {nx && <span className="mt-1.5 block truncate text-[12.5px] text-fg-2">{p.myRole !== 'coordinador' && COORD_STEPS.includes(nx.key) ? 'Le toca a la coordinación: ' : 'Siguiente paso: '}<span className="text-fg">{nx.label}</span></span>}
                </button>
              </li>
            );
          })}
          {!active.length && <li className="text-[13.5px] text-fg-2">No tienes proyectos activos.</li>}
        </ul>
      </section>
    </div>
  );
}

/** Filtro de proyectos (uno o varios), con búsqueda. La selección vive en la URL (?proyectos=a,b). */
function ProjectFilter({ projects, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [open]);
  const label = !selected.length ? 'Todos mis proyectos' : selected.length === 1 ? projects.find((p) => p.id === selected[0])?.name : `${selected.length} proyectos`;
  const shown = projects.filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div ref={ref} className="relative min-w-0 flex-1 sm:w-60 sm:flex-none">
      <button type="button" id="dash-proj" onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open}
              className={`field flex h-9 items-center gap-2 text-left text-[13px] ${selected.length ? 'pr-9 ring-accent/50' : ''}`}>
        <FolderOpen className="h-4 w-4 shrink-0 text-fg-3" /><span className="min-w-0 flex-1 truncate">{label}</span>
      </button>
      {selected.length > 0 && <button type="button" aria-label="Quitar filtro de proyectos" onClick={() => onChange([])} className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded text-fg-3 hover:text-fg"><X className="h-3.5 w-3.5" /></button>}
      {open && (
        <div className="anim-enter absolute right-0 z-30 mt-1.5 w-[min(320px,calc(100vw-32px))] rounded-xl bg-card p-2 shadow-pop ring-1 ring-inset ring-line">
          {projects.length > 5 && <input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar proyecto" aria-label="Buscar proyecto" className="field mb-2 h-8 text-[13px]" />}
          <ul role="listbox" aria-multiselectable="true" aria-label="Proyectos" className="max-h-72 overflow-y-auto">
            <li><button type="button" role="option" aria-selected={!selected.length} onClick={() => { onChange([]); setOpen(false); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-hov">
              <span className={`grid h-4 w-4 place-items-center rounded ring-1 ring-inset ${!selected.length ? 'bg-accent text-on-accent ring-accent' : 'ring-fg-3'}`}>{!selected.length && <Check className="sw-bold h-3 w-3" />}</span>Todos mis proyectos</button></li>
            {shown.map((p) => {
              const on = selected.includes(p.id);
              return (
                <li key={p.id}><button type="button" role="option" aria-selected={on} onClick={() => toggle(p.id)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-hov">
                  <span className={`grid h-4 w-4 shrink-0 place-items-center rounded ring-1 ring-inset ${on ? 'bg-accent text-on-accent ring-accent' : 'ring-fg-3'}`}>{on && <Check className="sw-bold h-3 w-3" />}</span><span className="truncate">{p.name}</span></button></li>
              );
            })}
            {!shown.length && <li className="px-2.5 py-2 text-[13px] text-fg-2">Ningún proyecto con ese nombre.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function Dashboard({ scope, onNew, route }) {
  const { tasks, projects, uid, loaded, profile } = useApp();
  const [tab, setTab] = useLocal('r3-tab', 'lista');
  const [query, setQuery] = useState('');
  const queue = useMemo(() => myQueue(tasks, projects, uid), [tasks, projects, uid]);
  if (!loaded) return <Spinner />;
  if (!projects.length) return <Welcome onNew={onNew} />;

  const active = projects.filter((p) => p.status === 'activo');
  const activeIds = new Set(active.map((p) => p.id));
  // Solo proyectos a los que la persona tiene acceso (los de su lista); los ids desconocidos de la URL se ignoran.
  const sel = String(route?.query?.proyectos || '').split(',').filter((x) => activeIds.has(x));
  const setSel = (ids) => { const q = new URLSearchParams(route?.query || {}); if (ids.length) q.set('proyectos', ids.join(',')); else q.delete('proyectos'); const qs = q.toString(); go(`/${scope === 'mine' ? 'mis-tareas' : ''}${qs ? `?${qs}` : ''}`); };
  const pf = sel.length ? new Set(sel) : null;
  const q = query.trim().toLowerCase();
  const scoped = tasks
    .filter((t) => activeIds.has(t.project_id))
    .filter((t) => scope !== 'mine' || t.assignee === uid || (t.status === 'en_revision' && ['revisor', 'coordinador'].includes(projects.find((p) => p.id === t.project_id)?.myRole) && t.assignee !== uid))
    .filter((t) => !pf || pf.has(t.project_id))
    .filter((t) => !q || t.title.toLowerCase().includes(q))
    .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-fg-2">{fmtToday()}</p>
          <h2 className="mt-1 text-[26px] font-semibold tracking-[-0.03em] sm:text-[30px]">{scope === 'mine' ? 'Mis tareas' : `Hola, ${profile.display_name.split(' ')[0]}`}</h2>
        </div>
        {scope === 'mine' && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {active.length > 1 && <ProjectFilter projects={active} selected={sel} onChange={setSel} />}
          <label className="relative flex min-w-0 flex-1 items-center sm:w-56 sm:flex-none">
            <span className="sr-only">Buscar tareas</span>
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-fg-3" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar tarea" className="field h-9 pl-9 text-[13px]" />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Limpiar" className="absolute right-2 grid h-6 w-6 place-items-center rounded text-fg-3 hover:text-fg"><X className="h-3.5 w-3.5" /></button>}
          </label>
        </div>}
      </div>

      {scope !== 'mine' ? <Today queue={queue} onNew={onNew} /> : <>
        <div className="mb-6 border-b border-line">
          <UnderlineTabs label="Vistas" value={tab === 'tablero' ? 'tablero' : 'lista'} onChange={setTab} tabs={[
            { id: 'lista', label: 'Lista', icon: List },
            { id: 'tablero', label: 'Tablero', icon: Columns3 },
          ]} />
        </div>
        <NextStrip queue={pf ? queue.filter((it) => pf.has(it.t.project_id)) : queue} />
        {tab !== 'tablero' ? <ListView tasks={scoped} showProject={!pf || pf.size > 1} empty={<Empty icon={CheckCheck} title={q ? `Ninguna tarea coincide con «${query.trim()}»` : pf ? 'No hay tareas en los proyectos elegidos' : 'No tienes tareas asignadas'} text={pf || q ? 'Prueba con otros proyectos o limpia los filtros.' : 'Cuando te asignen una tarea o tomes una, aparecerá aquí.'}>{(pf || q) && <Btn onClick={() => { setQuery(''); setSel([]); }}><X className="h-4 w-4" />Limpiar filtros</Btn>}</Empty>} />
          : <BoardView tasks={scoped} showProject={!pf || pf.size > 1} />}
      </>}
    </div>
  );
}
