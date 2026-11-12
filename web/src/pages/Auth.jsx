import { useState } from 'react';
import { MessageCircle, BellRing, Users, Sun, Moon, Loader2, Mail, ShieldCheck, ArrowLeft } from 'lucide-react';
import { supabase, errMsg } from '../lib/supabase';
import { useApp } from '../lib/store';
import { LEVELS, todayISO } from '../lib/format';
import { Btn, SelectField } from '../components/ui';

const redirect = () => `${window.location.origin}${window.location.pathname}`;
function ageOn(birth) {
  const [y, m, d] = birth.split('-').map(Number);
  const [ty, tm, td] = todayISO().split('-').map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}
const maxBirth = () => { const [y, m, d] = todayISO().split('-'); return `${Number(y) - 14}-${m}-${d}`; };

export function Splash() {
  return <div className="grid min-h-[100dvh] place-items-center bg-canvas"><div className="flex flex-col items-center gap-4"><img src="./icon.svg" alt="" className="h-10 w-10" /><Loader2 className="h-4 w-4 animate-spin text-fg-3" /></div></div>;
}

export function SetupScreen() {
  return (
    <div className="gutter grid min-h-[100dvh] place-items-center bg-canvas py-10">
      <div className="w-full max-w-lg rounded-2xl bg-card p-8 ring-1 ring-inset ring-line">
        <img src="./icon.svg" alt="" className="h-9 w-9" />
        <h1 className="mt-5 text-[22px] font-semibold tracking-[-0.02em]">Falta conectar el servidor</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-fg-2">Esta copia de Reparte3 no tiene los datos de Supabase. Crea el archivo <code className="rounded bg-hov px-1.5 py-0.5 font-mono text-[12.5px]">web/.env</code> a partir de <code className="rounded bg-hov px-1.5 py-0.5 font-mono text-[12.5px]">.env.example</code> y vuelve a construir la app. Los pasos completos están en <code className="rounded bg-hov px-1.5 py-0.5 font-mono text-[12.5px]">DESPLIEGUE.md</code>.</p>
      </div>
    </div>
  );
}

function Feature({ icon: I, title, text }) {
  return (
    <li className="flex gap-3.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-hov2 text-fg"><I className="h-4 w-4" /></span>
      <span><span className="block text-[14px] font-medium">{title}</span><span className="mt-0.5 block text-[13px] leading-relaxed text-fg-2">{text}</span></span>
    </li>
  );
}

export function AuthPage({ theme, setTheme, initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode);
  const [f, setF] = useState({ name: '', email: '', password: '', birth: '', level: 'universidad', terms: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState('');
  let invited = false; let deep = false;
  try { invited = !!sessionStorage.getItem('r3-join'); deep = /tarea=/.test(sessionStorage.getItem('r3-next') || ''); } catch (e) { /* nada */ }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: f.email.trim(), password: f.password });
        if (error) throw error;
      } else if (mode === 'register') {
        if (f.name.trim().length < 2) throw new Error('Escribe tu nombre.');
        if (!f.birth) throw new Error('Indica tu fecha de nacimiento.');
        if (ageOn(f.birth) < 14) throw new Error('Reparte3 es para personas de 14 años o más.');
        if (f.password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
        if (!f.terms) throw new Error('Acepta la política de privacidad para continuar.');
        const { data, error } = await supabase.auth.signUp({
          email: f.email.trim(), password: f.password,
          options: { emailRedirectTo: redirect(), data: { display_name: f.name.trim(), birth_date: f.birth, level: f.level } },
        });
        if (error) throw error;
        if (!data.session) setSent('confirm');
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(f.email.trim(), { redirectTo: redirect() });
        if (error) throw error;
        setSent('reset');
      }
    } catch (e2) { setErr(errMsg(e2)); }
    setBusy(false);
  };

  return (
    <div className="min-h-[100dvh] bg-canvas lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <section className="gutter relative hidden flex-col justify-between overflow-hidden border-r border-line bg-side py-10 lg:flex">
        <div aria-hidden="true" className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full" style={{ background: 'radial-gradient(closest-side, rgb(var(--accent) / .12), transparent)' }} />
        <span className="relative flex items-center gap-2.5"><img src="./icon.svg" alt="" className="h-8 w-8" /><span className="text-[17px] font-semibold tracking-[-0.02em]">Reparte3</span></span>
        <div className="relative max-w-md">
          <h2 className="text-[34px] font-semibold leading-[1.1] tracking-[-0.03em]" style={{ textWrap: 'balance' }}>El trabajo en grupo, en un solo lugar.</h2>
          <p className="mt-4 text-[15px] leading-relaxed text-fg-2">Sube la consigna, repartan las tareas y sigan el avance sin perderse entre mensajes de WhatsApp.</p>
          <ul className="mt-10 flex flex-col gap-6">
            <Feature icon={MessageCircle} title="Chat del grupo y por tarea" text="Cada conversación queda junto a la tarea de la que habla." />
            <Feature icon={BellRing} title="Avisos y recordatorios" text="Te llega un aviso cuando te asignan algo, cuando alguien entrega y antes de cada fecha." />
            <Feature icon={Users} title="Roles claros" text="Coordinación, integrantes, revisión y docente con vista de solo lectura." />
          </ul>
        </div>
        <p className="relative text-[12px] text-fg-3">Para estudiantes de 14 años o más. <a href="#/privacidad" className="underline underline-offset-2 hover:text-fg-2">Privacidad</a></p>
      </section>

      <section className="gutter flex min-h-[100dvh] flex-col py-6 lg:py-10">
        <div className="flex items-center justify-between">
          <a href="#/" className="flex items-center gap-2 rounded-lg text-[13.5px] text-fg-2 hover:text-fg"><ArrowLeft className="h-4 w-4" />Volver al inicio</a>
          <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'} className="grid h-9 w-9 place-items-center rounded-lg text-fg-2 hover:bg-hov hover:text-fg">
            {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
        </div>
        <div className="mx-auto my-auto w-full max-w-[400px] py-10">
          {sent ? (
            <div className="anim-enter text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent/10 text-accent-ink"><Mail className="h-5 w-5" /></span>
              <h1 className="mt-5 text-[22px] font-semibold tracking-[-0.02em]">Revisa tu correo</h1>
              <p className="mt-2 text-[14px] leading-relaxed text-fg-2">{sent === 'confirm' ? `Te enviamos un enlace a ${f.email} para confirmar tu cuenta. Ábrelo en este mismo dispositivo.` : `Si hay una cuenta con ${f.email}, te llegará un enlace para crear una nueva contraseña.`}</p>
              <Btn className="mt-6" onClick={() => { setSent(''); setMode('login'); }}><ArrowLeft className="h-4 w-4" />Volver a iniciar sesión</Btn>
            </div>
          ) : (
            <form onSubmit={submit} className="anim-enter flex flex-col gap-4" noValidate>
              <div className="mb-2">
                <h1 className="text-[24px] font-semibold tracking-[-0.025em]">{mode === 'login' ? 'Inicia sesión' : mode === 'register' ? 'Crea tu cuenta' : 'Recupera tu contraseña'}</h1>
                <p className="mt-1.5 text-[14px] text-fg-2">{invited ? 'Te invitaron a un grupo. Entra o crea tu cuenta para unirte.' : deep ? 'Entra para revisar la tarea que te asignaron.' : mode === 'register' ? 'Gratis. Toma menos de un minuto.' : mode === 'login' ? 'Qué bueno verte de nuevo.' : 'Te enviaremos un enlace a tu correo.'}</p>
              </div>
              {mode === 'register' && (
                <div className="flex flex-col gap-1.5"><label htmlFor="au-name" className="label">Nombre y apellido</label>
                  <input id="au-name" autoComplete="name" value={f.name} onChange={set('name')} maxLength={60} className="field h-11" /></div>
              )}
              <div className="flex flex-col gap-1.5"><label htmlFor="au-email" className="label">Correo</label>
                <input id="au-email" type="email" autoComplete="email" inputMode="email" value={f.email} onChange={set('email')} className="field h-11" placeholder="tu@correo.com" /></div>
              {mode !== 'reset' && (
                <div className="flex flex-col gap-1.5">
                  <span className="flex items-center justify-between"><label htmlFor="au-pass" className="label">Contraseña</label>
                    {mode === 'login' && <button type="button" onClick={() => { setMode('reset'); setErr(''); }} className="text-[12.5px] text-fg-2 hover:text-fg">¿La olvidaste?</button>}</span>
                  <input id="au-pass" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={f.password} onChange={set('password')} className="field h-11" placeholder={mode === 'register' ? 'Mínimo 8 caracteres' : ''} />
                </div>
              )}
              {mode === 'register' && <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5"><label htmlFor="au-birth" className="label">Fecha de nacimiento</label>
                    <input id="au-birth" type="date" max={maxBirth()} min="1920-01-01" value={f.birth} onChange={set('birth')} className="field h-11" /></div>
                  <div className="flex flex-col gap-1.5"><label htmlFor="au-level" className="label">Estudias en</label>
                    <SelectField id="au-level" value={f.level} onChange={(v) => setF({ ...f, level: v })} className="[&_select]:h-11">
                      {Object.entries(LEVELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </SelectField></div>
                </div>
                <label htmlFor="au-terms" className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-5 text-fg-2">
                  <input id="au-terms" type="checkbox" checked={f.terms} onChange={set('terms')} className="mt-0.5 h-4 w-4 shrink-0 rounded accent-[rgb(var(--accent))]" />
                  <span>Tengo 14 años o más y acepto la <a href="#/privacidad" target="_blank" rel="noopener" className="font-medium text-fg underline underline-offset-2">política de privacidad</a>.</span>
                </label>
              </>}
              {err && <p role="alert" className="rounded-lg bg-red/10 px-3 py-2.5 text-[13px] text-red ring-1 ring-inset ring-red/20">{err}</p>}
              <Btn kind="primary" size="lg" type="submit" loading={busy} className="mt-1 w-full">{mode === 'login' ? 'Entrar' : mode === 'register' ? 'Crear cuenta' : 'Enviar enlace'}</Btn>
              <p className="text-center text-[13.5px] text-fg-2">
                {mode === 'login' ? <>¿No tienes cuenta? <button type="button" onClick={() => { setMode('register'); setErr(''); }} className="font-medium text-fg underline-offset-4 hover:underline">Créala</button></>
                  : <>¿Ya tienes cuenta? <button type="button" onClick={() => { setMode('login'); setErr(''); }} className="font-medium text-fg underline-offset-4 hover:underline">Inicia sesión</button></>}
              </p>
            </form>
          )}
        </div>
        <p className="text-center text-[12px] text-fg-3 lg:hidden">Para estudiantes de 14 años o más. <a href="#/privacidad" className="underline underline-offset-2">Privacidad</a></p>
      </section>
    </div>
  );
}

export function ResetPassword() {
  const { setRecovery, toast } = useApp();
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (pass.length < 8) { setErr('La contraseña debe tener al menos 8 caracteres.'); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pass });
    setBusy(false);
    if (error) setErr(errMsg(error)); else { toast('Contraseña actualizada.'); setRecovery(false); window.history.replaceState(null, '', redirect()); }
  };
  return (
    <div className="gutter grid min-h-[100dvh] place-items-center bg-canvas">
      <form onSubmit={submit} className="anim-enter flex w-full max-w-[380px] flex-col gap-4">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-hov2"><ShieldCheck className="h-5 w-5" /></span>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Crea una nueva contraseña</h1>
        <div className="flex flex-col gap-1.5"><label htmlFor="rp-pass" className="label">Nueva contraseña</label>
          <input id="rp-pass" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} className="field h-11" placeholder="Mínimo 8 caracteres" /></div>
        {err && <p role="alert" className="text-[13px] text-red">{err}</p>}
        <Btn kind="primary" size="lg" type="submit" loading={busy}>Guardar contraseña</Btn>
      </form>
    </div>
  );
}

/** Si el perfil no se creó al registrarse (por ejemplo, cuenta creada desde el panel), se completa aquí. */
export function Onboarding() {
  const { createProfile, signOut, session } = useApp();
  const [f, setF] = useState({ name: session?.user?.user_metadata?.display_name || '', birth: '', level: 'universidad' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (f.name.trim().length < 2) { setErr('Escribe tu nombre.'); return; }
    if (!f.birth || ageOn(f.birth) < 14) { setErr('Reparte3 es para personas de 14 años o más.'); return; }
    setBusy(true);
    await createProfile({ display_name: f.name.trim(), birth_date: f.birth, level: f.level });
    setBusy(false);
  };
  return (
    <div className="gutter grid min-h-[100dvh] place-items-center bg-canvas">
      <form onSubmit={submit} className="anim-enter flex w-full max-w-[400px] flex-col gap-4">
        <img src="./icon.svg" alt="" className="h-9 w-9" />
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Completa tu perfil</h1>
        <div className="flex flex-col gap-1.5"><label htmlFor="ob-name" className="label">Nombre y apellido</label>
          <input id="ob-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={60} className="field h-11" /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5"><label htmlFor="ob-birth" className="label">Fecha de nacimiento</label>
            <input id="ob-birth" type="date" max={maxBirth()} value={f.birth} onChange={(e) => setF({ ...f, birth: e.target.value })} className="field h-11" /></div>
          <div className="flex flex-col gap-1.5"><label htmlFor="ob-level" className="label">Estudias en</label>
            <SelectField id="ob-level" value={f.level} onChange={(v) => setF({ ...f, level: v })} className="[&_select]:h-11">
              {Object.entries(LEVELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </SelectField></div>
        </div>
        {err && <p role="alert" className="text-[13px] text-red">{err}</p>}
        <Btn kind="primary" size="lg" type="submit" loading={busy}>Continuar</Btn>
        <button type="button" onClick={signOut} className="text-[13px] text-fg-2 hover:text-fg">Cerrar sesión</button>
      </form>
    </div>
  );
}
