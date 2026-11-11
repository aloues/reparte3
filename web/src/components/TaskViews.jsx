import { useState } from 'react';
import { ChevronDown, ChevronRight, CheckCircle2, Calendar, GripVertical } from 'lucide-react';
import { useApp } from '../lib/store';
import { parse, go } from '../lib/router';
import { displayStatus, STATUS, GROUPS, COLUMNS, fmtDay, todayISO } from '../lib/format';
import { Avatar, Badge, Dot, Mono, Empty } from './ui';

export function openTask(id) {
  const { parts, query } = parse();
  const q = new URLSearchParams({ ...query, tarea: id });
  go(`/${parts.map(encodeURIComponent).join('/')}?${q.toString()}`);
}

function TaskRow({ t, showProject, selected }) {
  const { nameOf, uid, project } = useApp();
  const st = displayStatus(t);
  const p = project(t.project_id);
  return (
    <li>
      <button type="button" onClick={() => openTask(t.id)} aria-haspopup="dialog"
              className={`group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150 sm:gap-4 sm:px-5 ${selected ? 'bg-hov2' : 'hover:bg-hov'}`}>
        {st === 'done' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-fg-3" /> : <span className="grid h-4 w-4 shrink-0 place-items-center"><Dot st={st} /></span>}
        <Mono className="hidden w-10 shrink-0 text-fg-3 md:inline">#{t.seq}</Mono>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[14px] font-medium ${st === 'done' ? 'text-fg-2 line-through decoration-fg-3/50' : 'text-fg'}`}>{t.title}</span>
          {showProject && p && <span className="mt-0.5 block truncate text-[12.5px] text-fg-2 lg:hidden">{p.name}</span>}
        </span>
        {showProject && p && <span className="hidden max-w-[200px] truncate text-[12.5px] text-fg-2 lg:inline">{p.name}</span>}
        <span className={`hidden w-[72px] shrink-0 text-right text-[12.5px] sm:inline ${st === 'overdue' ? 'text-orange' : 'text-fg-2'}`}>{fmtDay(t.due_date)}</span>
        <span className="hidden w-[104px] shrink-0 md:flex md:justify-end"><Badge st={st} /></span>
        <Avatar name={nameOf(t.assignee, t.project_id)} me={t.assignee === uid} pending={!t.assignee} title={nameOf(t.assignee, t.project_id)} />
        <ChevronRight className="h-4 w-4 shrink-0 -translate-x-1 text-fg-3 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
      </button>
    </li>
  );
}

function Group({ g, tasks, showProject, selectedId }) {
  const [open, setOpen] = useState(!g.closed);
  return (
    <section aria-labelledby={`g-${g.id}`}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="group flex w-full items-center gap-2.5 border-b border-line px-4 py-2 text-left sm:px-5">
        <ChevronDown className={`h-3.5 w-3.5 text-fg-3 transition-transform duration-300 ${open ? '' : '-rotate-90'}`} />
        <Dot st={g.st} />
        <h3 id={`g-${g.id}`} className="text-[13px] font-medium">{g.label}</h3>
        <Mono className="text-fg-3">{tasks.length}</Mono>
      </button>
      <div className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden" inert={open ? undefined : ''}>
          <ul className="divide-y divide-line border-b border-line">{tasks.map((t) => <TaskRow key={t.id} t={t} showProject={showProject} selected={selectedId === t.id} />)}</ul>
        </div>
      </div>
    </section>
  );
}

export function ListView({ tasks, showProject, selectedId, empty }) {
  const today = todayISO();
  const groups = GROUPS.map((g) => ({ g, tasks: tasks.filter((t) => g.test(displayStatus(t, today))) })).filter((x) => x.tasks.length);
  if (!groups.length) return empty || <Empty title="No hay tareas aquí" text="Cuando el grupo reparta tareas, aparecerán en esta lista." />;
  return (
    <div className="anim-enter overflow-hidden rounded-xl bg-card ring-1 ring-inset ring-line">
      {groups.map(({ g, tasks: ts }) => <Group key={g.id} g={g} tasks={ts} showProject={showProject} selectedId={selectedId} />)}
    </div>
  );
}

/** Tablero: la coordinación puede arrastrar tarjetas entre columnas; el resto abre la tarea para actuar. */
export function BoardView({ tasks, showProject, selectedId }) {
  const { nameOf, uid, project, updateTask, toast } = useApp();
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const canDrag = (t) => project(t.project_id)?.myRole === 'coordinador';
  const move = async (id, status) => {
    const t = tasks.find((x) => x.id === id);
    if (!t || t.status === status) return;
    if (!canDrag(t)) { toast('Solo la coordinación mueve tarjetas. Abre la tarea para actualizar tu avance.', { icon: 'info' }); return; }
    const prev = t.status;
    const r = await updateTask(id, { status }, null);
    if (r) toast(`«${t.title}» pasó a ${COLUMNS.find((c) => c.id === status).label}.`, { action: { label: 'Deshacer', fn: () => updateTask(id, { status: prev }) } });
  };
  return (
    <div className="anim-enter no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
      {COLUMNS.map((col) => {
        const list = tasks.filter((t) => t.status === col.id);
        const dragging = tasks.find((t) => t.id === drag);
        const isOver = over === col.id && dragging && dragging.status !== col.id;
        return (
          <section key={col.id} aria-labelledby={`col-${col.id}`}
                   onDragOver={(e) => { if (!drag) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (over !== col.id) setOver(col.id); }}
                   onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null); }}
                   onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain') || drag; setOver(null); setDrag(null); if (id) move(id, col.id); }}
                   className={`flex w-[272px] shrink-0 snap-start flex-col rounded-xl p-2 transition-all duration-200 xl:w-auto xl:min-w-0 xl:flex-1 ${isOver ? 'bg-accent/[.06] ring-2 ring-inset ring-accent/40' : 'bg-sunk ring-1 ring-inset ring-line'}`}>
            <header className="flex items-center gap-2 px-2 pb-3 pt-1.5">
              <Dot st={col.dot} /><h3 id={`col-${col.id}`} className="text-[13px] font-medium">{col.label}</h3><Mono className="text-fg-3">{list.length}</Mono>
            </header>
            <ul className="flex min-h-[110px] flex-col gap-2">
              {list.map((t) => {
                const st = displayStatus(t);
                const draggable = canDrag(t);
                return (
                  <li key={t.id} draggable={draggable}
                      onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; setDrag(t.id); }}
                      onDragEnd={() => { setDrag(null); setOver(null); }}
                      role="button" tabIndex={0} aria-haspopup="dialog"
                      onClick={() => openTask(t.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTask(t.id); } }}
                      className={`group rounded-lg bg-card p-3.5 ring-1 ring-inset transition-all duration-200 ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${drag === t.id ? 'rotate-[1.5deg] opacity-50' : 'shadow-xs hover:-translate-y-px hover:ring-fg-3/40'} ${selectedId === t.id ? 'ring-accent/60' : 'ring-line'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <Mono className="text-fg-3">#{t.seq}</Mono>
                      {draggable ? <GripVertical className="h-3.5 w-3.5 text-fg-3 opacity-0 transition-opacity group-hover:opacity-100" /> : null}
                    </div>
                    <p className={`mt-1.5 text-[13.5px] font-medium leading-5 ${t.status === 'lista' ? 'text-fg-2 line-through decoration-fg-3/50' : ''}`}>{t.title}</p>
                    {showProject && <p className="mt-1 truncate text-[12px] text-fg-2">{project(t.project_id)?.name}</p>}
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="flex flex-wrap items-center gap-1.5">
                        {['accept', 'overdue', 'unassigned'].includes(st) && <Badge st={st} />}
                        <span className={`inline-flex items-center gap-1 text-[12px] ${st === 'overdue' ? 'text-orange' : 'text-fg-2'}`}><Calendar className="h-3 w-3" />{fmtDay(t.due_date)}</span>
                      </span>
                      <Avatar name={nameOf(t.assignee, t.project_id)} me={t.assignee === uid} pending={!t.assignee} size="sm" ring="card" />
                    </div>
                  </li>
                );
              })}
              {!list.length && <li className={`grid flex-1 place-items-center rounded-lg border border-dashed px-3 py-6 text-center text-[12.5px] ${isOver ? 'border-accent/50 text-fg' : 'border-line text-fg-3'}`}>{drag ? 'Suelta aquí' : 'Sin tareas'}</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export { STATUS };
