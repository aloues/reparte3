import { useEffect, useRef, useState } from 'react';
import { X, Check, ArrowRight, ArrowLeft, FileText, Loader2, CheckCircle2, Info, Plus, Trash2, MessageCircle, Copy, ArrowUpRight, Users, GraduationCap } from 'lucide-react';
import { useApp } from '../lib/store';
import { analyzeBrief } from '../lib/detect';
import { extractText } from '../lib/extract';
import { todayISO, fmtSize } from '../lib/format';
import { appUrl, go } from '../lib/router';
import { Btn, Mono, Segmented } from './ui';
import { DropZone } from './Chat';

function Stepper({ step }) {
  const steps = ['Datos', 'Consigna y tareas', 'Invitar'];
  return (
    <ol className="flex items-center gap-2" aria-label="Pasos">
      {steps.map((s, i) => {
        const n = i + 1; const done = step > n; const cur = step === n;
        return (
          <li key={s} className="flex flex-1 items-center gap-2" aria-current={cur ? 'step' : undefined}>
            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11.5px] font-semibold transition-all duration-300 ${done ? 'bg-fg text-canvas' : cur ? 'bg-accent text-on-accent' : 'bg-hov2 text-fg-2'}`}>
              {done ? <Check className="sw-bold pop h-3.5 w-3.5" /> : n}
            </span>
            <span className={`hidden text-[12.5px] sm:inline ${cur || done ? 'font-medium text-fg' : 'text-fg-2'}`}>{s}</span>
            {i < steps.length - 1 && <span className="relative mx-1 h-px flex-1 overflow-hidden bg-line"><span className="absolute inset-y-0 left-0 bg-fg transition-all duration-500" style={{ width: done ? '100%' : '0%' }} /></span>}
          </li>
        );
      })}
    </ol>
  );
}

const PHASES = ['Leyendo el documento en tu dispositivo', 'Buscando viñetas, numeraciones y verbos de entrega', 'Armando la lista de tareas'];
let rowId = 0;
const row = (t) => ({ key: ++rowId, on: true, title: t.title || '', hours: t.hours || 2, due: t.due || '', line: t.line || null });

export default function Wizard({ open, onClose }) {
  const { createProject, createInvite, toast } = useApp();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [course, setCourse] = useState('');
  const [due, setDue] = useState('');
  const [file, setFile] = useState(null);
  const [phase, setPhase] = useState(-1);
  const [brief, setBrief] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pid, setPid] = useState(null);
  const [invites, setInvites] = useState({});
  const [linkRole, setLinkRole] = useState('integrante');
  const [copied, setCopied] = useState(false);
  const nameRef = useRef(null);
  const linkRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setStep(1); setName(''); setCourse(''); setDue(''); setFile(null); setPhase(-1); setBrief(null); setRows([]); setError(''); setBusy(false); setPid(null); setInvites({}); setLinkRole('integrante'); setCopied(false);
    const t = setTimeout(() => nameRef.current?.focus(), 80);
    document.body.style.overflow = 'hidden';
    return () => { clearTimeout(t); document.body.style.overflow = ''; };
  }, [open]);

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const analyze = async (f) => {
    setError(''); setFile(f); setPhase(0); setRows([]);
    try {
      const [out] = await Promise.all([extractText(f), wait(700)]);
      setPhase(1); await wait(600);
      const found = analyzeBrief(out.text, Number((due || todayISO()).slice(0, 4)));
      setPhase(2); await wait(450);
      setBrief({ text: out.text, fileName: out.fileName, warnings: out.warnings });
      setRows(found.length ? found.map(row) : [row({ title: '' })]);
      setPhase(3);
      if (!found.length) setError('No encontramos tareas con viñetas o verbos de entrega. Escríbelas a mano abajo.');
    } catch (e) { setError(e.message); setPhase(-1); setFile(null); }
  };
  const manual = () => { setPhase(3); setBrief(null); setRows([row({ title: '' }), row({ title: '' }), row({ title: '' })]); };
  const chosen = rows.filter((r) => r.on && r.title.trim().length >= 2);

  const create = async () => {
    setBusy(true);
    const id = await createProject({
      name: name.trim(), course: course.trim(), due: due || null, brief: brief?.text?.slice(0, 100000) || null, briefFile: brief?.fileName || null,
      tasks: chosen.map((r) => ({ title: r.title.trim(), hours: r.hours || null, due_date: r.due || null, source_line: r.line })),
    });
    if (id) {
      setPid(id);
      const inv = await createInvite(id, 'integrante');
      if (inv) setInvites({ integrante: inv.code });
      setStep(3);
    }
    setBusy(false);
  };
  const ensureInvite = async (role) => {
    setLinkRole(role); setCopied(false);
    if (!invites[role] && pid) { const inv = await createInvite(pid, role); if (inv) setInvites((x) => ({ ...x, [role]: inv.code })); }
  };
  const link = invites[linkRole] ? appUrl(`/unirse/${invites[linkRole]}`) : '';
  const waText = `Únanse a «${name.trim()}» en Reparte3. Ahí repartimos las tareas, conversamos y nos llegan los avisos: ${link}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2200); }
    catch (e) { linkRef.current?.select(); toast('Selecciona el enlace y cópialo con Ctrl+C.', { icon: 'info' }); }
  };
  const finish = () => { onClose(); if (pid) go(`/p/${pid}`); };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <button type="button" tabIndex={-1} aria-label="Cerrar" onClick={step === 3 ? finish : onClose} className="absolute inset-0 bg-overlay backdrop-blur-[2px]" />
      <div role="dialog" aria-modal="true" aria-labelledby="wz-title" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); step === 3 ? finish() : onClose(); } }}
           className="anim-scale relative flex max-h-[calc(100dvh-32px)] w-full max-w-[620px] flex-col overflow-hidden rounded-2xl bg-canvas shadow-pop ring-1 ring-inset ring-line">
        <header className="flex shrink-0 flex-col gap-5 border-b border-line px-6 pb-5 pt-5">
          <div className="flex items-center justify-between">
            <h2 id="wz-title" className="text-[15px] font-semibold">Nuevo proyecto</h2>
            <button type="button" onClick={step === 3 ? finish : onClose} aria-label="Cerrar" className="grid h-8 w-8 place-items-center rounded-lg text-fg-2 hover:bg-hov hover:text-fg"><X className="h-4 w-4" /></button>
          </div>
          <Stepper step={step} />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-7">
          {step === 1 && (
            <form id="wz-1" className="anim-enter flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2) setStep(2); }}>
              <div>
                <h3 className="text-[20px] font-semibold tracking-[-0.02em]">¿Cómo se llama el trabajo?</h3>
                <p className="mt-1 text-[13.5px] text-fg-2">Lo verá todo el grupo. Tú quedas como coordinador.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="wz-name" className="label">Nombre del proyecto</label>
                <input id="wz-name" ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} maxLength={90} required placeholder="Ej.: Informe de gestión ambiental" className="field h-11 text-[15px]" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="wz-course" className="label">Curso <span className="font-normal text-fg-2">(opcional)</span></label>
                  <input id="wz-course" value={course} onChange={(e) => setCourse(e.target.value)} maxLength={60} placeholder="Ej.: Comunicación II" className="field" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="wz-due" className="label">Fecha de entrega</label>
                  <input id="wz-due" type="date" min={todayISO()} value={due} onChange={(e) => setDue(e.target.value)} className="field" />
                </div>
              </div>
            </form>
          )}

          {step === 2 && (
            <div className="anim-enter flex flex-col gap-5">
              <div>
                <h3 className="text-[20px] font-semibold tracking-[-0.02em]">Sube la consigna</h3>
                <p className="mt-1 text-[13.5px] text-fg-2">Reparte3 la lee en tu dispositivo y propone las tareas. Tú decides cuáles quedan.</p>
              </div>
              {error && <p role="alert" className="flex items-start gap-2 rounded-lg bg-orange/10 px-3 py-2.5 text-[13px] text-orange ring-1 ring-inset ring-orange/25"><Info className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}

              {phase < 0 && <>
                <DropZone id="wz-file" multiple={false} accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                          label="Arrastra la consigna aquí" hint="PDF, Word (.docx) o texto, hasta 5 MB. No se sube a ningún servidor." onFiles={(fs) => analyze(fs[0])} />
                <button type="button" onClick={manual} className="self-center text-[13px] font-medium text-fg-2 underline decoration-fg-3/50 underline-offset-4 hover:text-fg">No tengo consigna: escribir las tareas a mano</button>
              </>}

              {phase >= 0 && phase < 3 && (
                <div className="grid gap-5 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center" aria-live="polite">
                  <div className="relative mx-auto h-44 w-[150px] overflow-hidden rounded-lg bg-card p-4 shadow-xs ring-1 ring-inset ring-line">
                    {[80, 95, 60, 0, 90, 70, 85, 0, 75, 92, 55].map((w, i) => (w
                      ? <span key={i} className={`mb-2 block h-1.5 rounded-full transition-colors duration-500 ${phase >= 1 && [1, 4, 8, 9].includes(i) ? 'bg-accent/50' : 'bg-fg/10'}`} style={{ width: `${w}%` }} />
                      : <span key={i} className="mb-2 block h-1.5" />))}
                    <span aria-hidden="true" className="scan pointer-events-none absolute inset-x-0 top-0 h-14" style={{ background: 'linear-gradient(to bottom, transparent, rgb(var(--accent) / .22), transparent)' }} />
                  </div>
                  <div>
                    {file && <p className="mb-3 flex items-center gap-2 text-[13px]"><FileText className="h-4 w-4 text-fg-3" /><span className="truncate font-medium">{file.name}</span><span className="text-fg-2">{fmtSize(file.size)}</span></p>}
                    <ol className="flex flex-col gap-3">
                      {PHASES.map((ph, i) => (
                        <li key={ph} className={`flex items-center gap-3 text-[13.5px] ${phase > i ? 'text-fg' : phase === i ? 'font-medium text-fg' : 'text-fg-3'}`}>
                          <span className="grid h-5 w-5 place-items-center">{phase > i ? <Check className="sw-bold pop h-4 w-4" /> : phase === i ? <Loader2 className="h-4 w-4 animate-spin text-accent" /> : <span className="h-1.5 w-1.5 rounded-full bg-fg-3" />}</span>{ph}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}

              {phase === 3 && <>
                {brief && <p className="flex items-center gap-2 text-[13px]"><CheckCircle2 className="h-4 w-4 text-fg-2" /><span className="truncate font-medium">{brief.fileName}</span><span className="text-fg-2">leído</span></p>}
                {brief?.warnings?.map((w) => <p key={w} className="text-[12.5px] text-orange">{w}</p>)}
                <div>
                  <p className="mb-2 flex items-center justify-between text-[13px]"><span className="font-medium">{rows.length} tareas propuestas</span><span className="text-fg-2">{chosen.length} quedan</span></p>
                  <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-xl ring-1 ring-inset ring-line">
                    {rows.map((r, i) => (
                      <li key={r.key} className="anim-enter flex items-center gap-2.5 bg-card px-3 py-2" style={{ animationDelay: `${Math.min(i, 12) * 50}ms` }}>
                        <input type="checkbox" aria-label={`Incluir tarea ${i + 1}`} checked={r.on} onChange={() => setRows(rows.map((x) => (x.key === r.key ? { ...x, on: !x.on } : x)))} className="h-4 w-4 shrink-0 rounded accent-[rgb(var(--accent))]" />
                        <label htmlFor={`wz-t-${r.key}`} className="sr-only">Tarea {i + 1}</label>
                        <input id={`wz-t-${r.key}`} value={r.title} maxLength={140} placeholder="Escribe la tarea" onChange={(e) => setRows(rows.map((x) => (x.key === r.key ? { ...x, title: e.target.value } : x)))}
                               className={`min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-1.5 text-[13.5px] outline-none focus:bg-hov ${r.on ? '' : 'text-fg-3 line-through'}`} />
                        <label htmlFor={`wz-h-${r.key}`} className="sr-only">Horas</label>
                        <input id={`wz-h-${r.key}`} type="number" min="0.5" max="200" step="0.5" value={r.hours} onChange={(e) => setRows(rows.map((x) => (x.key === r.key ? { ...x, hours: Number(e.target.value) } : x)))}
                               className="w-14 rounded-md bg-hov px-1.5 py-1 text-right font-mono text-[12px] outline-none focus:ring-1 focus:ring-accent/60" />
                        <Mono className="text-fg-3">h</Mono>
                        <button type="button" aria-label="Quitar" onClick={() => setRows(rows.filter((x) => x.key !== r.key))} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-fg-3 hover:bg-hov hover:text-red"><Trash2 className="h-3.5 w-3.5" /></button>
                      </li>
                    ))}
                  </ul>
                  <button type="button" onClick={() => setRows([...rows, row({ title: '' })])} className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-medium text-fg-2 hover:bg-hov hover:text-fg"><Plus className="h-4 w-4" />Añadir tarea</button>
                </div>
                <p className="flex items-start gap-2 rounded-lg bg-hov px-3 py-2.5 text-[12.5px] leading-5 text-fg-2">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />Detección por formato, sin IA: es una propuesta. Las horas son una estimación inicial que puedes cambiar. Después podrás repartirlas entre el grupo.
                </p>
              </>}
            </div>
          )}

          {step === 3 && (
            <div className="anim-enter flex flex-col gap-6">
              <div className="flex flex-col items-center text-center">
                <span className="relative grid h-16 w-16 place-items-center">
                  <span className="halo absolute inset-0 rounded-full bg-accent/30" />
                  <svg viewBox="0 0 52 52" className="relative h-16 w-16" aria-hidden="true">
                    <circle cx="26" cy="26" r="24" fill="rgb(var(--accent))" className="draw-circle" stroke="rgb(var(--accent))" strokeWidth="2" />
                    <path d="M16 27l7 7 13-15" fill="none" stroke="rgb(var(--on-accent))" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="draw-check" />
                  </svg>
                </span>
                <h3 className="mt-4 text-[20px] font-semibold tracking-[-0.02em]">Proyecto creado</h3>
                <p className="mt-1 max-w-sm text-[13.5px] text-fg-2">«{name.trim()}» tiene {chosen.length ? `${chosen.length} tareas` : 'su espacio listo'}. Invita a tu grupo: el chat, los avisos y las entregas pasan dentro de Reparte3.</p>
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="label">Enlace de invitación</p>
                  <Segmented label="Rol del enlace" value={linkRole} onChange={ensureInvite}
                             options={[{ id: 'integrante', label: 'Compañeros', icon: Users }, { id: 'docente', label: 'Docente', icon: GraduationCap }]} />
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="wz-link" className="sr-only">Enlace de invitación</label>
                  <input id="wz-link" ref={linkRef} readOnly value={link || 'Creando enlace…'} onFocus={(e) => e.target.select()} className="field h-10 min-w-0 flex-1 bg-hov font-mono text-[12px] text-fg-2" />
                </div>
                <Btn kind="primary" size="lg" className="h-12 w-full text-[15px]" onClick={copy} disabled={!link}>
                  {copied ? <><Check className="sw-bold pop h-5 w-5" />Enlace copiado</> : <><Copy className="h-5 w-5" />Copiar enlace de invitación</>}
                </Btn>
                <a href={`https://wa.me/?text=${encodeURIComponent(waText)}`} target="_blank" rel="noopener noreferrer"
                   className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl text-[13.5px] font-medium text-fg-2 ring-1 ring-inset ring-line transition-all hover:bg-hov hover:text-fg ${link ? '' : 'pointer-events-none opacity-40'}`}>
                  <MessageCircle className="h-4 w-4" />Enviar el enlace por WhatsApp<ArrowUpRight className="h-3.5 w-3.5" />
                </a>
                <p className="text-[12px] text-fg-2">{linkRole === 'docente' ? 'Quien entre con este enlace verá el avance, pero no podrá editar ni escribir.' : 'Vale 14 días y hasta 30 personas. Puedes desactivarlo en Equipo.'}</p>
              </div>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-sunk px-6 py-4">
          {step === 1 && <><Btn onClick={onClose}>Cancelar</Btn><Btn kind="primary" type="submit" form="wz-1" disabled={name.trim().length < 2}>Continuar<ArrowRight className="h-4 w-4" /></Btn></>}
          {step === 2 && <>
            <Btn onClick={() => { setStep(1); setPhase(-1); setFile(null); setError(''); }}><ArrowLeft className="h-4 w-4" />Atrás</Btn>
            <Btn kind="primary" loading={busy} disabled={phase > -1 && phase < 3} onClick={create}>
              {phase === 3 ? (chosen.length ? `Crear con ${chosen.length} tareas` : 'Crear sin tareas') : 'Crear sin consigna'}<ArrowRight className="h-4 w-4" />
            </Btn>
          </>}
          {step === 3 && <><span className="text-[12.5px] text-fg-2">Puedes invitar más tarde desde Equipo.</span><Btn kind="secondary" onClick={finish}>Ir al proyecto<ArrowRight className="h-4 w-4" /></Btn></>}
        </footer>
      </div>
    </div>
  );
}
