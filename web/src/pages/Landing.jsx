import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sun, Moon, Check, FileText, ListChecks, MessageCircle, Paperclip, LayoutDashboard, GraduationCap, School, Briefcase,
  ShieldCheck, Sparkles, Hand, Flag, ArrowRight, Menu, X, Link2, Users, Archive, Settings, Activity, List, Columns3,
  Map as MapIcon, Table, Presentation,
} from 'lucide-react';
import { analyzeBrief } from '../lib/detect';
import { fromFormat, distribute } from '../lib/plan';
import { go } from '../lib/router';
import { Avatar } from '../components/ui';
import '../landing.css';

/* Consigna de ejemplo (ficticia, rotulada en pantalla). La demostración usa el mismo algoritmo de la app. */
const SAMPLE = [
  'Proyecto final: Plan de reciclaje para el campus',
  'El grupo debe entregar un informe y una exposición.',
  '1. Investigar cuánta basura genera el campus',
  '2. Encuestar a 30 estudiantes sobre sus hábitos',
  '3. Diseñar la propuesta de puntos de acopio',
  '4. Redactar el informe (máximo 12 páginas)',
  '5. Preparar las diapositivas de la exposición',
  '6. Exponer en clase el 28/11/2026',
].join('\n');
const PEOPLE = [
  { id: 'ana', name: 'Ana Torres' }, { id: 'beto', name: 'Beto Ramos' }, { id: 'caro', name: 'Caro Díaz' },
];
const LATE = 'Dani Quispe'; // la cuarta persona: entra después y toma la parte reservada
const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const first = (n) => n.split(' ')[0];

function useDemoData() {
  return useMemo(() => {
    const found = analyzeBrief(SAMPLE, 2026);
    const tasks = fromFormat(found);
    const hours = { F1: 1, F2: 3, F3: 3, F4: 2, F5: 4, F6: 2, F7: 1 };
    tasks.forEach((t) => { t.hours = hours[t.id] ?? t.hours; });
    // Cuatro integrantes esperados, tres ya dentro: la parte del cuarto queda reservada.
    const dist = distribute(tasks, PEOPLE.map((p) => p.id), { expected: 4 });
    const total = tasks.reduce((a, t) => a + (Number(t.hours) || 0), 0);
    return { tasks, dist, total };
  }, []);
}

function useInView(ref, threshold = 0.35) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setSeen(true); return undefined; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, threshold]);
  return seen;
}

const TIEMPOS = [
  { n: 1, name: 'Armar', what: 'Crear el proyecto: objetivo, consigna y grupo reunido.',
    group: 'Escribe el objetivo, sube la consigna y comparte el enlace para que entren todos.',
    app: 'Lee la consigna línea por línea y propone tareas que citan la línea de donde salen.',
    closes: 'objetivo · consigna · grupo' },
  { n: 2, name: 'Repartir', what: 'Cada tarea con responsable, fecha y aceptada por quien la hace.',
    group: 'Cada quien revisa su parte y la acepta, o dice «no puedo» con un motivo.',
    app: 'Reparte por horas para que todos carguen lo mismo y guarda la parte de quien aún no entra.',
    closes: 'dar un responsable a cada tarea · acordar fechas · que cada quien acepte su tarea' },
  { n: 3, name: 'Avanzar', what: 'Hacer, entregar, revisar y destrabar los pendientes.',
    group: 'Marca su avance, entrega con enlace y revisa el trabajo de otra persona.',
    app: 'Pone checkpoints hacia atrás desde la entrega y avisa qué está en riesgo, con la razón.',
    closes: 'aprobar todas las entregas' },
  { n: 4, name: 'Cerrar', what: 'Escribir qué aprendieron y archivar el proyecto.',
    group: 'Escribe en pocas líneas qué funcionó, qué se trabó y cómo lo resolvieron.',
    app: 'Guarda el registro de aportes y deja el proyecto archivado para consultarlo después.',
    closes: 'cierre escrito o proyecto archivado' },
];
const stateOf = (i, cur) => (i < cur ? 'done' : i === cur ? 'current' : 'pending');
const STATE_WORD = { done: 'hecho', current: 'actual', pending: 'pendiente' };

/** La regla en pequeño. Con `onPick` es una lista de pestañas (demo); sin él, solo muestra el tiempo actual. */
function CompactRule({ cur, onPick, timing, dur, label, controls }) {
  const Seg = onPick ? 'button' : 'div';
  return (
    <div className="lp-cr" role={onPick ? 'tablist' : 'img'} aria-label={onPick ? label : `${label}: tiempo ${cur + 1} de 4, ${TIEMPOS[cur].name}`}>
      {TIEMPOS.map((t, i) => {
        const st = stateOf(i, cur);
        const props = onPick ? { type: 'button', role: 'tab', 'aria-selected': i === cur, 'aria-controls': controls, onClick: () => onPick(i) } : { 'aria-hidden': true };
        return (
          <Seg key={t.n} className="lp-cr-seg" data-state={st} {...props}>
            <span className="lp-cr-label">
              {st === 'done' ? <Check className="sw-bold h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <span className="lp-cr-n">{t.n}</span>}
              <span className="truncate">{t.name}</span>
              {onPick && <span className="sr-only">({STATE_WORD[st]})</span>}
            </span>
            <span className="lp-cr-track"><span key={timing && i === cur ? `t${cur}` : 'f'} className={`lp-cr-fill ${timing && i === cur ? 'is-timing' : ''}`} style={timing && i === cur ? { '--dur': `${dur}ms` } : undefined} /></span>
          </Seg>
        );
      })}
    </div>
  );
}

const DEMO_MS = [3200, 3000, 3000];

/** La demostración del hero recorre los 4 tiempos con datos de ejemplo y el algoritmo real de la app. */
function LiveDemo() {
  const { tasks, dist, total } = useDemoData();
  const [step, setStep] = useState(0);
  const [auto, setAuto] = useState(() => !reduced());
  const [marked, setMarked] = useState(() => reduced());
  useEffect(() => {
    if (!auto) return undefined;
    if (step >= TIEMPOS.length - 1) { setAuto(false); return undefined; }
    const t = setTimeout(() => setStep((s) => s + 1), DEMO_MS[step]);
    return () => clearTimeout(t);
  }, [auto, step]);
  useEffect(() => {
    if (marked) return undefined;
    const t = setTimeout(() => setMarked(true), 450);
    return () => clearTimeout(t);
  }, [marked]);
  const pick = (i) => { setAuto(false); setStep(i); setMarked(true); };
  const lineTask = Object.fromEntries(tasks.map((t) => [t.line, t]));
  const owner = (id) => (id ? PEOPLE.find((p) => p.id === id)?.name : LATE);
  const max = Math.max(...Object.values(dist.loads));
  const status = ['lista', 'lista', 'en_curso', 'en_curso', 'pendiente', 'bloqueada', 'pendiente'];
  const FLOW_LABEL = { lista: 'Aprobada', en_curso: 'En curso', pendiente: 'Pendiente', bloqueada: 'Bloqueada' };

  return (
    <div className="relative min-w-0 rounded-[20px] bg-card ring-1 ring-inset ring-line">
      <div className="border-b border-line px-4 pb-1 pt-2 sm:px-5">
        <CompactRule cur={step} onPick={pick} timing={auto} dur={DEMO_MS[step]} label="Los 4 tiempos de la demostración" controls="demo-panel" />
      </div>

      <div id="demo-panel" className="relative min-h-[372px] p-4 sm:p-5" role="tabpanel" aria-label={`Tiempo ${step + 1} de 4: ${TIEMPOS[step].name}`}>
        {step === 0 && (
          <div key="armar" className="lp-enter">
            <ol className="lp-paper font-mono text-[12.5px] leading-[28px]" aria-label="Consigna de ejemplo, línea por línea">
              {SAMPLE.split('\n').map((l, i) => {
                const t = lineTask[i + 1];
                const on = marked && t;
                return (
                  <li key={i} className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-3">
                    <span className="select-none text-right text-fg-2">{i + 1}</span>
                    <span className={`lp-mark truncate rounded px-1.5 font-sans text-[13px] ${on ? 'bg-accent/10 text-fg' : 'text-fg-2'}`} style={{ transitionDelay: `${i * 90}ms` }}>{l}</span>
                    <span className={`lp-tag w-9 text-right text-[12px] text-fg-2 ${on ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: `${300 + i * 90}ms` }}>{t ? `${t.hours} h` : ''}</span>
                  </li>
                );
              })}
            </ol>
            <p className="mt-4 text-[13px] leading-5 text-fg-2">Reparte3 marca las <span className="font-medium tabular-nums text-fg">{tasks.length}</span> líneas que piden algo y las vuelve tareas, con su estimado de horas: <span className="font-medium tabular-nums text-fg">{total} h</span> en total.</p>
          </div>
        )}
        {step === 1 && (
          <div key="repartir" className="lp-enter">
            <p className="text-[13px] leading-5 text-fg-2">Cuatro integrantes, tres ya dentro. Cada parte apunta a <strong className="font-semibold tabular-nums text-fg">{dist.target.toFixed(1)} h</strong> y quien aún no entra tiene su parte guardada.</p>
            <ul className="mt-6 flex flex-col gap-4">
              {dist.slots.map((s, i) => {
                const pending = s.reserve;
                return (
                  <li key={s.id} className="grid grid-cols-[minmax(0,112px)_minmax(0,1fr)_40px] items-center gap-3 text-[13px]">
                    <span className="flex min-w-0 items-center gap-2">{pending ? <Avatar pending size="sm" ring="card" /> : <Avatar name={owner(s.id)} size="sm" ring="card" />}<span className={`truncate ${pending ? 'text-fg-2' : ''}`}>{pending ? 'Reservado' : first(owner(s.id))}</span></span>
                    <span className="relative h-2.5 overflow-hidden rounded-full bg-hov2">
                      <span className={`lp-bar absolute inset-y-0 left-0 rounded-full ${pending ? 'border border-dashed border-fg-3 bg-transparent' : 'bg-fg'}`} style={{ width: `${(dist.loads[s.id] / max) * 100}%`, animationDelay: `${i * 110}ms` }} />
                    </span>
                    <span className="text-right font-mono text-[12px] text-fg-2">{dist.loads[s.id]} h</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-7 flex items-start gap-2 rounded-lg bg-hov px-3 py-2.5 text-[12.5px] leading-5 text-fg-2"><Hand className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />Cada persona acepta su parte o dice «no puedo» con un motivo. Nada queda asignado a la fuerza.</p>
          </div>
        )}
        {step === 2 && (
          <div key="avanzar" className="lp-enter">
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {['Investigación', 'Desarrollo', 'Cierre'].map((col, ci) => (
                <div key={col} className="min-w-0">
                  <p className="mb-2 truncate text-[12px] font-medium text-fg-2">{col}</p>
                  <div className="flex flex-col gap-2">
                    {tasks.filter((t, ti) => (ci === 0 ? ti < 2 : ci === 1 ? ti >= 2 && ti < 5 : ti >= 5)).map((t) => {
                      const st = status[tasks.indexOf(t)];
                      return (
                        <div key={t.id} className={`flow-node flow-${st} relative rounded-lg px-2.5 py-2 text-[12px] leading-4`}>
                          <span className="line-clamp-2">{t.title}</span>
                          <span className="flow-pill mt-1.5">{FLOW_LABEL[st]}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[12.5px] leading-5 text-fg-2">El mapa se arma con las tareas y estados reales del proyecto. El color nunca va solo: cada bloque dice su estado.</p>
          </div>
        )}
        {step === 3 && (
          <div key="cerrar" className="lp-enter">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[15px] font-semibold tracking-[-0.01em]"><span className="tabular-nums">{tasks.length} de {tasks.length}</span> aprobadas</p>
              <span className="text-[12px] tabular-nums text-fg-2">{total} h en total</span>
            </div>
            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-hov2"><span className="lp-bar lp-done-bar block h-full w-full rounded-full" /></span>
            <ul className="mt-4 flex flex-col divide-y divide-line">
              {tasks.map((t, i) => (
                <li key={t.id} className="lp-enter flex items-center gap-2.5 py-[7px] text-[13px]" style={{ animationDelay: `${i * 50}ms` }}>
                  <Check className="sw-bold h-3.5 w-3.5 shrink-0 text-st-done-ink" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="shrink-0 text-[12px] text-fg-2">{first(owner(dist.assign[t.id]))}</span>
                  <span className="w-8 shrink-0 text-right font-mono text-[12px] text-fg-2">{t.hours} h</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12.5px] leading-5 text-fg-2">{first(LATE)} entró después y tomó la parte reservada. El cierre guarda quién hizo qué.</p>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-[12px] text-fg-2 sm:px-5">
        <span>Datos de ejemplo</span>
        <span className="hidden sm:inline">Mismo cálculo que usa la app</span>
      </div>
    </div>
  );
}

/** Fragmentos de UI por tiempo (datos de ejemplo, con los mismos estados que la app). */
function TiempoFragment({ n }) {
  const { tasks, dist } = useDemoData();
  const [accepted, setAccepted] = useState(false);
  const [archived, setArchived] = useState(false);
  const box = 'min-w-0 rounded-xl bg-card p-3 ring-1 ring-inset ring-line';
  const btn = 'inline-flex h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-[filter,background-color,transform] duration-200 active:scale-[.98] sm:h-9';
  if (n === 1) return (
    <div className={`${box} grid gap-2.5`}>
      <div className="flex items-center gap-2.5 text-[13px]">
        <Link2 className="h-4 w-4 shrink-0 text-fg-2" aria-hidden="true" /><span className="min-w-0 flex-1 truncate">Enlace de invitación</span>
        <span className="flex items-center">
          {PEOPLE.map((p, i) => <span key={p.id} className={i ? '-ml-1' : ''}><Avatar name={p.name} size="sm" ring="card" /></span>)}
          <span className="-ml-1"><Avatar pending size="sm" ring="card" /></span>
        </span>
      </div>
      <p className="pl-[26px] text-[12px] text-fg-2"><span className="font-medium tabular-nums text-fg">3 de 4</span> ya están en el grupo</p>
      <div className="flex items-center gap-2.5 rounded-lg bg-sunk px-2.5 py-2 text-[13px] ring-1 ring-inset ring-line">
        <FileText className="h-4 w-4 shrink-0 text-fg-2" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">consigna.pdf</span>
        <span className="shrink-0 text-[12px] tabular-nums text-fg-2">8 líneas · {tasks.length} tareas</span>
      </div>
    </div>
  );
  if (n === 2) {
    const mine = Object.values(dist.assign).filter((x) => x === 'ana').length;
    const max = Math.max(...Object.values(dist.loads));
    return (
      <div className={`${box} grid gap-3`}>
        <ul className="grid gap-2" aria-label="Carga de horas por persona">
          {dist.slots.map((s) => (
            <li key={s.id} className="grid grid-cols-[56px_minmax(0,1fr)_28px] items-center gap-2 text-[12px]">
              <span className="truncate text-fg-2">{s.reserve ? 'Reserva' : first(PEOPLE.find((p) => p.id === s.id).name)}</span>
              <span className="relative h-1.5 overflow-hidden rounded-full bg-hov2"><span className={`absolute inset-y-0 left-0 rounded-full ${s.reserve ? 'border border-dashed border-fg-3' : 'bg-fg'}`} style={{ width: `${(dist.loads[s.id] / max) * 100}%` }} /></span>
              <span className="text-right font-mono text-fg-2">{dist.loads[s.id]} h</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <p className="text-[12.5px] text-fg-2">Tu parte: <span className="font-medium tabular-nums text-fg">{mine} {mine === 1 ? "tarea" : "tareas"} · {dist.loads.ana} h</span></p>
          {accepted
            ? <button type="button" onClick={() => setAccepted(false)} className={`${btn} text-st-done-ink ring-1 ring-inset ring-line hover:bg-hov`} aria-live="polite"><Check className="sw-bold h-4 w-4" aria-hidden="true" />Aceptadas</button>
            : <button type="button" onClick={() => setAccepted(true)} className={`${btn} bg-accent text-on-accent hover:brightness-110`}><Check className="sw-bold h-4 w-4" aria-hidden="true" />Aceptar todas</button>}
        </div>
      </div>
    );
  }
  if (n === 3) return (
    <div className={`${box} grid gap-2`}>
      <ul className="grid min-w-0 gap-1.5">
        {[['Encuestar a 30 estudiantes', 'En curso', 'progress'], ['Redactar el informe', 'Bloqueada', 'blocked'], ['Investigar la basura del campus', 'Aprobada', 'done']].map(([t, w, k]) => (
          <li key={t} className="flex min-w-0 items-center gap-2 text-[13px]"><span className="min-w-0 flex-1 truncate">{t}</span><span className={`lp-st lp-st-${k}`}>{w}</span></li>
        ))}
      </ul>
      <div className="mt-1 flex items-start gap-2.5 rounded-lg bg-sunk px-2.5 py-2 ring-1 ring-inset ring-line">
        <Flag className="mt-0.5 h-4 w-4 shrink-0 text-fg-2" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[13px]"><span>Checkpoint <span className="text-[12px] tabular-nums text-fg-2">21 nov</span></span><span className="lp-st lp-st-risk">En riesgo</span></p>
          <p className="mt-0.5 text-[12px] leading-[18px] text-fg-2">Faltan 2 entregas y una tarea está bloqueada.</p>
        </div>
      </div>
    </div>
  );
  return (
    <div className={`${box} grid gap-3`}>
      <div>
        <p className="flex items-baseline justify-between text-[13px]"><span className="tabular-nums">7 de 7 aprobadas</span><span className="lp-st lp-st-done">Aprobada</span></p>
        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-hov2"><span className="lp-done-bar block h-full w-full rounded-full" /></span>
      </div>
      <figure className="m-0 rounded-lg bg-sunk px-3 py-2.5 ring-1 ring-inset ring-line">
        <figcaption className="text-[12px] font-medium text-fg-2">Nota de cierre</figcaption>
        <blockquote className="m-0 mt-1 text-[13px] leading-5">La encuesta nos trabó una semana. La próxima vez la lanzamos primero.</blockquote>
      </figure>
      <div className="flex justify-end">
        <button type="button" onClick={() => setArchived(!archived)} aria-pressed={archived} className={`${btn} ring-1 ring-inset ring-line hover:bg-hov ${archived ? 'text-fg-2' : 'text-fg'}`}>
          {archived ? <><Check className="sw-bold h-4 w-4" aria-hidden="true" />Archivado</> : <><Archive className="h-4 w-4" aria-hidden="true" />Archivar</>}
        </button>
      </div>
    </div>
  );
}

/** Sección de los 4 tiempos: la regla grande avanza 1→4 al entrar en pantalla; cada número se puede tocar. */
function Tiempos() {
  const ref = useRef(null);
  const seen = useInView(ref, 0.3);
  const [cur, setCur] = useState(0);
  const [auto, setAuto] = useState(() => !reduced());
  useEffect(() => {
    if (!seen || !auto) return undefined;
    if (cur >= 3) { setAuto(false); return undefined; }
    const t = setTimeout(() => setCur((c) => c + 1), cur === 0 ? 700 : 950);
    return () => clearTimeout(t);
  }, [seen, auto, cur]);
  const pick = (i) => { setAuto(false); setCur(i); };

  return (
    <section id="tiempos" aria-labelledby="tiempos-h" className="lp-ruled lp-sheet scroll-mt-16 border-t border-line">
      <div className="gutter mx-auto max-w-[1200px] py-16 lg:py-24">
        <div className="lp-indent grid gap-x-14 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
          <h2 id="tiempos-h" className="lp-h2 max-w-[18ch]">Cuatro tiempos. El grupo siempre sabe en cuál está.</h2>
          <p className="max-w-[52ch] text-[16px] leading-relaxed text-fg-2">
            Todo trabajo en grupo pasa por los mismos cuatro tiempos. Reparte3 muestra en cuál va el grupo y qué falta para pasar al siguiente, así aprenden a organizarse mientras trabajan. Sin puntos ni medallas: avisos claros cuando falta un responsable, una fecha o una confirmación.
          </p>
        </div>

        <div ref={ref} className="lp-indent mt-12 lg:mt-16">
          <ol className="lp-rule" aria-label="Los 4 tiempos">
            {TIEMPOS.map((t, i) => {
              const st = stateOf(i, cur);
              return (
                <li key={t.n} className="lp-t" data-state={st}>
                  <button type="button" className="lp-t-num" onClick={() => pick(i)} aria-pressed={i === cur}
                          aria-label={`Marcar ${t.name} como tiempo actual`}>
                    <span aria-hidden="true">{t.n}</span>
                    <Check className="lp-t-check sw-bold" aria-hidden="true" />
                  </button>
                  <span className="lp-t-seg" aria-hidden="true"><span className="lp-t-fill" /></span>
                  <div className="lp-t-text">
                    <h3 className="text-[22px] font-semibold leading-tight tracking-[-0.02em]">{t.name} <span className="sr-only">({STATE_WORD[st]})</span></h3>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-fg">{t.what}</p>
                    <dl className="mt-4 grid gap-3 text-[14px] leading-relaxed">
                      <div><dt className="flex items-center gap-1.5 font-medium"><Users className="h-3.5 w-3.5 text-fg-2" aria-hidden="true" />El grupo</dt><dd className="m-0 mt-0.5 text-fg-2">{t.group}</dd></div>
                      <div><dt className="flex items-center gap-1.5 font-medium"><img src="./icon.svg" alt="" className="h-3.5 w-3.5" />Reparte3</dt><dd className="m-0 mt-0.5 text-fg-2">{t.app}</dd></div>
                    </dl>
                  </div>
                  <div className="lp-t-frag grid content-start gap-3">
                    <TiempoFragment n={t.n} />
                    <p className="text-[12.5px] leading-5 text-fg-2"><span className="font-medium text-fg">{t.n < 4 ? 'Pasa al siguiente con: ' : 'Termina con: '}</span>{t.closes}</p>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-5 text-[12.5px] text-fg-2">
            <span className="inline-flex items-center gap-2"><span className="lp-legend-line bg-fg" />Hecho <Check className="sw-bold h-3 w-3" aria-hidden="true" /></span>
            <span className="inline-flex items-center gap-2"><span className="lp-legend-line bg-accent" />Actual</span>
            <span className="inline-flex items-center gap-2"><span className="lp-legend-line bg-line" style={{ boxShadow: 'inset 0 0 0 1px rgb(var(--fg-3) / .35)' }} />Pendiente</span>
            <span className="sm:ml-auto">La misma regla va en la cabecera de cada proyecto. Fragmentos con datos de ejemplo.</span>
          </div>
          <p className="sr-only" aria-live="polite">Tiempo {cur + 1} de 4: {TIEMPOS[cur].name}.</p>
        </div>
      </div>
    </section>
  );
}

const CENTER = [
  { id: 'resumen', icon: LayoutDashboard, title: 'Resumen', text: 'Qué deben lograr, qué te toca hoy y qué está en riesgo, con la razón de cada alerta. La actividad del grupo se abre desde aquí.' },
  { id: 'tareas', icon: ListChecks, title: 'Tareas', text: 'Las mismas tareas en tres vistas: Lista, Tablero y Mapa, con fases y dependencias. Un toque lleva a la tarea.' },
  { id: 'material', icon: Paperclip, title: 'Material', text: 'La consigna original con las líneas que generaron cada tarea, y los archivos del grupo: Docs, Sheets, Slides y carpetas de Drive.' },
  { id: 'chat', icon: MessageCircle, title: 'Chat', text: 'Conversación privada del grupo con mensajes fijados, búsqueda y enlaces a tareas.' },
  { id: 'equipo', icon: Users, title: 'Equipo', text: 'Quién está, quién falta entrar y qué rol tiene cada uno: coordinación, integrante, revisión o docente.' },
];

function TasksViews() {
  const [view, setView] = useState('lista');
  const views = [['lista', 'Lista', List], ['tablero', 'Tablero', Columns3], ['mapa', 'Mapa', MapIcon]];
  const rows = [['Investigar la basura del campus', 'Aprobada', 'done', 'Ana'], ['Encuestar a 30 estudiantes', 'En curso', 'progress', 'Beto'], ['Redactar el informe', 'Bloqueada', 'blocked', 'Caro'], ['Exponer en clase', 'Pendiente', 'todo', 'Dani']];
  return (
    <div>
      <div role="radiogroup" aria-label="Vista de tareas" className="inline-flex rounded-lg bg-hov p-0.5">
        {views.map(([id, label, I]) => (
          <button key={id} type="button" role="radio" aria-checked={view === id} onClick={() => setView(id)}
                  className={`inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-[12.5px] transition-colors sm:h-8 ${view === id ? 'bg-card font-medium text-fg shadow-xs ring-1 ring-inset ring-line' : 'text-fg-2 hover:text-fg'}`}>
            <I className="h-3.5 w-3.5" aria-hidden="true" />{label}
          </button>
        ))}
      </div>
      <div key={view} className="lp-enter mt-3">
        {view === 'lista' && (
          <ul className="grid gap-1">
            {rows.map(([t, w, k, who]) => (
              <li key={t} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] ring-1 ring-inset ring-line">
                <span className="min-w-0 flex-1 truncate">{t}</span><span className="hidden text-[12px] text-fg-2 sm:inline">{who}</span><span className={`lp-st lp-st-${k}`}>{w}</span>
              </li>
            ))}
          </ul>
        )}
        {view === 'tablero' && (
          <div className="grid grid-cols-3 gap-2 text-[12px]">
            {[['Pendiente', 'todo', [rows[3]]], ['En curso', 'progress', [rows[1], rows[2]]], ['Aprobada', 'done', [rows[0]]]].map(([col, k, items]) => (
              <div key={col} className="min-w-0 rounded-lg bg-sunk p-1.5 ring-1 ring-inset ring-line">
                <p className="px-1 pb-1.5 font-medium text-fg-2">{col}</p>
                <div className="grid gap-1.5">
                  {items.map(([t, w, kk]) => <div key={t} className="rounded-md bg-card p-2 leading-4 ring-1 ring-inset ring-line"><span className="line-clamp-2">{t}</span>{kk === 'blocked' && <span className="lp-st lp-st-blocked mt-1.5">{w}</span>}</div>)}
                </div>
              </div>
            ))}
          </div>
        )}
        {view === 'mapa' && (
          <div className="lp-dots flex items-center gap-1.5 overflow-hidden rounded-lg p-3 ring-1 ring-inset ring-line">
            {[['Investigar', 'lista', 'Aprobada'], ['Redactar', 'bloqueada', 'Bloqueada'], ['Exponer', 'pendiente', 'Pendiente']].map(([t, k, w], i) => (
              <div key={t} className="flex min-w-0 flex-1 items-center gap-1.5">
                {i > 0 && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-fg-3" aria-hidden="true" />}
                <div className={`flow-node flow-${k} relative min-w-0 flex-1 rounded-lg px-2 py-2 text-[12px]`}><span className="block truncate">{t}</span><span className="flow-pill mt-1.5">{w}</span></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Lo que hay en cada pestaña del proyecto (datos de ejemplo, mismos estilos que la app). */
function CenterFragment({ id }) {
  const row = 'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px]';
  if (id === 'resumen') return (
    <div className="grid gap-2">
      <div className={`${row} bg-hov`}><span className="min-w-0 flex-1 truncate">Te toca: Encuestar a 30 estudiantes</span><span className="lp-st lp-st-progress">En curso</span></div>
      <div className={`${row} ring-1 ring-inset ring-line`}><span className="min-w-0 flex-1 truncate">«Redactar el informe» espera datos</span><span className="lp-st lp-st-blocked">Bloqueada</span></div>
      <div className={`${row} text-fg-2`}><Activity className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="min-w-0 flex-1 truncate">Actividad: Beto entregó «Investigar»</span><span className="shrink-0 text-[12px] tabular-nums">hace 2 h</span></div>
    </div>
  );
  if (id === 'tareas') return <TasksViews />;
  if (id === 'material') return (
    <div className="grid gap-3">
      <ol className="lp-paper rounded-lg font-mono text-[12px] leading-[28px] ring-1 ring-inset ring-line" aria-label="Consigna con líneas marcadas">
        {[['3', 'Investigar cuánta basura genera el campus', true], ['4', 'Encuestar a 30 estudiantes sobre sus hábitos', true], ['9', 'Criterios: claridad y evidencia', false]].map(([n, t, tag]) => (
          <li key={n} className="grid grid-cols-[22px_minmax(0,1fr)] gap-3"><span className="text-right text-fg-2">{n}</span><span className={`truncate pr-2 font-sans text-[13px] ${tag ? 'text-fg' : 'text-fg-2'}`}>{t}{tag && <span className="ml-1.5 rounded bg-accent/10 px-1 font-mono text-[11px] lp-accent-ink">tarea</span>}</span></li>
        ))}
      </ol>
      <div className="grid grid-cols-3 gap-2 text-[12px]">
        {[[FileText, 'Informe final'], [Table, 'Respuestas'], [Presentation, 'Diapositivas']].map(([I, t]) => <div key={t} className="min-w-0 rounded-lg p-2.5 ring-1 ring-inset ring-line"><I className="h-4 w-4 text-fg-2" aria-hidden="true" /><span className="mt-1.5 block truncate font-medium">{t}</span></div>)}
      </div>
    </div>
  );
  if (id === 'chat') return (
    <div className="grid gap-2.5 text-[13px]">
      <div className="rounded-lg bg-hov px-3 py-2"><span className="font-medium">Fijado:</span> Reunión el jueves a las 7 p. m.</div>
      <div className="flex items-start gap-2 px-1"><Avatar name="Beto Ramos" size="sm" ring="card" /><p className="min-w-0"><span className="font-medium">Beto</span> <span className="text-[12px] tabular-nums text-fg-2">18:42</span><br />La tarea <span className="rounded bg-accent/10 px-1 font-mono text-[12px] lp-accent-ink">#3</span> ya va por la mitad.</p></div>
      <div className="flex items-start gap-2 px-1"><Avatar name="Caro Díaz" size="sm" ring="card" /><p className="min-w-0"><span className="font-medium">Caro</span> <span className="text-[12px] tabular-nums text-fg-2">18:45</span><br />Subí el borrador a Material.</p></div>
    </div>
  );
  return (
    <ul className="grid gap-1.5 text-[13px]">
      {[['Ana Torres', 'Coordinación'], ['Beto Ramos', 'Revisión'], ['Caro Díaz', 'Integrante']].map(([nm, role]) => (
        <li key={nm} className="flex items-center gap-2.5 px-1 py-1"><Avatar name={nm} size="sm" ring="card" /><span className="min-w-0 flex-1 truncate">{nm}</span><span className="text-[12px] text-fg-2">{role}</span></li>
      ))}
      <li className="flex items-center gap-2.5 rounded-lg bg-hov px-1 py-1.5"><Avatar pending size="sm" ring="card" /><span className="min-w-0 flex-1 truncate text-fg-2">Falta 1 por entrar</span><span className="text-[12px] text-fg-2">parte reservada</span></li>
    </ul>
  );
}

function ProjectCenter() {
  const [center, setCenter] = useState('resumen');
  const cur = CENTER.find((x) => x.id === center);
  const onKey = (e) => {
    const i = CENTER.findIndex((x) => x.id === center);
    const j = e.key === 'ArrowRight' ? (i + 1) % CENTER.length : e.key === 'ArrowLeft' ? (i - 1 + CENTER.length) % CENTER.length : -1;
    if (j < 0) return;
    e.preventDefault(); setCenter(CENTER[j].id);
    document.getElementById(`centro-tab-${CENTER[j].id}`)?.focus();
  };
  return (
    <section id="centro" aria-labelledby="centro-h" className="lp-plain scroll-mt-16 border-t border-line">
      <div className="gutter mx-auto grid max-w-[1200px] gap-10 py-16 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:gap-14 lg:py-24">
        <div>
          <h2 id="centro-h" className="lp-h2 max-w-[16ch]">Cada proyecto tiene su propio lugar.</h2>
          <p className="mt-4 max-w-[44ch] text-[16px] leading-relaxed text-fg-2">Arriba, la regla dice en qué tiempo va el grupo. Debajo, cinco pestañas: <span className="text-fg">Resumen, Tareas, Material, Chat y Equipo</span>. Los ajustes quedan en el engranaje, fuera del camino.</p>
        </div>
        <div className="min-w-0 overflow-hidden rounded-2xl bg-card ring-1 ring-inset ring-line">
          <div className="px-4 pt-4 sm:px-5">
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.01em]">Plan de reciclaje para el campus</p>
              <span className="shrink-0 text-[12px] tabular-nums text-fg-2">Tiempo 3 de 4</span>
              <Settings className="h-4 w-4 shrink-0 text-fg-2" aria-hidden="true" />
            </div>
            <div className="mt-1"><CompactRule cur={2} label="Regla del proyecto de ejemplo" /></div>
          </div>
          <div role="tablist" aria-label="Pestañas del proyecto" onKeyDown={onKey} className="no-scrollbar mt-2 flex gap-0.5 overflow-x-auto border-b border-line px-2 sm:gap-1 sm:px-4">
            {CENTER.map((x) => (
              <button key={x.id} id={`centro-tab-${x.id}`} type="button" role="tab" aria-selected={center === x.id} aria-controls="centro-panel" tabIndex={center === x.id ? 0 : -1}
                      onClick={() => setCenter(x.id)}
                      className={`relative flex h-11 shrink-0 items-center gap-1.5 rounded-t-md px-2 text-[13px] sm:px-2.5 sm:text-[13.5px] transition-colors ${center === x.id ? 'font-medium text-fg' : 'text-fg-2 hover:text-fg'}`}>
                <x.icon className="hidden h-4 w-4 sm:block" aria-hidden="true" />{x.title}
                {center === x.id && <span aria-hidden="true" className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-fg" />}
              </button>
            ))}
          </div>
          <div id="centro-panel" key={center} role="tabpanel" aria-labelledby={`centro-tab-${center}`} className="lp-enter flex min-h-[280px] flex-col gap-4 p-4 sm:p-5">
            <p className="max-w-[56ch] text-[14px] leading-relaxed text-fg-2"><span className="font-medium text-fg">{cur.title}.</span> {cur.text}</p>
            <div className="mt-1"><CenterFragment id={center} /></div>
          </div>
        </div>
      </div>
    </section>
  );
}

const CONTEXTS = {
  colegio: { icon: School, title: 'Colegio', points: ['Para estudiantes desde 14 años, con datos mínimos.', 'El docente puede entrar con un enlace de solo lectura.', 'Los 4 tiempos guían paso a paso: objetivo, tareas, fechas y revisión.'] },
  universidad: { icon: GraduationCap, title: 'Universidad', points: ['La IA lee la consigna o la rúbrica y propone tareas parejas.', 'Checkpoints hacia atrás desde la entrega final.', 'Registro de aportes para conversar sobre la nota con datos.'] },
  equipo: { icon: Briefcase, title: 'Equipo de trabajo', points: ['Roles de coordinación, revisión y lectura.', 'Dependencias y bloqueos visibles antes de que frenen la entrega.', 'Documentos de Google Workspace junto a cada tarea.'] },
};

function Contexts() {
  const [ctx, setCtx] = useState('universidad');
  const c = CONTEXTS[ctx];
  return (
    <section id="para-quien" aria-labelledby="quien-h" className="lp-sunk scroll-mt-16 border-t border-line">
      <div className="gutter mx-auto max-w-[1200px] py-16 lg:py-24">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h2 id="quien-h" className="lp-h2 max-w-[20ch]">Una sola herramienta, del colegio al trabajo.</h2>
          <div role="tablist" aria-label="Contexto" className="grid w-full grid-cols-3 rounded-xl bg-card p-1 ring-1 ring-inset ring-line sm:flex sm:w-auto">
            {Object.entries(CONTEXTS).map(([k, v]) => (
              <button key={k} type="button" role="tab" aria-selected={ctx === k} aria-controls="quien-panel" onClick={() => setCtx(k)}
                      className={`flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2 text-center text-[13px] leading-tight transition-colors sm:min-h-9 sm:px-3 sm:text-[13.5px] ${ctx === k ? 'bg-fg text-canvas' : 'text-fg-2 hover:text-fg'}`}>
                <v.icon className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" />{v.title}
              </button>
            ))}
          </div>
        </div>
        <ul id="quien-panel" role="tabpanel" key={ctx} className="lp-enter mt-10 grid divide-y divide-line rounded-2xl bg-card ring-1 ring-inset ring-line md:grid-cols-3 md:divide-x md:divide-y-0">
          {c.points.map((p) => <li key={p} className="flex gap-3 p-5 text-[15px] leading-relaxed"><Check className="sw-bold mt-1 h-4 w-4 shrink-0 text-accent" aria-hidden="true" /><span>{p}</span></li>)}
        </ul>
      </div>
    </section>
  );
}

export default function Landing({ theme, setTheme }) {
  const [menu, setMenu] = useState(false);
  const toAuth = (registro) => go(registro ? '/entrar?modo=registro' : '/entrar');
  const anchor = (id) => (e) => { e.preventDefault(); setMenu(false); document.getElementById(id)?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth' }); };
  const navLink = 'rounded-lg px-3 py-2 hover:bg-hov hover:text-fg';
  const primary = 'inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-5 text-[15px] font-semibold text-on-accent transition-[filter,transform] duration-200 hover:brightness-110 active:scale-[.98]';
  const links = [['tiempos', 'Los 4 tiempos'], ['centro', 'El proyecto'], ['para-quien', 'Para quién']];

  return (
    <div className="min-h-[100dvh] overflow-x-clip bg-canvas text-fg">
      <a href="#main" onClick={anchor('main')} className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:ring-1 focus:ring-line">Ir al contenido</a>
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur-md">
        <div className="gutter mx-auto flex h-16 max-w-[1200px] items-center gap-6">
          <a href="#/" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0 }); }} className="flex h-11 items-center gap-2.5 rounded-lg">
            <img src="./icon.svg" alt="" className="h-8 w-8" /><span className="text-[17px] font-semibold tracking-[-0.02em]">Reparte3</span>
          </a>
          <nav aria-label="Secciones" className="hidden items-center gap-1 text-[14px] text-fg-2 md:flex">
            {links.map(([id, l]) => <a key={id} href={`#${id}`} onClick={anchor(id)} className={navLink}>{l}</a>)}
          </nav>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'} className="grid h-11 w-11 place-items-center rounded-lg text-fg-2 hover:bg-hov hover:text-fg sm:h-9 sm:w-9">
              {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
            <button type="button" onClick={() => toAuth(false)} className="hidden h-9 rounded-lg px-3 text-[14px] font-medium text-fg hover:bg-hov sm:block">Entrar</button>
            <button type="button" onClick={() => toAuth(true)} className="h-11 rounded-lg bg-accent px-3.5 text-[14px] font-medium text-on-accent transition-[filter] hover:brightness-110 sm:h-9">Crear cuenta</button>
            <button type="button" onClick={() => setMenu(!menu)} aria-label="Menú" aria-expanded={menu} aria-controls="menu-movil" className="grid h-11 w-11 place-items-center rounded-lg text-fg-2 hover:bg-hov md:hidden">{menu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
          </div>
        </div>
        {menu && (
          <nav id="menu-movil" aria-label="Secciones" className="gutter lp-enter flex flex-col gap-1 border-t border-line py-3 text-[15px] md:hidden">
            {links.map(([id, l]) => <a key={id} href={`#${id}`} onClick={anchor(id)} className="flex min-h-11 items-center rounded-lg px-3 hover:bg-hov">{l}</a>)}
            <button type="button" onClick={() => toAuth(false)} className="flex min-h-11 items-center rounded-lg px-3 text-left hover:bg-hov">Entrar</button>
          </nav>
        )}
      </header>

      <main id="main" tabIndex={-1} className="outline-none">
        {/* Hero: el titular se escribe como una consigna numerada, con los números al margen. */}
        <section aria-labelledby="hero-h" className="lp-ruled lp-sheet">
          <div className="gutter mx-auto grid max-w-[1200px] items-center gap-10 pb-16 pt-10 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14 lg:pb-24 lg:pt-20">
            <div className="min-w-0">
              <h1 id="hero-h" className="lp-title" aria-label="De la consigna a la entrega, en partes iguales.">
                {['De la consigna', 'a la entrega,', 'en partes iguales.'].map((l, i) => (
                  <span key={l} className="lp-line lp-rise" style={{ animationDelay: `${i * 110}ms` }} aria-hidden="true"><span className="lp-n">{i + 1}</span><span>{l}</span></span>
                ))}
              </h1>
              <div className="lp-indent">
                <p className="mt-6 max-w-[46ch] text-[17px] leading-relaxed text-fg-2">
                  Sube la consigna de tu trabajo en grupo. Reparte3 la convierte en tareas, las reparte con la misma carga para todos y acompaña al grupo en cuatro tiempos hasta la entrega, sin perder nada en el chat de WhatsApp.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => toAuth(true)} className={primary}>Crear un grupo gratis<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
                  <button type="button" onClick={() => toAuth(false)} className="inline-flex h-12 items-center rounded-xl bg-card px-5 text-[15px] font-medium ring-1 ring-inset ring-line transition-colors hover:bg-hov">Ya tengo cuenta</button>
                </div>
                <p className="mt-5 text-[13px] text-fg-2">Gratis durante el lanzamiento. Desde 14 años.</p>
              </div>
            </div>
            <LiveDemo />
          </div>
        </section>

        <Tiempos />
        <ProjectCenter />
        <Contexts />

        <section aria-labelledby="cta-h" className="lp-ruled lp-sheet border-t border-line">
          <div className="gutter mx-auto max-w-[1200px] py-16 lg:py-20">
            <div className="lp-indent flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 id="cta-h" className="text-[28px] font-semibold leading-tight tracking-[-0.03em] sm:text-[34px]" style={{ textWrap: 'balance' }}>Arma tu grupo en dos minutos.</h2>
                <p className="mt-2 text-[15px] text-fg-2">Crea el proyecto, comparte el enlace y sube la consigna. El primer tiempo empieza ahí.</p>
              </div>
              <button type="button" onClick={() => toAuth(true)} className={`${primary} shrink-0`}>Crear un grupo gratis<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-sunk">
        <div className="gutter mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-6 gap-y-2 py-6 text-[13px] text-fg-2">
          <span className="flex items-center gap-2 py-2"><img src="./icon.svg" alt="" className="h-5 w-5" />Reparte3, proyecto estudiantil hecho en Lima.</span>
          <span className="flex flex-wrap items-center gap-x-4">
            <span className="inline-flex items-center gap-1.5 py-2"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" />La IA propone, el grupo decide.</span>
            <a href="#/privacidad" className="inline-flex min-h-11 items-center gap-1.5 rounded underline-offset-4 hover:text-fg hover:underline"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />Privacidad</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
