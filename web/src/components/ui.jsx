import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Loader2, X, ChevronDown, Check } from 'lucide-react';
import { STATUS, initials } from '../lib/format';

export const Dot = ({ st, className = '', label }) => <>
  <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 rounded-full ${STATUS[st].dot} ${className}`} />
  {label && <span className="sr-only">{STATUS[st].label}: </span>}
</>;

export function Badge({ st, children, dot, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[12px] font-medium leading-5 ring-1 ring-inset ${STATUS[st]?.badge || STATUS.todo.badge} ${className}`}>
      {dot && <Dot st={st} className="h-1.5 w-1.5" />}{children || STATUS[st]?.label}
    </span>
  );
}
export function Chip({ children, tone = 'neutral', className = '' }) {
  const t = { neutral: 'bg-hov text-fg-2 ring-line', accent: 'bg-accent/10 text-accent-ink ring-accent/25', red: 'bg-red/10 text-red ring-red/25', violet: 'bg-hov2 text-fg ring-line', amber: 'bg-amber/10 text-amber ring-amber/30' }[tone];
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[12px] font-medium leading-5 ring-1 ring-inset ${t} ${className}`}>{children}</span>;
}
export const Mono = ({ children, className = '' }) => <span className={`font-mono text-[11.5px] tabular-nums ${className}`}>{children}</span>;

/**
 * La regla de los 4 tiempos (Armar · Repartir · Avanzar · Cerrar): la firma de Reparte3.
 * `stages` viene de projectStages(). Completa: cabecera del proyecto (interactiva). Compacta: filas de Inicio.
 */
export function StageRail({ stages, selected, onSelect, compact = false, label = 'Tiempos del proyecto' }) {
  const word = { done: 'hecho', current: 'actual', open: 'con pasos pendientes', todo: 'por empezar' };
  if (compact) {
    const cur = stages.find((s) => s.state === 'current');
    return (
      <span className="flex items-center gap-3" role="img" aria-label={`${label}: ${cur ? `tiempo ${cur.n}, ${cur.label}` : 'completo'}`}>
        <span className="rail-compact" aria-hidden="true">{stages.map((s) => <span key={s.key} className={`rail-seg rail-${s.state}`} />)}</span>
        <span className="whitespace-nowrap text-[12px] text-fg-2">{cur ? <><Mono className="text-[12px] text-accent-ink">{cur.n}</Mono> {cur.label}</> : 'Completo'}</span>
      </span>
    );
  }
  return (
    <nav aria-label={label}>
      <ol className="rail">
        {stages.map((s, i) => {
          const sel = selected === s.n;
          const Tag = onSelect ? 'button' : 'div';
          return (
            <li key={s.key} className={`rail-step rail-${s.state} ${sel ? 'rail-sel' : ''}`} style={{ '--i': i }}>
              <Tag {...(onSelect ? { type: 'button', onClick: () => onSelect(s.n), 'aria-current': sel ? 'true' : undefined, 'aria-controls': 'stage-panel' } : { role: 'group' })}
                   aria-label={`${s.n}. ${s.label}: ${word[s.state]}. ${s.metric}`} className="rail-hit">
                <span className="rail-seg" aria-hidden="true" />
                <span className="rail-head">
                  <span className="rail-n" aria-hidden="true">{s.state === 'done' ? <Check className="sw-bold h-[0.8em] w-[0.8em]" /> : s.n}</span>
                  <span className="min-w-0">
                    <span className="rail-label">{s.label}{s.state === 'current' && <span className="rail-now" aria-hidden="true">ahora</span>}{s.state === 'open' && <span className="rail-flag" aria-hidden="true" />}</span>
                    <span className="rail-metric">{s.metric}</span>
                  </span>
                </span>
              </Tag>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function Avatar({ name = '?', me, size = 'md', ring = 'canvas', pending, title }) {
  const sz = { lg: 'h-9 w-9 text-[12.5px]', md: 'h-7 w-7 text-[11px]', sm: 'h-6 w-6 text-[10px]', xl: 'h-12 w-12 text-[15px]' }[size];
  const look = pending ? 'border border-dashed border-fg-3 text-fg-3' : me ? 'bg-fg text-canvas' : 'bg-hov2 text-fg';
  return <span title={title || name} className={`inline-grid shrink-0 select-none place-items-center rounded-full font-semibold ${sz} ${look}`} style={{ boxShadow: `0 0 0 2px rgb(var(--${ring}))` }}>{pending ? '?' : initials(name)}</span>;
}
export function AvatarStack({ people, max = 4, ring = 'card' }) {
  return (
    <div className="group/av flex items-center" role="img" aria-label={`Equipo: ${people.map((p) => p.name).join(', ')}`}>
      {people.slice(0, max).map((p, i) => <span key={p.id} style={{ zIndex: max - i }} className={`relative transition-[margin] duration-200 ${i ? '-ml-1 group-hover/av:ml-0.5' : ''}`}><Avatar name={p.name} me={p.me} ring={ring} /></span>)}
      {people.length > max && <span className="relative -ml-1 inline-grid h-7 min-w-[28px] place-items-center rounded-full bg-hov2 px-1 font-mono text-[10.5px] text-fg-2" style={{ boxShadow: `0 0 0 2px rgb(var(--${ring}))` }}>+{people.length - max}</span>}
    </div>
  );
}

export function Btn({ kind = 'ghost', size = 'md', className = '', loading, children, type = 'button', ...rest }) {
  const k = {
    primary: 'bg-accent text-on-accent shadow-glow hover:-translate-y-px hover:brightness-110 active:translate-y-0',
    secondary: 'bg-card text-fg ring-1 ring-inset ring-line shadow-xs hover:bg-hov',
    ghost: 'text-fg-2 hover:bg-hov hover:text-fg',
    danger: 'bg-card text-red ring-1 ring-inset ring-red/30 hover:bg-red/10',
    dark: 'bg-fg text-canvas hover:opacity-90',
  }[kind];
  const s = { xs: 'h-7 px-2.5 text-[12.5px] rounded-md', sm: 'h-8 px-3 text-[13px] rounded-lg', md: 'h-9 px-3.5 text-[13.5px] rounded-lg', lg: 'h-11 px-5 text-[14px] rounded-xl', icon: 'h-8 w-8 rounded-lg' }[size];
  return (
    <button type={type} disabled={loading || rest.disabled} aria-busy={loading || undefined}
            className={`inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all duration-200 active:scale-[.98] disabled:pointer-events-none disabled:opacity-40 ${k} ${s} ${className}`} {...rest}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}{children}
    </button>
  );
}
export const IconBtn = ({ label, children, className = '', ...rest }) => (
  <button type="button" aria-label={label} title={label} className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-fg-2 transition-all duration-200 hover:bg-hov hover:text-fg disabled:opacity-30 ${className}`} {...rest}>{children}</button>
);

export function UnderlineTabs({ tabs, value, onChange, label, fill = false }) {
  const refs = useRef({});
  const bar = useRef(null);
  const [ind, setInd] = useState({ left: 0, width: 0, ready: false });
  const [edge, setEdge] = useState({ l: false, r: false });
  const shown = useRef(null);
  const sig = tabs.map((t) => `${t.id}${t.count ?? ''}`).join();
  // En pantallas angostas las pestañas se desplazan: un desvanecido en el borde avisa que hay más.
  const measure = () => {
    const b = bar.current; if (!b) return;
    const l = b.scrollLeft > 2, r = b.scrollLeft + b.clientWidth < b.scrollWidth - 2;
    setEdge((e) => (e.l === l && e.r === r ? e : { l, r }));
  };
  useLayoutEffect(() => {
    const up = () => {
      const el = refs.current[value];
      if (el) {
        setInd({ left: el.offsetLeft, width: el.offsetWidth, ready: true });
        const b = bar.current;
        if (b && shown.current !== value && (el.offsetLeft < b.scrollLeft || el.offsetLeft + el.offsetWidth > b.scrollLeft + b.clientWidth)) b.scrollTo({ left: el.offsetLeft - 24, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }
      if (el) shown.current = value;
      measure();
    };
    up();
    document.fonts?.ready.then(up);
    window.addEventListener('resize', up);
    return () => window.removeEventListener('resize', up);
  }, [value, sig]);
  const onKey = (e) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.id === value);
    const n = e.key === 'Home' ? tabs[0] : e.key === 'End' ? tabs[tabs.length - 1] : tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    onChange(n.id); refs.current[n.id]?.focus();
  };
  return (
    <div ref={bar} role="tablist" aria-label={label} onKeyDown={onKey} onScroll={measure}
         style={edge.l || edge.r ? { WebkitMaskImage: `linear-gradient(to right, ${edge.l ? 'transparent, #000 32px' : '#000'}, ${edge.r ? '#000 calc(100% - 40px), transparent' : '#000'})`, maskImage: `linear-gradient(to right, ${edge.l ? 'transparent, #000 32px' : '#000'}, ${edge.r ? '#000 calc(100% - 40px), transparent' : '#000'})` } : undefined}
         className="no-scrollbar relative flex gap-1 overflow-x-auto">
      {tabs.map((t) => {
        const sel = t.id === value; const I = t.icon;
        return (
          <button key={t.id} ref={(el) => { refs.current[t.id] = el; }} role="tab" id={`tab-${t.id}`} aria-controls="tabpanel" aria-selected={sel} tabIndex={sel ? 0 : -1} onClick={() => onChange(t.id)}
                  className={`relative flex h-10 shrink-0 items-center gap-2 px-3 text-[13.5px] transition-colors duration-200 focus-visible:outline-offset-[-2px] ${fill ? 'max-sm:h-14 max-sm:flex-1 max-sm:flex-col max-sm:justify-center max-sm:gap-1 max-sm:px-1 max-sm:text-[11.5px]' : ''} ${sel ? 'font-medium text-fg' : 'text-fg-2 hover:text-fg'}`}>
            {I && <I className={`h-4 w-4 ${sel ? 'text-fg' : 'text-fg-3'}`} />}{t.label}
            {t.count != null && t.count !== 0 && <Mono className={`${t.alert ? 'rounded bg-accent px-1 text-on-accent' : 'text-fg-3'} ${fill ? 'max-sm:absolute max-sm:right-1 max-sm:top-1.5' : ''}`}>{t.count}</Mono>}
          </button>
        );
      })}
      <span aria-hidden="true" className={`absolute bottom-0 h-[2px] rounded-full bg-fg ${ind.ready ? 'transition-all duration-300 ease-[cubic-bezier(.2,.8,.2,1)]' : ''}`} style={{ left: ind.left + 8, width: Math.max(0, ind.width - 16) }} />
    </div>
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-hov p-0.5 ring-1 ring-inset ring-line"
         onKeyDown={(e) => {
           if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
           e.preventDefault();
           const i = options.findIndex((o) => o.id === value);
           const n = options[(i + (['ArrowRight', 'ArrowDown'].includes(e.key) ? 1 : options.length - 1)) % options.length];
           onChange(n.id);
           requestAnimationFrame(() => e.currentTarget?.querySelector(`[data-id="${n.id}"]`)?.focus());
         }}>
      {options.map((o) => {
        const sel = o.id === value; const I = o.icon;
        return (
          <button key={o.id} type="button" role="radio" data-id={o.id} aria-checked={sel} tabIndex={sel ? 0 : -1} onClick={() => onChange(o.id)}
                  className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] transition-all duration-200 ${sel ? 'bg-card font-medium text-fg shadow-xs ring-1 ring-inset ring-line' : 'text-fg-2 hover:text-fg'}`}>
            {I && <I className="h-3.5 w-3.5" />}{o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Empty({ icon: I, title, text, children, className = '' }) {
  return (
    <div className={`anim-enter flex flex-col items-center rounded-xl border border-dashed border-line px-6 py-14 text-center ${className}`}>
      {I && <span className="grid h-11 w-11 place-items-center rounded-full bg-hov2 text-fg-2"><I className="h-5 w-5" /></span>}
      <h3 className="mt-4 text-[15px] font-semibold">{title}</h3>
      {text && <p className="mt-1.5 max-w-sm text-[13.5px] text-fg-2">{text}</p>}
      {children && <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

export function Spinner({ label = 'Cargando…' }) {
  return <div className="flex items-center justify-center gap-2 py-16 text-[13.5px] text-fg-2" role="status"><Loader2 className="h-4 w-4 animate-spin" />{label}</div>;
}

export function Toggle({ checked, onChange, label, desc, id, disabled }) {
  return (
    <label htmlFor={id} className={`flex items-start justify-between gap-4 py-3 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <span className="min-w-0"><span className="block text-[13.5px] font-medium">{label}</span>{desc && <span className="mt-0.5 block text-[12.5px] text-fg-2">{desc}</span>}</span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input id={id} type="checkbox" className="peer sr-only" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-5 w-9 rounded-full bg-hov2 ring-1 ring-inset ring-line transition-colors duration-200 peer-checked:bg-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent" />
        <span className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-xs transition-transform duration-200 peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

export function SelectField({ id, value, onChange, children, className = '', ...rest }) {
  return (
    <span className={`relative block ${className}`}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="field" {...rest}>{children}</select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" />
    </span>
  );
}

/** Modal centrado con foco inicial, Esc para cerrar y retorno del foco. */
export function Modal({ open, onClose, title, children, footer, size = 'md', labelledBy = 'modal-title' }) {
  const ref = useRef(null);
  const last = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    last.current = document.activeElement;
    const t = setTimeout(() => ref.current?.querySelector('input, textarea, select, button:not([data-close])')?.focus(), 60);
    document.body.style.overflow = 'hidden';
    return () => { clearTimeout(t); document.body.style.overflow = ''; last.current?.focus?.(); };
  }, [open]);
  if (!open) return null;
  const w = { sm: 'max-w-[420px]', md: 'max-w-[560px]', lg: 'max-w-[720px]' }[size];
  return (
    <div className="safe-modal fixed inset-0 z-[60] grid place-items-center">
      <button type="button" tabIndex={-1} aria-label="Cerrar" onClick={onClose} className="absolute inset-0 bg-overlay backdrop-blur-[2px]" />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelledBy}
           onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
           className={`safe-modal-box anim-scale relative flex w-full ${w} flex-col overflow-hidden rounded-2xl bg-canvas shadow-pop ring-1 ring-inset ring-line`}>
        {title && (
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-6 py-4">
            <h2 id={labelledBy} className="text-[15px] font-semibold">{title}</h2>
            <IconBtn label="Cerrar" data-close onClick={onClose}><X className="h-4 w-4" /></IconBtn>
          </header>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line bg-sunk px-4 py-3 sm:px-6 sm:py-3.5">{footer}</footer>}
      </div>
    </div>
  );
}

/** Pide un texto corto (motivo de bloqueo, cambios pedidos, etc.). */
export function PromptModal({ open, title, label, placeholder, confirm, onCancel, onConfirm, required = true, extra }) {
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setV(''); setBusy(false); } }, [open]);
  const submit = async (e) => { e.preventDefault(); if (required && !v.trim()) return; setBusy(true); await onConfirm(v.trim()); setBusy(false); };
  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm" labelledBy="prompt-title"
           footer={<><Btn onClick={onCancel}>Cancelar</Btn><Btn kind="primary" type="submit" form="prompt-form" loading={busy} disabled={required && !v.trim()}>{confirm}</Btn></>}>
      <form id="prompt-form" onSubmit={submit} className="flex flex-col gap-2">
        <label htmlFor="prompt-input" className="label">{label}</label>
        <textarea id="prompt-input" rows={3} maxLength={300} value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} className="field" />
        {extra}
      </form>
    </Modal>
  );
}
