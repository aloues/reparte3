import { useEffect, useMemo, useRef, useState } from 'react';
import { Sun, Moon, Check, Users, FileText, ListChecks, GitBranch, MessageCircle, Paperclip, Activity, LayoutDashboard, GraduationCap, School, Briefcase, ShieldCheck, Sparkles, Hand, Flag, ArrowRight, Menu, X } from 'lucide-react';
import { analyzeBrief } from '../lib/detect';
import { fromFormat, distribute, PHASES } from '../lib/plan';
import { go } from '../lib/router';
import { Avatar } from '../components/ui';

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
const STEPS = [
  { id: 'consigna', label: 'Consigna', icon: FileText },
  { id: 'plan', label: 'Tareas', icon: ListChecks },
  { id: 'reparto', label: 'Reparto', icon: Users },
  { id: 'flujo', label: 'Flujo', icon: GitBranch },
];
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function useDemoData() {
  return useMemo(() => {
    const found = analyzeBrief(SAMPLE, 2026);
    const tasks = fromFormat(found);
    const hours = { F1: 1, F2: 3, F3: 3, F4: 3, F5: 3, F6: 2, F7: 1 };
    tasks.forEach((t) => { t.hours = hours[t.id] ?? t.hours; });
    // Cuatro integrantes esperados, tres ya dentro: la parte del cuarto queda reservada.
    const dist = distribute(tasks, PEOPLE.map((p) => p.id), { expected: 4 });
    return { tasks, dist };
  }, []);
}

/** La demostración del hero: consigna numerada → tareas → partes iguales → flujo. Datos de ejemplo. */
function LiveDemo() {
  const { tasks, dist } = useDemoData();
  const [step, setStep] = useState(0);
  const [auto, setAuto] = useState(!reduced());
  useEffect(() => {
    if (!auto) return undefined;
    if (step >= STEPS.length - 1) { setAuto(false); return undefined; }
    const t = setTimeout(() => setStep((s) => s + 1), step === 0 ? 2600 : 2900);
    return () => clearTimeout(t);
  }, [auto, step]);
  const pick = (i) => { setAuto(false); setStep(i); };
  const lineTask = Object.fromEntries(tasks.map((t) => [t.line, t]));
  const name = (id) => PEOPLE.find((p) => p.id === id)?.name;
  const max = Math.max(...Object.values(dist.loads));
  const status = ['lista', 'lista', 'en_curso', 'en_curso', 'pendiente', 'bloqueada', 'pendiente'];

  return (
    <div className="relative rounded-[20px] bg-card shadow-pop ring-1 ring-inset ring-line">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <div role="tablist" aria-label="Pasos de la demostración" className="no-scrollbar flex gap-1 overflow-x-auto">
          {STEPS.map((s, i) => (
            <button key={s.id} type="button" role="tab" aria-selected={step === i} onClick={() => pick(i)}
                    className={`relative flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] transition-colors ${step === i ? 'bg-hov2 font-medium text-fg' : 'text-fg-2 hover:bg-hov hover:text-fg'}`}>
              <s.icon className="h-3.5 w-3.5" />{s.label}
              {auto && step === i && <span aria-hidden="true" className="demo-timer absolute inset-x-2 bottom-0.5 h-[2px] origin-left rounded-full bg-accent" />}
            </button>
          ))}
        </div>
        <span className="hidden shrink-0 text-[11.5px] text-fg-3 sm:inline">Datos de ejemplo</span>
      </div>

      <div className="relative min-h-[360px] p-4 sm:p-5" role="tabpanel" aria-label={STEPS[step].label}>
        {step === 0 && (
          <ol key="c" className="anim-enter font-mono text-[12.5px] leading-[26px]">
            {SAMPLE.split('\n').map((l, i) => {
              const t = lineTask[i + 1];
              return (
                <li key={i} className="grid grid-cols-[26px_minmax(0,1fr)] items-start gap-2" style={{ animationDelay: `${i * 70}ms` }}>
                  <span className="select-none text-right text-fg-3">{i + 1}</span>
                  <span className={`truncate rounded px-1 font-sans text-[13px] transition-colors duration-500 ${t ? 'demo-mark bg-accent/10 text-fg' : 'text-fg-2'}`} style={{ transitionDelay: `${400 + i * 120}ms` }}>{l}</span>
                </li>
              );
            })}
            <li className="mt-3 pl-[34px] font-sans text-[12.5px] text-fg-2">Reparte3 marca las líneas que piden algo y las convierte en tareas.</li>
          </ol>
        )}
        {step === 1 && (
          <ul key="p" className="anim-enter flex flex-col divide-y divide-line">
            {tasks.map((t, i) => (
              <li key={t.id} className="demo-row flex items-center gap-3 py-2" style={{ animationDelay: `${i * 60}ms` }}>
                <span className="w-12 shrink-0 font-mono text-[11.5px] text-fg-3">línea {t.line}</span>
                <span className="min-w-0 flex-1 truncate text-[13.5px]">{t.title}</span>
                <span className="hidden shrink-0 rounded px-1.5 py-0.5 text-[11.5px] text-fg-2 ring-1 ring-inset ring-line sm:inline">{PHASES[t.phase]?.label}</span>
                <span className="w-9 shrink-0 text-right font-mono text-[12px] text-fg-2">{t.hours} h</span>
              </li>
            ))}
          </ul>
        )}
        {step === 2 && (
          <div key="r" className="anim-enter">
            <p className="text-[13px] text-fg-2">Cada parte apunta a <strong className="font-semibold text-fg">{dist.target.toFixed(1)} h</strong>. Quien aún no entra tiene su parte guardada.</p>
            <ul className="mt-5 flex flex-col gap-4">
              {dist.slots.map((s, i) => {
                const pending = s.reserve;
                return (
                  <li key={s.id} className="grid grid-cols-[minmax(0,120px)_minmax(0,1fr)_44px] items-center gap-3 text-[13px]">
                    <span className="flex min-w-0 items-center gap-2">{pending ? <Avatar pending size="sm" ring="card" /> : <Avatar name={name(s.id)} size="sm" ring="card" />}<span className={`truncate ${pending ? 'text-accent' : ''}`}>{pending ? 'Reservado' : name(s.id).split(' ')[0]}</span></span>
                    <span className="relative h-3 overflow-hidden rounded-full bg-hov2">
                      <span className={`demo-bar absolute inset-y-0 left-0 rounded-full ${pending ? 'border border-dashed border-accent bg-accent/15' : 'bg-fg'}`} style={{ width: `${(dist.loads[s.id] / max) * 100}%`, animationDelay: `${i * 120}ms` }} />
                    </span>
                    <span className="text-right font-mono text-[12px] text-fg-2">{dist.loads[s.id]} h</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-6 flex items-start gap-2 rounded-lg bg-hov px-3 py-2.5 text-[12.5px] leading-5 text-fg-2"><Hand className="mt-0.5 h-3.5 w-3.5 shrink-0" />Cada persona acepta su parte o dice «no puedo» con un motivo. Nada queda asignado a la fuerza.</p>
          </div>
        )}
        {step === 3 && (
          <div key="f" className="anim-enter">
            <div className="grid grid-cols-3 gap-3">
              {['Investigación', 'Desarrollo', 'Cierre'].map((col, ci) => (
                <div key={col}>
                  <p className="mb-2 text-[12px] font-medium text-fg-2">{col}</p>
                  <div className="flex flex-col gap-2">
                    {tasks.filter((t, ti) => (ci === 0 ? ti < 2 : ci === 1 ? ti >= 2 && ti < 5 : ti >= 5)).map((t) => {
                      const st = status[tasks.indexOf(t)];
                      return (
                        <div key={t.id} className={`flow-node flow-${st} relative rounded-lg px-2.5 py-2 text-[12px] leading-4`}>
                          <span className="flow-dot" aria-hidden="true" /><span className="line-clamp-2">{t.title}</span>
                          <span className="flow-pill mt-1.5">{FLOW_LABEL[st]}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[12.5px] text-fg-2">El flujo se arma con las tareas y estados reales del proyecto. El color nunca va solo: cada bloque dice su estado.</p>
          </div>
        )}
      </div>
    </div>
  );
}
const FLOW_LABEL = { lista: 'Lista y aprobada', en_curso: 'En curso', pendiente: 'Pendiente', bloqueada: 'Bloqueada' };

const CYCLE = [
  { title: 'Asigna', text: 'La consigna se vuelve tareas con su línea de origen y se reparte en partes iguales de horas.', chip: 'Te tocó «Encuestar a 30 estudiantes»' },
  { title: 'Confirma', text: 'Cada quien acepta su parte o explica por qué no puede. Así nadie se entera tarde de lo que le tocaba.', chip: 'Aceptada' },
  { title: 'Colabora', text: 'El chat del grupo y el de cada tarea viven junto al trabajo. Los enlaces compartidos quedan en Archivos.', chip: '3 mensajes nuevos' },
  { title: 'Entrega', text: 'Se entrega con enlace y otra persona revisa. Los checkpoints avisan antes de que algo se atrase.', chip: 'En revisión' },
  { title: 'Aprende', text: 'El resumen muestra qué se logró, qué se trabó y cómo se resolvió, para el siguiente trabajo.', chip: 'Cierre del proyecto' },
];
const CENTER = [
  { id: 'resumen', icon: LayoutDashboard, title: 'Resumen', text: 'Qué deben lograr, qué te toca hoy y qué está en riesgo, con la razón de cada alerta.' },
  { id: 'tareas', icon: ListChecks, title: 'Tareas', text: 'Lista y tablero, con responsable, fecha, checkpoint y quién falta por aceptar.' },
  { id: 'flujo', icon: GitBranch, title: 'Flujo', text: 'Las fases y dependencias del proyecto como un mapa. Un clic lleva a la tarea.' },
  { id: 'consigna', icon: FileText, title: 'Consigna', text: 'El documento original a la vista, con las líneas que generaron cada tarea marcadas.' },
  { id: 'archivos', icon: Paperclip, title: 'Archivos', text: 'Docs, Sheets, Slides, carpetas de Drive y archivos del grupo en un solo lugar.' },
  { id: 'chat', icon: MessageCircle, title: 'Chat', text: 'Conversación privada del grupo con mensajes fijados, búsqueda y enlaces a tareas.' },
  { id: 'actividad', icon: Activity, title: 'Actividad', text: 'Quién aceptó, entregó o pidió ayuda, y cuándo. Útil para explicar el aporte de cada uno.' },
];
const CONTEXTS = {
  colegio: { icon: School, title: 'Colegio', points: ['Para estudiantes desde 14 años, con datos mínimos.', 'El docente puede entrar con un enlace de solo lectura.', 'La ruta guía paso a paso: objetivo, tareas, fechas y revisión.'] },
  universidad: { icon: GraduationCap, title: 'Universidad', points: ['La IA lee la consigna o la rúbrica y propone tareas parejas.', 'Checkpoints hacia atrás desde la entrega final.', 'Registro de aportes para conversar sobre la nota con datos.'] },
  equipo: { icon: Briefcase, title: 'Equipo de trabajo', points: ['Roles de coordinación, revisión y lectura.', 'Dependencias y bloqueos visibles antes de que frenen la entrega.', 'Documentos de Google Workspace junto a cada tarea.'] },
};
const ROUTE = ['Definir el objetivo', 'Leer la consigna', 'Armar el grupo', 'Repartir en partes iguales', 'Acordar fechas', 'Revisar el avance', 'Cerrar y aprender'];

/** Fragmentos de cómo se ve cada pestaña del proyecto (datos de ejemplo, mismos estilos que la app). */
function Fragment({ id }) {
  const row = 'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px]';
  if (id === 'resumen') return (
    <div className="grid gap-2">
      <div className={`${row} bg-hov`}><span className="h-2 w-2 rounded-full bg-amber" />Te toca: Encuestar a 30 estudiantes<span className="ml-auto text-[12px] text-fg-2">en 8 días</span></div>
      <div className={`${row} bg-red/[.06] ring-1 ring-inset ring-red/20`}><span className="h-2 w-2 rounded-full bg-red" />«Redactar el informe» está bloqueada<span className="ml-auto text-[12px] text-fg-2">faltan datos</span></div>
      <div className={`${row}`}><span className="text-fg-2">Siguiente paso:</span> Confirmar compromisos</div>
    </div>
  );
  if (id === 'tareas') return (
    <ul className="grid gap-1.5">
      {[['Investigar cuánta basura genera el campus', 'En curso', 'en_curso'], ['Encuestar a 30 estudiantes', 'Por aceptar', 'pendiente'], ['Diseñar los puntos de acopio', 'Lista', 'lista']].map(([t, st, k]) => (
        <li key={t} className={`${row} ring-1 ring-inset ring-line`}><span className={`flow-swatch flow-${k} !h-2.5 !w-2.5 !rounded-full`} /><span className="min-w-0 flex-1 truncate">{t}</span><span className="text-[12px] text-fg-2">{st}</span></li>
      ))}
    </ul>
  );
  if (id === 'flujo') return (
    <div className="grid grid-cols-3 gap-2 text-[12px]">
      {[['Investigar', 'lista', 'Lista'], ['Redactar', 'bloqueada', 'Bloqueada'], ['Exponer', 'pendiente', 'Pendiente']].map(([t, k, st]) => <div key={t} className={`flow-node flow-${k} relative rounded-lg px-2.5 py-2`}><span className="block">{t}</span><span className="flow-pill mt-1.5">{st}</span></div>)}
    </div>
  );
  if (id === 'consigna') return (
    <ol className="font-mono text-[12px] leading-7">
      {[['3', 'Investigar cuánta basura genera el campus', '#2'], ['4', 'Encuestar a 30 estudiantes', '#3'], ['9', 'Criterios: claridad y evidencia', null]].map(([n, t, tag]) => (
        <li key={n} className={`grid grid-cols-[22px_minmax(0,1fr)] gap-2 rounded px-1 ${tag ? 'bg-accent/[.07]' : ''}`}><span className="text-right text-fg-3">{n}</span><span className="truncate font-sans text-[13px]">{t} {tag && <span className="rounded bg-accent/10 px-1 text-[11px] font-medium text-accent">{tag}</span>}</span></li>
      ))}
    </ol>
  );
  if (id === 'archivos') return (
    <div className="grid grid-cols-3 gap-2 text-[12px]">
      {[[FileText, 'Informe final'], [ListChecks, 'Respuestas encuesta'], [Paperclip, 'Diapositivas']].map(([I, t]) => <div key={t} className="rounded-lg p-2.5 ring-1 ring-inset ring-line"><I className="h-4 w-4 text-fg-2" /><span className="mt-2 block truncate font-medium">{t}</span></div>)}
    </div>
  );
  if (id === 'chat') return (
    <div className="grid gap-2 text-[13px]">
      <div className="rounded-lg bg-accent/[.05] px-3 py-2 ring-1 ring-inset ring-accent/15"><span className="font-medium">Fijado:</span> Reunión el jueves a las 7 pm.</div>
      <div className="px-1"><span className="font-medium">Beto:</span> La <span className="rounded bg-accent/10 px-1 font-medium text-accent">#3</span> ya va por la mitad.</div>
    </div>
  );
  return (
    <ul className="grid gap-1.5 text-[13px]">
      {['Caro aceptó «Encuestar a 30 estudiantes»', 'Beto entregó «Investigar» para revisión', 'Ana aprobó la entrega'].map((t) => <li key={t} className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-fg-3" />{t}</li>)}
    </ul>
  );
}

export default function Landing({ theme, setTheme }) {
  const [ctx, setCtx] = useState('universidad');
  const [center, setCenter] = useState('resumen');
  const [menu, setMenu] = useState(false);
  const c = CONTEXTS[ctx];
  const cur = CENTER.find((x) => x.id === center);
  const toAuth = (registro) => go(registro ? '/entrar?modo=registro' : '/entrar');
  const navRef = useRef(null);
  const anchor = (id) => (e) => { e.preventDefault(); setMenu(false); document.getElementById(id)?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth' }); };

  return (
    <div className="r3-ruled min-h-[100dvh] text-fg">
      <header ref={navRef} className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="gutter mx-auto flex h-16 max-w-[1200px] items-center gap-6">
          <a href="#/" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0 }); }} className="flex items-center gap-2.5">
            <img src="./icon.svg" alt="" className="h-8 w-8" /><span className="text-[17px] font-semibold tracking-[-0.02em]">Reparte3</span>
          </a>
          <nav aria-label="Secciones" className="hidden items-center gap-1 text-[14px] text-fg-2 md:flex">
            <a href="#como" onClick={anchor('como')} className="rounded-lg px-3 py-2 hover:bg-hov hover:text-fg">Cómo funciona</a>
            <a href="#centro" onClick={anchor('centro')} className="rounded-lg px-3 py-2 hover:bg-hov hover:text-fg">El proyecto</a>
            <a href="#para-quien" onClick={anchor('para-quien')} className="rounded-lg px-3 py-2 hover:bg-hov hover:text-fg">Para quién</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'} className="grid h-9 w-9 place-items-center rounded-lg text-fg-2 hover:bg-hov hover:text-fg">
              {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
            <button type="button" onClick={() => toAuth(false)} className="hidden h-9 rounded-lg px-3 text-[14px] font-medium text-fg hover:bg-hov sm:block">Entrar</button>
            <button type="button" onClick={() => toAuth(true)} className="h-9 rounded-lg bg-accent px-3.5 text-[14px] font-medium text-on-accent shadow-glow transition-all hover:-translate-y-px hover:brightness-110">Crear cuenta</button>
            <button type="button" onClick={() => setMenu(!menu)} aria-label="Menú" aria-expanded={menu} className="grid h-9 w-9 place-items-center rounded-lg text-fg-2 hover:bg-hov md:hidden">{menu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
          </div>
        </div>
        {menu && (
          <nav aria-label="Secciones" className="gutter anim-enter flex flex-col gap-1 border-t border-line py-3 text-[15px] md:hidden">
            <a href="#como" onClick={anchor('como')} className="rounded-lg px-3 py-2.5 hover:bg-hov">Cómo funciona</a>
            <a href="#centro" onClick={anchor('centro')} className="rounded-lg px-3 py-2.5 hover:bg-hov">El proyecto</a>
            <a href="#para-quien" onClick={anchor('para-quien')} className="rounded-lg px-3 py-2.5 hover:bg-hov">Para quién</a>
            <button type="button" onClick={() => toAuth(false)} className="rounded-lg px-3 py-2.5 text-left hover:bg-hov">Entrar</button>
          </nav>
        )}
      </header>

      <main id="main">
        {/* Hero: el titular se escribe como una consigna numerada, que es lo que la app lee. */}
        <section className="gutter mx-auto grid max-w-[1200px] items-center gap-12 pb-16 pt-12 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14 lg:pb-24 lg:pt-20">
          <div>
            <h1 className="landing-title" aria-label="De la consigna a la entrega, en partes iguales.">
              {['De la consigna', 'a la entrega,', 'en partes iguales.'].map((l, i) => (
                <span key={l} className="landing-line" style={{ animationDelay: `${i * 120}ms` }}><span className="landing-n" aria-hidden="true">{i + 1}</span><span>{l}</span></span>
              ))}
            </h1>
            <p className="mt-7 max-w-[46ch] text-[17px] leading-relaxed text-fg-2">
              Sube la consigna de tu trabajo en grupo. Reparte3 la convierte en tareas, las reparte con la misma carga para todos y acompaña al equipo hasta la entrega, sin perder nada en el chat de WhatsApp.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => toAuth(true)} className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-5 text-[15px] font-semibold text-on-accent shadow-glow transition-all hover:-translate-y-px hover:brightness-110">Crear un grupo gratis<ArrowRight className="h-4 w-4" /></button>
              <button type="button" onClick={() => toAuth(false)} className="inline-flex h-12 items-center rounded-xl px-5 text-[15px] font-medium ring-1 ring-inset ring-line hover:bg-hov">Ya tengo cuenta</button>
            </div>
            <p className="mt-5 text-[13px] text-fg-3">Gratis durante el lanzamiento. Desde 14 años.</p>
          </div>
          <LiveDemo />
        </section>

        {/* Ciclo: es una secuencia real, por eso va numerado. */}
        <section id="como" className="scroll-mt-20 border-t border-line bg-sunk">
          <div className="gutter mx-auto max-w-[1200px] py-16 lg:py-24">
            <h2 className="max-w-[22ch] text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[38px]" style={{ textWrap: 'balance' }}>Cinco momentos que el grupo recorre junto.</h2>
            <ol className="cycle mt-12 grid gap-8 md:grid-cols-5 md:gap-4">
              {CYCLE.map((s, i) => (
                <li key={s.title} className="cycle-step relative">
                  <span className="cycle-n">{i + 1}</span>
                  <h3 className="mt-4 text-[17px] font-semibold">{s.title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-fg-2">{s.text}</p>
                  <span className="mt-4 inline-flex max-w-full items-center gap-1.5 truncate rounded-md bg-card px-2 py-1 text-[12px] text-fg-2 ring-1 ring-inset ring-line">{i === 1 ? <Check className="h-3 w-3" /> : i === 3 ? <Flag className="h-3 w-3" /> : null}{s.chip}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Centro de proyecto: selector con lo que hay en cada pestaña real de la app. */}
        <section id="centro" className="scroll-mt-20">
          <div className="gutter mx-auto grid max-w-[1200px] gap-10 py-16 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] lg:py-24">
            <div>
              <h2 className="max-w-[18ch] text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[38px]" style={{ textWrap: 'balance' }}>Cada proyecto tiene su propio lugar.</h2>
              <p className="mt-4 max-w-[44ch] text-[16px] leading-relaxed text-fg-2">Consigna, tareas, conversación, archivos y avance juntos. De la vista general a una tarea, su chat y su documento en dos clics.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
              <div role="tablist" aria-label="Partes del proyecto" className="no-scrollbar flex gap-1 overflow-x-auto sm:flex-col">
                {CENTER.map((x) => (
                  <button key={x.id} type="button" role="tab" aria-selected={center === x.id} onClick={() => setCenter(x.id)}
                          className={`flex h-10 shrink-0 items-center gap-2.5 rounded-lg px-3 text-left text-[14px] transition-colors ${center === x.id ? 'bg-hov2 font-medium text-fg' : 'text-fg-2 hover:bg-hov hover:text-fg'}`}>
                    <x.icon className="h-4 w-4" />{x.title}
                  </button>
                ))}
              </div>
              <div key={center} role="tabpanel" className="anim-enter flex min-h-[260px] flex-col gap-6 rounded-2xl bg-card p-6 ring-1 ring-inset ring-line">
                <div className="flex items-start gap-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-on-accent"><cur.icon className="h-5 w-5" /></span>
                  <div>
                    <h3 className="text-[20px] font-semibold tracking-[-0.02em]">{cur.title}</h3>
                    <p className="mt-1 max-w-[42ch] text-[14.5px] leading-relaxed text-fg-2">{cur.text}</p>
                  </div>
                </div>
                <div className="mt-auto rounded-xl bg-sunk p-3 ring-1 ring-inset ring-line"><Fragment id={center} /></div>
              </div>
            </div>
          </div>
        </section>

        {/* Para quién: misma app, la complejidad se revela según el contexto. */}
        <section id="para-quien" className="scroll-mt-20 border-t border-line bg-sunk">
          <div className="gutter mx-auto max-w-[1200px] py-16 lg:py-24">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <h2 className="max-w-[20ch] text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[38px]" style={{ textWrap: 'balance' }}>Una sola herramienta, del colegio al trabajo.</h2>
              <div role="tablist" aria-label="Contexto" className="flex rounded-xl bg-card p-1 ring-1 ring-inset ring-line">
                {Object.entries(CONTEXTS).map(([k, v]) => (
                  <button key={k} type="button" role="tab" aria-selected={ctx === k} onClick={() => setCtx(k)}
                          className={`flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13.5px] transition-colors ${ctx === k ? 'bg-fg text-canvas' : 'text-fg-2 hover:text-fg'}`}><v.icon className="h-4 w-4" />{v.title}</button>
                ))}
              </div>
            </div>
            <ul key={ctx} className="anim-enter mt-10 grid gap-4 md:grid-cols-3">
              {c.points.map((p) => <li key={p} className="rounded-2xl bg-card p-5 text-[15px] leading-relaxed ring-1 ring-inset ring-line"><Check className="mb-3 h-5 w-5 text-accent" />{p}</li>)}
            </ul>
          </div>
        </section>

        {/* Formativo: la ruta que la app enseña mientras se trabaja. */}
        <section className="gutter mx-auto max-w-[1200px] py-16 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
            <div>
              <h2 className="max-w-[18ch] text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[38px]" style={{ textWrap: 'balance' }}>Mientras trabajan, aprenden a organizarse.</h2>
              <p className="mt-4 max-w-[44ch] text-[16px] leading-relaxed text-fg-2">Cada proyecto muestra en qué paso va el grupo y por qué importa el siguiente. Sin puntos ni medallas: avisos claros cuando falta un responsable, una fecha o una confirmación.</p>
            </div>
            <ol className="route-list">
              {ROUTE.map((r, i) => <li key={r}><span className="route-n">{i + 1}</span>{r}</li>)}
            </ol>
          </div>
        </section>

        <section className="border-t border-line">
          <div className="gutter mx-auto flex max-w-[1200px] flex-col items-start gap-6 py-16 sm:flex-row sm:items-center sm:justify-between lg:py-20">
            <div>
              <h2 className="text-[28px] font-semibold tracking-[-0.03em] sm:text-[34px]">Arma tu grupo en dos minutos.</h2>
              <p className="mt-2 text-[15px] text-fg-2">Crea el proyecto, comparte el enlace y sube la consigna.</p>
            </div>
            <button type="button" onClick={() => toAuth(true)} className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-5 text-[15px] font-semibold text-on-accent shadow-glow transition-all hover:-translate-y-px hover:brightness-110">Crear un grupo gratis<ArrowRight className="h-4 w-4" /></button>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-sunk">
        <div className="gutter mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 py-8 text-[13px] text-fg-2">
          <span className="flex items-center gap-2"><img src="./icon.svg" alt="" className="h-5 w-5" />Reparte3, proyecto estudiantil hecho en Lima.</span>
          <span className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" />La IA propone, el grupo decide.</span>
            <a href="#/privacidad" className="inline-flex items-center gap-1.5 underline-offset-4 hover:text-fg hover:underline"><ShieldCheck className="h-3.5 w-3.5" />Privacidad</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
