import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  X, Check, ArrowRight, ArrowLeft, FileText, Loader2, Info, Plus, Trash2, MessageCircle, Copy, ArrowUpRight,
  Users, Sparkles, ScanText, ChevronDown, Shuffle, Flag, AlertTriangle,
} from 'lucide-react';
import { useApp } from '../lib/store';
import { analyzeBrief } from '../lib/detect';
import { extractText } from '../lib/extract';
import { planWithAI } from '../lib/ai';
import { todayISO, fmtShort } from '../lib/format';
import { validatePlan, fromFormat, distribute, buildCheckpoints, PHASES, KINDS, TOLERANCE } from '../lib/plan';
import { appUrl, go } from '../lib/router';
import { Btn, Mono, Avatar, Chip, SelectField } from './ui';
import { DropZone } from './Chat';

const STEPS = ['Grupo', 'Consigna', 'Reparto'];
function Stepper({ step }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Pasos">
      {STEPS.map((s, i) => {
        const n = i + 1; const done = step > n; const cur = step === n;
        return (
          <li key={s} className="flex flex-1 items-center gap-2" aria-current={cur ? 'step' : undefined}>
            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11.5px] font-semibold transition-all duration-300 ${done ? 'bg-fg text-canvas' : cur ? 'bg-accent text-on-accent' : 'bg-hov2 text-fg-2'}`}>
              {done ? <Check className="sw-bold pop h-3.5 w-3.5" /> : n}
            </span>
            <span className={`hidden text-[12.5px] sm:inline ${cur || done ? 'font-medium text-fg' : 'text-fg-2'}`}>{s}</span>
            {i < STEPS.length - 1 && <span className="relative mx-1 h-px flex-1 overflow-hidden bg-line"><span className="absolute inset-y-0 left-0 bg-fg transition-all duration-500" style={{ width: done ? '100%' : '0%' }} /></span>}
          </li>
        );
      })}
    </ol>
  );
}

let rowId = 0;
const toRow = (t, origin) => ({ ...t, key: `r${++rowId}`, on: true, origin });

/** Paso 1 después de crear: enlace, QR y lista en vivo de quién entró. */
function Lobby({ pid, expected }) {
  const { membersOf, listInvites, createInvite, toast, project } = useApp();
  const [code, setCode] = useState(null);
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const linkRef = useRef(null);
  const p = project(pid);
  useEffect(() => {
    let off = false;
    (async () => {
      const list = (await listInvites(pid)) || [];
      const live = list.find((i) => i.role === 'integrante' && new Date(i.expires_at) > new Date() && i.uses < i.max_uses);
      const inv = live || (await createInvite(pid, 'integrante'));
      if (!off && inv) setCode(inv.code);
    })();
    return () => { off = true; };
  }, [pid]); // eslint-disable-line react-hooks/exhaustive-deps
  const link = code ? appUrl(`/unirse/${code}`) : '';
  useEffect(() => { if (link) QRCode.toDataURL(link, { margin: 1, width: 360, color: { dark: '#111113', light: '#ffffff' } }).then(setQr).catch(() => setQr('')); }, [link]);
  const ms = membersOf(pid).filter((m) => m.role !== 'docente');
  const want = expected || p?.expected_members || 0;
  const missing = Math.max(0, want - ms.length);
  const waText = `Únanse a «${p?.name || 'nuestro trabajo'}» en Reparte3. Ahí repartimos las tareas en partes iguales y nos llegan los avisos: ${link}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2200); }
    catch (e) { linkRef.current?.select(); toast('Selecciona el enlace y cópialo.', { icon: 'info' }); }
  };
  return (
    <div className="anim-enter flex flex-col gap-6">
      <div>
        <h3 className="text-[20px] font-semibold tracking-[-0.02em]">Que entre tu grupo</h3>
        <p className="mt-1 text-[13.5px] text-fg-2">Comparte el enlace o muestra el código. Cada quien entra desde su celular.</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-[168px_minmax(0,1fr)] sm:items-start">
        <div className="mx-auto grid h-[168px] w-[168px] place-items-center rounded-xl bg-white p-2 ring-1 ring-inset ring-line">
          {qr ? <img src={qr} alt="Código QR del enlace de invitación" className="h-full w-full" /> : <Loader2 className="h-5 w-5 animate-spin text-fg-3" />}
        </div>
        <div className="flex min-w-0 flex-col gap-2.5">
          <label htmlFor="lb-link" className="sr-only">Enlace de invitación</label>
          <input id="lb-link" ref={linkRef} readOnly value={link || 'Creando enlace…'} onFocus={(e) => e.target.select()} className="field h-10 min-w-0 bg-hov font-mono text-[12px] text-fg-2" />
          <Btn kind="primary" size="lg" className="w-full" onClick={copy} disabled={!link}>
            {copied ? <><Check className="sw-bold pop h-5 w-5" />Enlace copiado</> : <><Copy className="h-5 w-5" />Copiar enlace</>}
          </Btn>
          <a href={`https://wa.me/?text=${encodeURIComponent(waText)}`} target="_blank" rel="noopener noreferrer"
             className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl text-[13.5px] font-medium text-fg-2 ring-1 ring-inset ring-line transition-all hover:bg-hov hover:text-fg ${link ? '' : 'pointer-events-none opacity-40'}`}>
            <MessageCircle className="h-4 w-4" />Enviar por WhatsApp<ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
      <section aria-live="polite" className="rounded-xl bg-card p-4 ring-1 ring-inset ring-line">
        <p className="flex items-center justify-between text-[13px]">
          <span className="font-medium">{want ? `${ms.length} de ${want} ya están` : `${ms.length} en el grupo`}</span>
          {missing > 0 ? <Chip tone="amber">Faltan {missing}</Chip> : want ? <Chip tone="accent"><Check className="h-3 w-3" />Están todos</Chip> : null}
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {ms.map((m) => <li key={m.user_id} className="anim-enter flex items-center gap-2 rounded-full bg-hov py-1 pl-1 pr-3 text-[13px]"><Avatar name={m.profile?.display_name} size="sm" ring="hov" />{m.profile?.display_name}</li>)}
          {Array.from({ length: missing }, (_, i) => <li key={`m${i}`} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[13px] text-fg-3 ring-1 ring-inset ring-dashed ring-line"><Avatar pending size="sm" ring="card" />Esperando…</li>)}
        </ul>
      </section>
      <p className="flex items-start gap-2 rounded-lg bg-hov px-3 py-2.5 text-[12.5px] leading-5 text-fg-2">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />No hace falta esperar a todos. Lo que les toque a quienes falten queda reservado y se les asigna solo cuando entren.
      </p>
    </div>
  );
}

/** Paso 2: consigna → plan con IA (gratis, con la cuenta de la persona) o por formato. */
const AI_NAMES = { claude: 'Claude', groq: 'Groq', gemini: 'Gemini' };
const AI_STEPS = ['Leyendo la consigna', 'Separando requisitos y sugerencias', 'Estimando horas y fases', 'Revisando fechas y dependencias'];

function PlanStep({ pid, brief, setBrief, rows, setRows, result, setResult }) {
  const { project } = useApp();
  const p = project(pid);
  const [phase, setPhase] = useState(brief ? 'ready' : 'empty');
  const [mode, setMode] = useState(rows.length ? null : 'choose');
  const [ai, setAi] = useState({ state: 'idle', error: '', step: 0 });
  const [error, setError] = useState('');
  const [showWarn, setShowWarn] = useState(false);
  const [openLine, setOpenLine] = useState(null);
  const lines = useMemo(() => String(brief?.text || '').split('\n'), [brief]);

  // Mientras la IA trabaja, el mensaje avanza por etapas para que se entienda qué está pasando.
  useEffect(() => {
    if (ai.state !== 'running') return undefined;
    const t = setInterval(() => setAi((a) => (a.state === 'running' ? { ...a, step: Math.min(a.step + 1, AI_STEPS.length - 1) } : a)), 4500);
    return () => clearInterval(t);
  }, [ai.state]);

  const read = async (f) => {
    setError(''); setPhase('reading');
    try {
      const out = await extractText(f);
      setBrief({ text: out.text, fileName: out.fileName, warnings: out.warnings, fresh: true });
      setPhase('ready'); setRows([]); setResult(null); setMode('choose'); setAi({ state: 'idle', error: '', step: 0 });
    } catch (e) { setError(e.message); setPhase('empty'); }
  };
  const runAI = async () => {
    setError(''); setMode('ia'); setAi({ state: 'running', error: '', step: 0 });
    try {
      const out = await planWithAI(pid, brief.text);
      const v = validatePlan(out.plan, brief.text, { defaultYear: Number((p?.due_date || todayISO()).slice(0, 4)) });
      if (!v.ok) throw Object.assign(new Error(v.errors.join(' ') || 'La IA no propuso tareas.'), { code: 'invalid' });
      setRows(v.tasks.map((t) => toRow(t, 'ia')));
      setResult({ warnings: v.warnings, questions: v.questions, source: 'ia', seconds: Math.round((out.ms || 0) / 1000), provider: AI_NAMES[out.provider] || '' });
      setAi({ state: 'idle', error: '', step: 0 }); setMode(null);
    } catch (e) { setAi({ state: 'error', error: e.message, step: 0 }); }
  };
  const useFormat = () => {
    const found = analyzeBrief(brief.text, Number((p?.due_date || todayISO()).slice(0, 4)));
    setRows(fromFormat(found).map((t) => toRow(t, 'formato')));
    setResult({ warnings: [], questions: [], source: 'formato' });
    setMode(null);
    if (!found.length) setError('No encontramos tareas con viñetas o verbos de entrega. Usa la IA o escríbelas a mano.');
  };
  const upd = (key, patch) => setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const chosen = rows.filter((r) => r.on && r.title.trim().length >= 2);

  return (
    <div className="anim-enter flex flex-col gap-5">
      <div>
        <h3 className="text-[20px] font-semibold tracking-[-0.02em]">Sube la consigna y arma el plan</h3>
        <p className="mt-1 text-[13.5px] text-fg-2">El archivo se lee en tu dispositivo. Después eliges cómo convertirlo en tareas.</p>
      </div>
      {error && <p role="alert" className="flex items-start gap-2 rounded-lg bg-orange/10 px-3 py-2.5 text-[13px] text-orange ring-1 ring-inset ring-orange/25"><Info className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}

      {phase === 'empty' && <>
        <DropZone id="wz-file" multiple={false} accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  label="Arrastra la consigna aquí" hint="PDF, Word (.docx) o texto, hasta 5 MB." onFiles={(fs) => read(fs[0])} />
        <button type="button" onClick={() => { setPhase('manual'); setRows([toRow({ title: '', hours: 2, phase: 'desarrollo', kind: 'requisito', lines: [], depends: [] }, 'manual')]); setMode(null); setResult({ warnings: [], questions: [], source: 'manual' }); }}
                className="self-center text-[13px] font-medium text-fg-2 underline decoration-fg-3/50 underline-offset-4 hover:text-fg">No tengo consigna: escribir las tareas a mano</button>
      </>}
      {phase === 'reading' && <p className="flex items-center gap-2 text-[13.5px]"><Loader2 className="h-4 w-4 animate-spin text-accent" />Leyendo el documento…</p>}

      {phase === 'ready' && brief && <>
        <p className="flex flex-wrap items-center gap-2 text-[13px]">
          <FileText className="h-4 w-4 text-fg-3" /><span className="truncate font-medium">{brief.fileName || 'Consigna del proyecto'}</span>
          <span className="text-fg-2">{lines.length} líneas</span>
          <button type="button" onClick={() => { setPhase('empty'); setBrief(null); setRows([]); setResult(null); }} className="ml-auto text-[12.5px] text-fg-2 underline underline-offset-4 hover:text-fg">Cambiar archivo</button>
        </p>
        {brief.warnings?.map((w) => <p key={w} className="text-[12.5px] text-orange">{w}</p>)}

        {mode === 'choose' && (
          <div className="anim-enter flex flex-col gap-3">
            <button type="button" onClick={runAI} id="wz-ai-run"
                    className="group flex items-center gap-4 rounded-xl bg-accent/[.06] p-4 text-left ring-1 ring-inset ring-accent/40 transition-all hover:bg-accent/[.1]">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-on-accent shadow-glow"><Sparkles className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">Planificar con IA</span>
                <span className="mt-0.5 block text-[12.5px] leading-5 text-fg-2">La IA lee la consigna y la divide en tareas parejas para tu grupo, con fases, horas y checkpoints. Tú revisas antes de repartir.</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-accent transition-transform group-hover:translate-x-0.5" />
            </button>
            <button type="button" onClick={useFormat} className="flex items-center gap-2 self-start rounded-lg px-2 py-1.5 text-[13px] font-medium text-fg-2 hover:bg-hov hover:text-fg">
              <ScanText className="h-4 w-4" />O usa la detección rápida, sin IA
            </button>
            <p className="text-[11.5px] leading-4 text-fg-3">La consigna se envía a un servicio de IA (Claude, Groq o Gemini) solo para analizarla. No incluyas datos personales en el documento.</p>
          </div>
        )}

        {mode === 'ia' && ai.state === 'running' && (
          <div className="anim-enter grid gap-5 rounded-xl bg-card p-5 ring-1 ring-inset ring-line sm:grid-cols-[120px_minmax(0,1fr)] sm:items-center" aria-live="polite">
            <div className="relative mx-auto h-36 w-[120px] overflow-hidden rounded-lg bg-canvas p-3 shadow-xs ring-1 ring-inset ring-line">
              {[80, 95, 60, 0, 90, 70, 85, 0, 75, 92].map((w, i) => (w
                ? <span key={i} className={`mb-2 block h-1.5 rounded-full transition-colors duration-700 ${ai.step >= 1 && [1, 4, 8].includes(i) ? 'bg-accent/50' : ai.step >= 2 && [2, 6, 9].includes(i) ? 'bg-violet/40' : 'bg-fg/10'}`} style={{ width: `${w}%` }} />
                : <span key={i} className="mb-2 block h-1.5" />))}
              <span aria-hidden="true" className="scan pointer-events-none absolute inset-x-0 top-0 h-12" style={{ background: 'linear-gradient(to bottom, transparent, rgb(var(--accent) / .22), transparent)' }} />
            </div>
            <ol className="flex flex-col gap-2.5">
              {AI_STEPS.map((s, i) => (
                <li key={s} className={`flex items-center gap-3 text-[13.5px] ${ai.step > i ? 'text-fg' : ai.step === i ? 'font-medium text-fg' : 'text-fg-3'}`}>
                  <span className="grid h-5 w-5 place-items-center">{ai.step > i ? <Check className="sw-bold pop h-4 w-4" /> : ai.step === i ? <Loader2 className="h-4 w-4 animate-spin text-accent" /> : <span className="h-1.5 w-1.5 rounded-full bg-fg-3" />}</span>{s}
                </li>
              ))}
              <li className="pl-8 text-[12px] text-fg-2">Suele tardar entre 20 y 60 segundos.</li>
            </ol>
          </div>
        )}

        {mode === 'ia' && ai.state === 'error' && (
          <div role="alert" className="anim-enter rounded-xl bg-orange/[.07] p-4 ring-1 ring-inset ring-orange/25">
            <p className="flex items-start gap-2 text-[13.5px] text-fg"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange" />{ai.error}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Btn kind="primary" size="sm" onClick={useFormat}><ScanText className="h-4 w-4" />Usar detección rápida</Btn>
              <Btn kind="secondary" size="sm" onClick={runAI}>Reintentar con IA</Btn>
            </div>
          </div>
        )}
      </>}

      {rows.length > 0 && !mode && (
        <div className="anim-enter">
          <p className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[13px]">
            <span className="flex items-center gap-2 font-medium">{rows.length} tareas propuestas
              <Chip tone={result?.source === 'ia' ? 'accent' : 'neutral'}>{result?.source === 'ia' ? <><Sparkles className="h-3 w-3" />Propuesto con IA{result.provider ? ` (${result.provider})` : ''}{result.seconds ? ` en ${result.seconds} s` : ''}</> : result?.source === 'formato' ? 'Detectado por formato' : 'Escrito a mano'}</Chip>
            </span>
            <span className="text-fg-2">{chosen.length} quedan · <Mono>{chosen.reduce((s, r) => s + (Number(r.hours) || 2), 0)} h</Mono></span>
          </p>
          {result?.warnings?.length > 0 && (
            <div className="mb-2 rounded-lg bg-amber/10 px-3 py-2 text-[12.5px] text-amber ring-1 ring-inset ring-amber/25">
              <button type="button" onClick={() => setShowWarn(!showWarn)} className="flex w-full items-center gap-2 text-left font-medium"><AlertTriangle className="h-3.5 w-3.5" />Revisamos la respuesta: {result.warnings.length} ajustes<ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform ${showWarn ? 'rotate-180' : ''}`} /></button>
              {showWarn && <ul className="mt-1.5 list-disc pl-5 leading-5">{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
            </div>
          )}
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-xl ring-1 ring-inset ring-line">
            {rows.map((r, i) => (
              <li key={r.key} className="bg-card px-3 py-2">
                <div className="flex items-center gap-2">
                  <input type="checkbox" aria-label={`Incluir tarea ${i + 1}`} checked={r.on} onChange={() => upd(r.key, { on: !r.on })} className="h-4 w-4 shrink-0 rounded accent-[rgb(var(--accent))]" />
                  <label htmlFor={`wz-t-${r.key}`} className="sr-only">Tarea {i + 1}</label>
                  <input id={`wz-t-${r.key}`} value={r.title} maxLength={140} placeholder="Escribe la tarea" onChange={(e) => upd(r.key, { title: e.target.value })}
                         className={`min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-1.5 text-[13.5px] outline-none focus:bg-hov ${r.on ? '' : 'text-fg-3 line-through'}`} />
                  <label htmlFor={`wz-h-${r.key}`} className="sr-only">Horas</label>
                  <input id={`wz-h-${r.key}`} type="number" min="0.5" max="40" step="0.5" value={r.hours} onChange={(e) => upd(r.key, { hours: Number(e.target.value) })}
                         className="w-14 rounded-md bg-hov px-1.5 py-1 text-right font-mono text-[12px] outline-none focus:ring-1 focus:ring-accent/60" />
                  <Mono className="text-fg-3">h</Mono>
                  <button type="button" aria-label="Quitar" onClick={() => setRows(rows.filter((x) => x.key !== r.key))} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-fg-3 hover:bg-hov hover:text-red"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                <div className="ml-6 mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-fg-2">
                  <button type="button" onClick={() => upd(r.key, { kind: r.kind === 'sugerencia' ? 'requisito' : 'sugerencia' })} title="Cambiar entre requisito y sugerencia"
                          className={`rounded px-1.5 py-0.5 ring-1 ring-inset ${r.kind === 'sugerencia' ? 'text-violet ring-violet/30' : 'ring-line'}`}>{KINDS[r.kind] || 'Requisito'}</button>
                  <label htmlFor={`wz-ph-${r.key}`} className="sr-only">Fase</label>
                  <select id={`wz-ph-${r.key}`} value={r.phase} onChange={(e) => upd(r.key, { phase: e.target.value })} className="rounded bg-transparent px-1 py-0.5 ring-1 ring-inset ring-line">
                    {Object.entries(PHASES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  {r.due && <span>Fecha en la consigna: {fmtShort(r.due)}</span>}
                  {r.lines?.length > 0 && <button type="button" onClick={() => setOpenLine(openLine === r.key ? null : r.key)} className="underline underline-offset-2 hover:text-fg">ver origen (línea {r.lines.join(', ')})</button>}
                  {r.ambiguity && <span className="text-amber">Ambiguo: {r.ambiguity}</span>}
                </div>
                {openLine === r.key && (
                  <blockquote className="ml-6 mt-1.5 rounded-md bg-hov px-2.5 py-1.5 text-[12px] leading-5 text-fg-2">
                    {r.lines.slice(0, 3).map((n) => <span key={n} className="block"><Mono className="mr-1.5 text-fg-3">{n}</Mono>{lines[n - 1]}</span>)}
                    {r.quote && <span className="mt-1 block italic">«{r.quote}»</span>}
                  </blockquote>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setRows([...rows, toRow({ title: '', hours: 2, phase: 'desarrollo', kind: 'requisito', lines: [], depends: [] }, 'manual')])} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-medium text-fg-2 hover:bg-hov hover:text-fg"><Plus className="h-4 w-4" />Añadir tarea</button>
            {brief && <button type="button" onClick={() => setMode('choose')} className="ml-auto text-[12.5px] text-fg-2 underline underline-offset-4 hover:text-fg">Volver a generar</button>}
          </div>
          {result?.questions?.length > 0 && (
            <div className="mt-3 rounded-lg bg-hov px-3 py-2.5 text-[12.5px] leading-5">
              <p className="font-medium">Preguntas para el docente</p>
              <ul className="mt-1 list-disc pl-5 text-fg-2">{result.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Reparto y checkpoints del plan: lo mismo que se ve en pantalla es lo que se guarda al confirmar. */
function useSplit(pid, rows, round) {
  const { project, membersOf, tasks } = useApp();
  const p = pid ? project(pid) : null;
  const team = pid ? membersOf(pid).filter((m) => m.role !== 'docente') : [];
  const plan = rows.filter((r) => r.on && r.title.trim().length >= 2).map((r) => ({ ...r, id: r.key }));
  const fixed = {};
  tasks.filter((t) => t.project_id === pid && t.assignee && t.status !== 'lista').forEach((t) => { fixed[t.assignee] = (fixed[t.assignee] || 0) + (Number(t.hours) || 2); });
  const planKey = JSON.stringify(plan.map((x) => [x.id, x.hours, x.phase, x.due]));
  const teamKey = team.map((m) => m.user_id).join();
  const dist = useMemo(() => distribute(plan, team.map((m) => m.user_id), { expected: p?.expected_members || 0, fixed, round }), [planKey, teamKey, p?.expected_members, round, JSON.stringify(fixed)]); // eslint-disable-line react-hooks/exhaustive-deps
  const cps = useMemo(() => buildCheckpoints(plan, { today: todayISO(), due: p?.due_date }), [planKey, p?.due_date]); // eslint-disable-line react-hooks/exhaustive-deps
  return { p, team, plan, fixed, dist, cps };
}
const ownerOf = (dist, overrides, key) => (key in overrides ? overrides[key] : dist.assign[key] === null ? 'reserva' : dist.assign[key]);

/** Paso 3: reparto igualitario, reserva para quienes faltan y checkpoints. */
function SplitStep({ split, overrides, setOverrides }) {
  const { uid } = useApp();
  const { team, plan, fixed, dist, cps } = split;
  const owner = (key) => ownerOf(dist, overrides, key);
  // Cargas con los ajustes manuales aplicados.
  const loads = Object.fromEntries(dist.slots.map((s) => [s.id, Number(fixed[s.id]) || 0]));
  const reservedSlots = dist.slots.filter((s) => s.reserve);
  let reservedHours = 0;
  plan.forEach((t) => { const o = owner(t.id); if (o === 'reserva') reservedHours += Number(t.hours) || 2; else loads[o] = (loads[o] || 0) + (Number(t.hours) || 2); });
  reservedSlots.forEach((s) => { loads[s.id] = reservedHours / reservedSlots.length; });
  const max = Math.max(1, ...Object.values(loads));
  const target = dist.target;
  const name = (id) => (id === uid ? 'Tú' : team.find((m) => m.user_id === id)?.profile?.display_name || '—');
  const inBand = (l) => !target || Math.abs(l - target) <= target * TOLERANCE + 1e-9;

  return (
    <div className="anim-enter flex flex-col gap-5">
      <div>
        <h3 className="text-[20px] font-semibold tracking-[-0.02em]">Reparto en partes iguales</h3>
        <p className="mt-1 text-[13.5px] text-fg-2">Cada parte apunta a <Mono className="text-[12.5px] text-fg">{target.toFixed(1)} h</Mono> (±15 %). Las más largas van primero a quien tiene menos carga.</p>
      </div>
      <section className="rounded-xl bg-card p-4 ring-1 ring-inset ring-line" aria-label="Carga por persona">
        <ul className="flex flex-col gap-3">
          {dist.slots.filter((s) => !s.reserve).map((s) => (
            <li key={s.id} className="grid grid-cols-[minmax(0,130px)_minmax(0,1fr)_56px] items-center gap-3 text-[13px]">
              <span className="flex min-w-0 items-center gap-2"><Avatar name={name(s.id)} me={s.id === uid} size="sm" ring="card" /><span className="truncate">{name(s.id)}</span></span>
              <span className="relative h-2.5 overflow-hidden rounded-full bg-hov2"><span className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ${inBand(loads[s.id]) ? 'bg-fg' : 'bg-amber'}`} style={{ width: `${(loads[s.id] / max) * 100}%` }} /></span>
              <Mono className="text-right">{loads[s.id].toFixed(1)} h</Mono>
            </li>
          ))}
          {reservedSlots.length > 0 && (
            <li className="grid grid-cols-[minmax(0,130px)_minmax(0,1fr)_56px] items-center gap-3 text-[13px]">
              <span className="flex min-w-0 items-center gap-2 text-accent"><Avatar pending size="sm" ring="card" /><span className="truncate">Reservado ({reservedSlots.length})</span></span>
              <span className="relative h-2.5 overflow-hidden rounded-full bg-hov2"><span className="absolute inset-y-0 left-0 rounded-full border border-dashed border-accent bg-accent/20" style={{ width: `${(reservedHours / reservedSlots.length / max) * 100}%` }} /></span>
              <Mono className="text-right">{reservedHours.toFixed(1)} h</Mono>
            </li>
          )}
        </ul>
        {reservedSlots.length > 0 && <p className="mt-3 text-[12.5px] text-fg-2">Faltan {reservedSlots.length}: su parte queda reservada y se les asigna sola cuando entren con el enlace.</p>}
        {!dist.balanced && <p className="mt-3 flex items-start gap-2 text-[12.5px] text-amber"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />No se pudo igualar dentro de ±15 %: hay tareas muy grandes. Divide alguna en el paso anterior.</p>}
      </section>

      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-xl ring-1 ring-inset ring-line">
        {plan.slice().sort((a, b) => (Number(b.hours) || 2) - (Number(a.hours) || 2)).map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-card px-4 py-2.5">
            <span className="min-w-0 basis-full text-[13.5px] leading-5 sm:basis-0 sm:flex-1 sm:truncate">{t.title}</span>
            <Mono className="text-fg-2">{Number(t.hours) || 2} h</Mono>
            <SelectField id={`sp-${t.id}`} value={owner(t.id) || ''} onChange={(v) => setOverrides({ ...overrides, [t.id]: v || null })} className="min-w-0 flex-1 sm:w-44 sm:flex-none [&_select]:h-8 [&_select]:text-[13px]" aria-label={`Responsable de ${t.title}`}>
              {team.map((m) => <option key={m.user_id} value={m.user_id}>{m.user_id === uid ? 'Yo' : m.profile?.display_name}</option>)}
              {reservedSlots.length > 0 && <option value="reserva">Reservada</option>}
              <option value="">Sin asignar</option>
            </SelectField>
          </li>
        ))}
      </ul>

      <section className="rounded-xl bg-card p-4 ring-1 ring-inset ring-line" aria-label="Checkpoints">
        <h4 className="flex items-center gap-2 text-[13.5px] font-semibold"><Flag className="h-4 w-4 text-fg-3" />Checkpoints</h4>
        {cps.checkpoints.length ? (
          <ol className="mt-3 flex flex-col gap-2">
            {cps.checkpoints.map((c) => (
              <li key={c.key} className="flex items-center gap-3 text-[13px]">
                <Mono className="w-24 shrink-0 text-fg-2">{fmtShort(c.due_date)}</Mono>
                <span className="flex-1">{c.title}</span>
                <Mono className="text-fg-3">{plan.filter((t) => cps.taskCheckpoint[t.id] === c.key).length} tareas</Mono>
              </li>
            ))}
          </ol>
        ) : <p className="mt-2 text-[12.5px] text-fg-2">Agrega la fecha de entrega del proyecto (Ajustes) para crear checkpoints automáticamente.</p>}
        <p className="mt-3 text-[12px] text-fg-2">Se planifican hacia atrás desde la entrega, con un colchón para integrar y revisar. Cada checkpoint marca al grupo «en ruta», «en riesgo» o «atrasado».</p>
      </section>
    </div>
  );
}

export default function Wizard({ open, onClose, projectId = null }) {
  const { createProject, savePlan, updateProject, project } = useApp();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [course, setCourse] = useState('');
  const [due, setDue] = useState('');
  const [expected, setExpected] = useState('');
  const [pid, setPid] = useState(null);
  const [brief, setBrief] = useState(null);
  const [rows, setRows] = useState([]);
  const [result, setResult] = useState(null);
  const [round, setRound] = useState(0);
  const [overrides, setOverrides] = useState({});
  const [busy, setBusy] = useState(false);
  const nameRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const p = projectId ? project(projectId) : null;
    setStep(p ? 2 : 1); setName(''); setCourse(''); setDue(''); setExpected(''); setPid(p ? p.id : null);
    setBrief(p?.brief_text ? { text: p.brief_text, fileName: p.brief_file, warnings: [], fresh: false } : null);
    setRows([]); setResult(null); setRound(0); setOverrides({}); setBusy(false);
    const t = setTimeout(() => nameRef.current?.focus(), 80);
    document.body.style.overflow = 'hidden';
    return () => { clearTimeout(t); document.body.style.overflow = ''; };
  }, [open, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const createGroup = async (e) => {
    e?.preventDefault();
    if (name.trim().length < 2) return;
    setBusy(true);
    const id = await createProject({ name: name.trim(), course: course.trim(), due: due || null, expected: expected ? Number(expected) : null });
    setBusy(false);
    if (id) setPid(id);
  };
  const chosen = rows.filter((r) => r.on && r.title.trim().length >= 2);
  const split = useSplit(pid, rows, round);
  const p = split.p;

  const confirm = async () => {
    setBusy(true);
    if (brief?.fresh) await updateProject(pid, { brief_text: brief.text.slice(0, 100000), brief_file: (brief.fileName || '').slice(0, 200) || null });
    const { plan, dist, cps: { checkpoints, taskCheckpoint, taskDue } } = split;
    const payload = plan.map((t) => {
      const o = ownerOf(dist, overrides, t.key);
      return {
        key: t.key, title: t.title.trim(), description: t.description || '', hours: Number(t.hours) || null,
        due_date: taskDue[t.key] || t.due || null, source_line: t.line || null, source_quote: t.quote || null, done_criteria: t.done || null,
        kind: t.kind || null, phase: t.phase || null, origin: t.origin || 'manual', checkpoint: taskCheckpoint[t.key] || null,
        assignee: o && o !== 'reserva' ? o : null, reserved: o === 'reserva', depends: (t.depends || []).map((d) => plan.find((x) => x.id === d || x.key === d)?.key).filter(Boolean),
      };
    });
    const n = await savePlan(pid, checkpoints, payload);
    setBusy(false);
    if (n) { onClose(); go(`/p/${pid}`); }
  };
  const close = () => { onClose(); if (pid && !projectId) go(`/p/${pid}`); };

  if (!open) return null;
  return (
    <div className="safe-modal fixed inset-0 z-[60] grid place-items-center">
      <button type="button" tabIndex={-1} aria-label="Cerrar" onClick={close} className="absolute inset-0 bg-overlay backdrop-blur-[2px]" />
      <div role="dialog" aria-modal="true" aria-labelledby="wz-title" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}
           className="safe-modal-box anim-scale relative flex w-full max-w-[660px] flex-col overflow-hidden rounded-2xl bg-canvas shadow-pop ring-1 ring-inset ring-line">
        <header className="flex shrink-0 flex-col gap-5 border-b border-line px-6 pb-5 pt-5">
          <div className="flex items-center justify-between">
            <h2 id="wz-title" className="text-[15px] font-semibold">{projectId ? `Plan de «${p?.name || ''}»` : 'Nuevo proyecto'}</h2>
            <button type="button" onClick={close} aria-label="Cerrar" className="grid h-8 w-8 place-items-center rounded-lg text-fg-2 hover:bg-hov hover:text-fg"><X className="h-4 w-4" /></button>
          </div>
          <Stepper step={step} />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-7">
          {step === 1 && !pid && (
            <form id="wz-1" className="anim-enter flex flex-col gap-5" onSubmit={createGroup}>
              <div>
                <h3 className="text-[20px] font-semibold tracking-[-0.02em]">¿Cómo se llama el trabajo?</h3>
                <p className="mt-1 text-[13.5px] text-fg-2">Primero armamos el grupo. Tú quedas como coordinador.</p>
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
              <div className="flex flex-col gap-1.5">
                <span id="wz-exp-l" className="label">¿Cuántos son en el grupo, contándote? <span className="font-normal text-fg-2">(opcional)</span></span>
                <div role="radiogroup" aria-labelledby="wz-exp-l" className="flex flex-wrap gap-2">
                  {['2', '3', '4', '5', '6'].map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={expected === n} onClick={() => setExpected(expected === n ? '' : n)}
                            className={`h-9 w-11 rounded-lg text-[14px] font-medium ring-1 ring-inset transition-all ${expected === n ? 'bg-accent text-on-accent ring-accent' : 'bg-card ring-line hover:bg-hov'}`}>{n}</button>
                  ))}
                  <label htmlFor="wz-exp" className="sr-only">Otro número</label>
                  <input id="wz-exp" type="number" min="1" max="15" value={['2', '3', '4', '5', '6'].includes(expected) ? '' : expected} onChange={(e) => setExpected(e.target.value)} placeholder="Otro" className="field h-9 w-20" />
                </div>
                <p className="text-[12px] text-fg-2">Si lo indicas, la parte de quienes aún no entran queda reservada para ellos.</p>
              </div>
            </form>
          )}
          {step === 1 && pid && <Lobby pid={pid} expected={expected ? Number(expected) : 0} />}
          {step === 2 && pid && <PlanStep pid={pid} brief={brief} setBrief={setBrief} rows={rows} setRows={setRows} result={result} setResult={setResult} />}
          {step === 3 && pid && <SplitStep split={split} overrides={overrides} setOverrides={setOverrides} />}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line bg-sunk px-6 py-4">
          {step === 1 && !pid && <><Btn onClick={onClose}>Cancelar</Btn><Btn kind="primary" type="submit" form="wz-1" loading={busy} disabled={name.trim().length < 2}><Users className="h-4 w-4" />Crear grupo e invitar</Btn></>}
          {step === 1 && pid && <><Btn onClick={close}>Terminar después</Btn><Btn kind="primary" onClick={() => setStep(2)}>Continuar: la consigna<ArrowRight className="h-4 w-4" /></Btn></>}
          {step === 2 && <>
            <Btn onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4" />Grupo</Btn>
            <Btn kind="primary" disabled={!chosen.length} onClick={() => { setOverrides({}); setStep(3); }}>Repartir {chosen.length || ''} tareas<ArrowRight className="h-4 w-4" /></Btn>
          </>}
          {step === 3 && <>
            <Btn onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4" />Plan</Btn>
            <span className="flex flex-wrap gap-2">
              <Btn onClick={() => { setOverrides({}); setRound(round + 1); }}><Shuffle className="h-4 w-4" />Otra propuesta</Btn>
              <Btn kind="primary" loading={busy} onClick={confirm}><Check className="h-4 w-4" />Confirmar y repartir</Btn>
            </span>
          </>}
        </footer>
      </div>
    </div>
  );
}
