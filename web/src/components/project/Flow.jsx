import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2, List, Network, GitBranch, Info } from 'lucide-react';
import { useApp } from '../../lib/store';
import { useLocal, useMedia } from '../../lib/hooks';
import { todayISO, fmtDay, fmtShort, relDays } from '../../lib/format';
import { flowLayout, progressOf } from '../../lib/center';
import { Avatar, Segmented, Empty } from '../ui';
import { openTask } from '../TaskViews';

const W = 232; const H = 86; const GX = 72; const GY = 14; const TOP = 44;
const LEGEND = [
  ['lista', 'Lista y aprobada'], ['en_curso', 'En curso o en revisión'], ['pendiente', 'Pendiente'], ['bloqueada', 'Bloqueada'], ['vencida', 'Vencida'],
];
const MODE = { fases: 'por fases', checkpoints: 'por checkpoints', secuencia: 'en orden (aún sin fases)' };

function Node({ t, st, x, y, who, waitingFor, hot, onHover }) {
  return (
    <button type="button" onClick={() => openTask(t.id)} onMouseEnter={() => onHover(t.id)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(t.id)} onBlur={() => onHover(null)}
            aria-label={`#${t.seq} ${t.title}. ${st.label}.${who ? ` Responsable: ${who}.` : ''}${t.due_date ? ` Fecha: ${fmtShort(t.due_date)}.` : ''}${waitingFor ? ` Espera a la tarea #${waitingFor.seq}.` : ''}`}
            className={`flow-node flow-${st.key} absolute flex flex-col rounded-xl px-3 py-2.5 text-left transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 focus-visible:-translate-y-0.5 ${hot ? 'z-10 shadow-pop' : ''}`}
            style={{ left: x, top: y, width: W, height: H }}>
      <span className="flow-dot" aria-hidden="true" />
      <span className="line-clamp-2 text-[13px] font-medium leading-[18px]">{t.title}</span>
      <span className="mt-auto flex items-center gap-2 text-[11.5px] text-fg-2">
        <span className="flow-pill shrink-0">{st.label}</span>
        {waitingFor && <span className="truncate">espera a #{waitingFor.seq}</span>}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">{t.due_date && <span>{fmtDay(t.due_date)}</span>}{who ? <Avatar name={who} size="sm" ring="card" /> : <Avatar pending size="sm" ring="card" />}</span>
      </span>
    </button>
  );
}

export default function Flow({ p }) {
  const { tasks, checkpoints, nameOf } = useApp();
  const today = todayISO();
  const ts = useMemo(() => tasks.filter((t) => t.project_id === p.id), [tasks, p.id]);
  const cps = useMemo(() => checkpoints.filter((c) => c.project_id === p.id), [checkpoints, p.id]);
  const L = useMemo(() => flowLayout(ts, cps, today), [ts, cps, today]);
  const small = useMedia('(max-width: 639px)');
  const [view, setView] = useLocal('r3-flowview', 'mapa');
  const [scale, setScale] = useState(1);
  const [hot, setHot] = useState(null);
  const box = useRef(null);
  const asList = small || view === 'lista';

  const pos = {};
  L.columns.forEach((c, ci) => c.tasks.forEach((t, ti) => { pos[t.id] = { x: ci * (W + GX), y: TOP + ti * (H + GY), col: ci }; }));
  const width = Math.max(1, L.columns.length) * (W + GX) - GX;
  const height = TOP + Math.max(1, ...L.columns.map((c) => c.tasks.length)) * (H + GY) - GY;
  const byId = Object.fromEntries(ts.map((t) => [t.id, t]));
  const fit = () => { const w = box.current?.clientWidth || width; setScale(Math.max(0.5, Math.min(1, (w - 40) / width))); };   // 40 = relleno del contenedor
  useLayoutEffect(() => { if (!asList) fit(); }, [asList, width]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const on = () => !asList && fit(); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, [asList, width]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ts.length) return <Empty icon={GitBranch} title="El flujo aparece cuando hay tareas" text="Sube la consigna y repartan las tareas: aquí verán las fases, quién tiene qué y qué depende de qué." />;

  const prog = progressOf(ts);
  const blocked = ts.filter((t) => t.status === 'bloqueada').length;
  const nextCp = cps.slice().sort((a, b) => a.due_date.localeCompare(b.due_date)).find((c) => ts.some((t) => t.checkpoint_id === c.id && !['lista', 'en_revision'].includes(t.status)));
  const who = (t) => (t.assignee ? nameOf(t.assignee, p.id) : null);
  const edgePath = (e) => {
    const a = pos[e.from]; const b = pos[e.to];
    if (!a || !b) return null;
    const y1 = a.y + H / 2; const y2 = b.y + H / 2;
    if (b.col > a.col) { const x1 = a.x + W; const x2 = b.x; const dx = (x2 - x1) / 2; return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2 - 6},${y2}`; }
    // Misma columna o hacia atrás: la curva sale y entra por la derecha.
    const x = Math.max(a.x, b.x) + W; return `M${a.x + W},${y1} C${x + 46},${y1} ${x + 46},${y2} ${b.x + W + 6},${y2}`;
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* Lectura rápida del estado, con reglas visibles */}
      <section className="grid grid-cols-1 gap-4 rounded-2xl bg-card p-5 ring-1 ring-inset ring-line sm:grid-cols-4">
        <div><p className="text-[12.5px] text-fg-2">Fase actual</p><p className="mt-1 text-[15px] font-semibold">{L.current ? L.current.label : 'Todo listo'}</p></div>
        <div><p className="text-[12.5px] text-fg-2">Próxima entrega</p><p className="mt-1 text-[15px] font-semibold">{nextCp ? nextCp.title : p.due_date ? 'Entrega final' : 'Sin fecha'}</p><p className="text-[12px] text-fg-2">{nextCp ? `${fmtShort(nextCp.due_date)}, ${relDays(nextCp.due_date)}` : p.due_date ? `${fmtShort(p.due_date)}, ${relDays(p.due_date)}` : ''}</p></div>
        <div><p className="text-[12.5px] text-fg-2">Detenidas</p><p className="mt-1 text-[15px] font-semibold">{blocked === 1 ? '1 bloqueada' : `${blocked} bloqueadas`}, {L.waiting.length === 1 ? '1 espera a otra' : `${L.waiting.length} esperan a otra`}</p></div>
        <div><p className="text-[12.5px] text-fg-2">Avance</p><p className="mt-1 text-[15px] font-semibold">{prog.done} de {prog.total} aprobadas</p></div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-fg-2" aria-label="Leyenda">
          {LEGEND.map(([k, lb]) => <li key={k} className="flex items-center gap-2"><span className={`flow-swatch flow-${k}`} aria-hidden="true" />{lb}</li>)}
        </ul>
        <div className="flex items-center gap-2">
          {!small && <Segmented label="Vista del flujo" value={view} onChange={setView} options={[{ id: 'mapa', label: 'Mapa', icon: Network }, { id: 'lista', label: 'Lista', icon: List }]} />}
          {!asList && <div className="flex items-center rounded-lg ring-1 ring-inset ring-line">
            <button type="button" aria-label="Alejar" onClick={() => setScale((s) => Math.max(0.5, +(s - 0.1).toFixed(2)))} className="grid grid-cols-1 h-8 w-8 place-items-center text-fg-2 hover:text-fg"><ZoomOut className="h-4 w-4" /></button>
            <button type="button" onClick={fit} className="flex h-8 items-center gap-1.5 border-x border-line px-2 text-[12.5px] text-fg-2 hover:text-fg"><Maximize2 className="h-3.5 w-3.5" />Ajustar</button>
            <button type="button" aria-label="Acercar" onClick={() => setScale((s) => Math.min(1.4, +(s + 0.1).toFixed(2)))} className="grid grid-cols-1 h-8 w-8 place-items-center text-fg-2 hover:text-fg"><ZoomIn className="h-4 w-4" /></button>
          </div>}
        </div>
      </div>

      {asList ? (
        <div className="grid grid-cols-1 gap-4">
          {L.columns.map((c) => (
            <section key={c.key} aria-label={c.label}>
              <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold">{c.label}{c.due && <span className="font-normal text-fg-2">{fmtShort(c.due)}</span>}{L.current?.key === c.key && <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[11.5px] font-medium text-accent">fase actual</span>}</h3>
              <ul className="grid grid-cols-1 gap-2">
                {c.tasks.map((t) => {
                  const st = L.states[t.id]; const wait = L.waiting.includes(t.id) ? byId[t.depends_on] : null;
                  return (
                    <li key={t.id}><button type="button" onClick={() => openTask(t.id)} className={`flow-node flow-${st.key} relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left`}>
                      <span className="flow-dot" aria-hidden="true" />
                      <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium">{t.title}</span><span className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-fg-2"><span className="flow-pill">{st.label}</span>{wait ? `espera a #${wait.seq}` : ''}{t.due_date ? ` ${fmtDay(t.due_date)}` : ''}</span></span>
                      {who(t) ? <Avatar name={who(t)} size="sm" ring="card" /> : <Avatar pending size="sm" ring="card" />}
                    </button></li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div ref={box} className="r3-dots overflow-auto rounded-2xl p-4 ring-1 ring-inset ring-line" style={{ maxHeight: '70vh' }}>
          <div className="relative origin-top-left" style={{ width: width * scale, height: height * scale }}>
            <div className="absolute left-0 top-0 origin-top-left" style={{ width, height, transform: `scale(${scale})` }}>
              {L.columns.map((c, ci) => (
                <div key={c.key} className="absolute flex items-center gap-2 text-[12.5px] font-semibold" style={{ left: ci * (W + GX), top: 0, width: W }}>
                  <span className="truncate">{c.label}</span>{c.due && <span className="shrink-0 font-normal text-fg-2">{fmtDay(c.due)}</span>}
                  {L.current?.key === c.key && <span className="shrink-0 rounded bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent">actual</span>}
                </div>
              ))}
              <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={width} height={height} aria-hidden="true">
                <defs><marker id="flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="rgb(var(--fg-3))" /></marker>
                  <marker id="flow-arrow-hot" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="rgb(var(--accent))" /></marker></defs>
                {L.edges.map((e) => {
                  const d = edgePath(e); if (!d) return null;
                  const on = hot && (hot === e.from || hot === e.to);
                  return <path key={`${e.from}-${e.to}`} d={d} fill="none" stroke={on ? 'rgb(var(--accent))' : 'rgb(var(--fg-3) / .7)'} strokeWidth={on ? 2 : 1.4} markerEnd={`url(#${on ? 'flow-arrow-hot' : 'flow-arrow'})`} />;
                })}
              </svg>
              {ts.map((t) => pos[t.id] && <Node key={t.id} t={t} st={L.states[t.id]} x={pos[t.id].x} y={pos[t.id].y} who={who(t)} waitingFor={L.waiting.includes(t.id) ? byId[t.depends_on] : null} hot={hot === t.id} onHover={setHot} />)}
            </div>
          </div>
        </div>
      )}
      <p className="flex items-start gap-2 text-[12.5px] leading-5 text-fg-2"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Ordenado {MODE[L.mode]}. {L.edges.length ? `Las ${L.edges.length} flechas salen de lo que el grupo marcó en «Depende de» dentro de cada tarea.` : 'Todavía no hay dependencias: márquenlas en el campo «Depende de» de cada tarea para ver las flechas.'} El avance solo cuenta tareas aprobadas.</p>
    </div>
  );
}
