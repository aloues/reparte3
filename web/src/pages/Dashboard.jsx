import { useEffect, useMemo, useRef, useState } from 'react';
import { List, Columns3, LayoutDashboard, Search, X, Check, ArrowUpRight, Crosshair, ChevronLeft, ChevronRight, FolderOpen, Calendar, Plus, Link2, CheckCheck } from 'lucide-react';
import { useApp } from '../lib/store';
import { useLocal } from '../lib/hooks';
import { go } from '../lib/router';
import { myQueue, displayStatus, fmtShort, fmtDay, fmtWd, relDays, daysFrom, todayISO, fmtToday } from '../lib/format';
import { Btn, Badge, Dot, Mono, Avatar, AvatarStack, UnderlineTabs, Empty, Spinner, SelectField } from '../components/ui';
import { ListView, BoardView, openTask } from '../components/TaskViews';

const KIND = {
  accept: { label: 'Por aceptar', st: 'accept', verb: 'Aceptar', cta: 'Aceptar tarea' },
  review: { label: 'Por revisar', st: 'review', verb: 'Revisar', cta: 'Revisar entrega' },
  blocked: { label: 'Bloqueada', st: 'blocked', verb: 'Destrabar', cta: 'Ver bloqueo' },
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
        <span className="text-fg-2">Tu siguiente paso: </span>
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

function FocusCard({ queue }) {
  const { taskAction, toast, project, nameOf } = useApp();
  const [idx, setIdx] = useState(0);
  if (!queue.length) {
    return (
      <section className="flex items-center gap-4 rounded-xl bg-card p-6 ring-1 ring-inset ring-line">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-hov2"><CheckCheck className="h-5 w-5" /></span>
        <div><h2 className="text-[15px] font-semibold">Estás al día</h2><p className="text-[13.5px] text-fg-2">No tienes nada por aceptar, revisar ni destrabar.</p></div>
      </section>
    );
  }
  const i = Math.min(idx, queue.length - 1); const it = queue[i]; const k = KIND[it.kind]; const p = project(it.t.project_id);
  return (
    <section aria-labelledby="focus-t" className="relative overflow-hidden rounded-xl bg-card ring-1 ring-inset ring-line">
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full" style={{ background: 'radial-gradient(closest-side, rgb(var(--accent) / .10), transparent)' }} />
      <div className="relative p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-[13px] text-fg-2"><Crosshair className="h-4 w-4 text-fg-3" />Tarea en foco</p>
          <div className="flex items-center gap-1 text-fg-2">
            <Mono className="mr-1.5">{i + 1} / {queue.length}</Mono>
            <button type="button" aria-label="Anterior" disabled={i === 0} onClick={() => setIdx(i - 1)} className="grid h-7 w-7 place-items-center rounded-md ring-1 ring-inset ring-line hover:bg-hov hover:text-fg disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" aria-label="Siguiente" disabled={i >= queue.length - 1} onClick={() => setIdx(i + 1)} className="grid h-7 w-7 place-items-center rounded-md ring-1 ring-inset ring-line hover:bg-hov hover:text-fg disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
        <div key={it.t.id} className="anim-enter mt-6">
          <Badge st={k.st} dot>{k.label}</Badge>
          <h2 id="focus-t" className="mt-3 max-w-[30ch] text-[22px] font-semibold leading-tight tracking-[-0.02em] sm:text-[26px]" style={{ textWrap: 'balance' }}>{it.t.title}</h2>
          <p className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13.5px] text-fg-2">
            <span className="inline-flex items-center gap-1.5"><FolderOpen className="h-4 w-4 text-fg-3" />{p?.name}</span>
            <span className="inline-flex items-center gap-1.5"><Calendar className="h-4 w-4 text-fg-3" />{it.t.due_date ? `${fmtShort(it.t.due_date)}, ${relDays(it.t.due_date)}` : 'Sin fecha'}</span>
            {it.kind === 'review' && <span className="inline-flex items-center gap-1.5"><Avatar name={nameOf(it.t.assignee, p?.id)} size="sm" ring="card" />Entrega de {nameOf(it.t.assignee, p?.id)}</span>}
          </p>
        </div>
        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          <button type="button" onClick={() => openTask(it.t.id)} className="inline-flex items-center gap-1.5 text-[13.5px] text-fg-2 hover:text-fg">Ver detalles <ArrowUpRight className="h-4 w-4" /></button>
          {it.kind === 'accept'
            ? <div className="flex gap-2"><Btn kind="secondary" size="lg" onClick={() => openTask(it.t.id)}>No puedo tomarla</Btn><Btn kind="primary" size="lg" onClick={async () => { if (await taskAction(it.t.id, 'aceptar')) toast('Aceptaste la tarea.'); }}><Check className="sw-bold h-4 w-4" />Aceptar tarea</Btn></div>
            : <Btn kind="primary" size="lg" onClick={() => openTask(it.t.id)}>{k.cta}<ArrowUpRight className="h-4 w-4" /></Btn>}
        </div>
      </div>
    </section>
  );
}

function Summary({ tasks, projects, queue }) {
  const { membersOf, uid } = useApp();
  const today = todayISO();
  const open = tasks.filter((t) => t.status !== 'lista');
  const tiles = [
    ['Tus acciones', queue.length, 'por aceptar, revisar o destrabar', 'accept'],
    ['En revisión', open.filter((t) => t.status === 'en_revision').length, 'entregas esperando', 'review'],
    ['Vencidas', open.filter((t) => displayStatus(t, today) === 'overdue').length, 'pasaron su fecha', 'overdue'],
    ['Bloqueos', open.filter((t) => t.status === 'bloqueada').length, 'necesitan ayuda', 'blocked'],
  ];
  const upcoming = open.filter((t) => t.due_date && daysFrom(t.due_date) >= 0 && daysFrom(t.due_date) <= 14).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 6);
  return (
    <div className="anim-enter grid gap-6">
      <FocusCard queue={queue} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([label, n, sub, st]) => (
          <div key={label} className="rounded-xl bg-card p-5 ring-1 ring-inset ring-line">
            <p className="flex items-center gap-2 text-[12.5px] text-fg-2"><Dot st={st} />{label}</p>
            <p className="mt-3 font-mono text-[28px] font-medium leading-none tabular-nums">{n}</p>
            <p className="mt-2 text-[12px] text-fg-2">{sub}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="rounded-xl bg-card p-6 ring-1 ring-inset ring-line" aria-labelledby="sp-t">
          <h2 id="sp-t" className="text-[14px] font-semibold">Avance por proyecto</h2>
          <ul className="mt-4 flex flex-col">
            {projects.map((p) => {
              const ts = tasks.filter((t) => t.project_id === p.id);
              const done = ts.filter((t) => t.status === 'lista').length;
              const pct = ts.length ? Math.round((done / ts.length) * 100) : 0;
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => go(`/p/${p.id}`)} className="-mx-3 block w-[calc(100%+24px)] rounded-lg p-3 text-left transition-colors hover:bg-hov">
                    <span className="flex items-center justify-between gap-3"><span className="truncate text-[13.5px] font-medium">{p.name}</span><Mono className="text-fg-2">{ts.length ? `${done}/${ts.length}` : 'sin tareas'}</Mono></span>
                    <span className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-hov2" role="img" aria-label={`${pct}% listo`}><span className="block h-full rounded-full bg-fg transition-[width] duration-700" style={{ width: `${pct}%` }} /></span>
                    <span className="mt-2 flex items-center justify-between gap-3 text-[12px] text-fg-2">
                      <span>{p.due_date ? `Entrega ${fmtDay(p.due_date)}, ${relDays(p.due_date)}` : 'Sin fecha de entrega'}</span>
                      <AvatarStack ring="card" people={membersOf(p.id).map((m) => ({ id: m.user_id, name: m.profile?.display_name || '?', me: m.user_id === uid }))} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="rounded-xl bg-card p-6 ring-1 ring-inset ring-line" aria-labelledby="up-t">
          <h2 id="up-t" className="text-[14px] font-semibold">Próximas fechas</h2>
          <ul className="mt-4 flex flex-col gap-1">
            {upcoming.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => openTask(t.id)} className="-mx-2 flex w-[calc(100%+16px)] items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-hov">
                  <span className="w-10 shrink-0 rounded-md bg-hov py-1 text-center ring-1 ring-inset ring-line">
                    <span className="block text-[10.5px] text-fg-2">{fmtWd(t.due_date)}</span>
                    <span className="block font-mono text-[14px] leading-5">{Number(t.due_date.slice(8))}</span>
                  </span>
                  <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><Dot st={displayStatus(t)} /><span className="truncate text-[13px] font-medium">{t.title}</span></span></span>
                </button>
              </li>
            ))}
            {!upcoming.length && <li className="text-[13px] text-fg-2">Sin fechas en las próximas dos semanas.</li>}
          </ul>
        </section>
      </div>
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
              className={`field flex h-9 items-center gap-2 text-left text-[13px] ${selected.length ? 'ring-accent/50' : ''}`}>
        <FolderOpen className="h-4 w-4 shrink-0 text-fg-3" /><span className="min-w-0 flex-1 truncate">{label}</span>
        {selected.length > 0 && <span role="button" tabIndex={0} aria-label="Quitar filtro de proyectos" onClick={(e) => { e.stopPropagation(); onChange([]); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onChange([]); } }} className="grid h-5 w-5 place-items-center rounded text-fg-3 hover:text-fg"><X className="h-3.5 w-3.5" /></span>}
      </button>
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
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {active.length > 1 && <ProjectFilter projects={active} selected={sel} onChange={setSel} />}
          <label className="relative flex min-w-0 flex-1 items-center sm:w-56 sm:flex-none">
            <span className="sr-only">Buscar tareas</span>
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-fg-3" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar tarea" className="field h-9 pl-9 text-[13px]" />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Limpiar" className="absolute right-2 grid h-6 w-6 place-items-center rounded text-fg-3 hover:text-fg"><X className="h-3.5 w-3.5" /></button>}
          </label>
        </div>
      </div>

      <div className="mb-6 border-b border-line">
        <UnderlineTabs label="Vistas" value={tab} onChange={setTab} tabs={[
          { id: 'lista', label: 'Lista', icon: List },
          { id: 'tablero', label: 'Tablero', icon: Columns3 },
          { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
        ]} />
      </div>

      {tab !== 'resumen' && <NextStrip queue={pf ? queue.filter((it) => pf.has(it.t.project_id)) : queue} />}
      {tab === 'lista' && <ListView tasks={scoped} showProject={!pf || pf.size > 1} empty={<Empty icon={CheckCheck} title={q ? `Ninguna tarea coincide con «${query.trim()}»` : pf ? 'No hay tareas en los proyectos elegidos' : scope === 'mine' ? 'No tienes tareas asignadas' : 'Todavía no hay tareas'} text={pf || q ? 'Prueba con otros proyectos o limpia los filtros.' : scope === 'mine' ? 'Cuando te asignen una tarea o tomes una, aparecerá aquí.' : 'Abre un proyecto para añadir tareas o repartirlas.'}>{(pf || q) && <Btn onClick={() => { setQuery(''); setSel([]); }}><X className="h-4 w-4" />Limpiar filtros</Btn>}</Empty>} />}
      {tab === 'tablero' && <BoardView tasks={scoped} showProject={!pf || pf.size > 1} />}
      {tab === 'resumen' && <Summary tasks={scoped} projects={pf ? active.filter((p) => pf.has(p.id)) : active} queue={queue} />}
    </div>
  );
}
