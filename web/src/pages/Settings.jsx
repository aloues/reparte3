import { useEffect, useState } from 'react';
import { BellRing, Smartphone, LogOut, Trash2, Sun, Moon, User, Shield } from 'lucide-react';
import { useApp } from '../lib/store';
import { supabase, errMsg } from '../lib/supabase';
import { enablePush, disablePush, currentSubscription, pushSupported, isIOS, isStandalone } from '../lib/push';
import { LEVELS } from '../lib/format';
import { Btn, Toggle, SelectField, Segmented, Spinner } from '../components/ui';

function Card({ icon: I, title, children, tone }) {
  return (
    <section className={`rounded-xl p-6 ring-1 ring-inset ${tone === 'danger' ? 'bg-red/[.04] ring-red/20' : 'bg-card ring-line'}`}>
      <h2 className={`flex items-center gap-2 text-[14.5px] font-semibold ${tone === 'danger' ? 'text-red' : ''}`}><I className="h-4 w-4 text-fg-3" />{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function SettingsPage({ theme, setTheme }) {
  const { profile, updateProfile, signOut, deleteAccount, toast, uid, session } = useApp();
  const [f, setF] = useState({ display_name: profile.display_name, level: profile.level });
  const [prefs, setPrefs] = useState(null);
  const [push, setPush] = useState(null);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState('');

  useEffect(() => {
    supabase.from('notification_prefs').select('*').eq('user_id', uid).maybeSingle()
      .then(({ data }) => setPrefs(data || { user_id: uid, push: true, chat: true, reminders: true, email: true, quiet_start: 20, quiet_end: 8 }));
    currentSubscription().then((s) => setPush(!!s)).catch(() => setPush(false));
  }, [uid]);

  const savePrefs = async (patch) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    const { error } = await supabase.from('notification_prefs').upsert(next);
    if (error) toast(errMsg(error), { icon: 'error' });
  };
  const togglePush = async (on) => {
    setBusy(true);
    try { if (on) { await enablePush(); toast('Este dispositivo recibirá avisos.'); } else { await disablePush(); toast('Desactivaste los avisos en este dispositivo.'); } setPush(on); }
    catch (e) { toast(errMsg(e), { icon: 'error' }); }
    setBusy(false);
  };
  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <Card icon={BellRing} title="Notificaciones">
        {prefs === null ? <Spinner /> : <>
          <div className="rounded-xl bg-hov p-4 ring-1 ring-inset ring-line">
            <div className="flex items-start gap-3">
              <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-fg-2" />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium">Avisos en este dispositivo</p>
                <p className="mt-0.5 text-[12.5px] text-fg-2">{!pushSupported() ? (isIOS() && !isStandalone() ? 'En iPhone: toca Compartir y luego «Añadir a pantalla de inicio». Abre Reparte3 desde ese ícono y vuelve aquí.' : 'Este navegador no admite avisos push. Prueba con Chrome, Edge o Firefox.') : push ? 'Activados. Te llegarán aunque cierres la app.' : 'Actívalos para recibir avisos aunque la app esté cerrada.'}</p>
              </div>
              {pushSupported() && push !== null && <Btn size="sm" kind={push ? 'secondary' : 'primary'} loading={busy} onClick={() => togglePush(!push)}>{push ? 'Desactivar' : 'Activar'}</Btn>}
            </div>
          </div>
          <div className="mt-2 divide-y divide-line">
            <Toggle id="pf-push" label="Enviar avisos push" desc="Si lo apagas, los avisos solo aparecen dentro de la app." checked={prefs.push} onChange={(v) => savePrefs({ push: v })} />
            <Toggle id="pf-chat" label="Mensajes y comentarios" desc="Cuando alguien escribe en el chat del grupo o comenta una tarea tuya." checked={prefs.chat} onChange={(v) => savePrefs({ chat: v })} />
            <Toggle id="pf-mail" label="Correo cuando te asignan tareas" desc="Un correo con el resumen de tus tareas nuevas y un botón para revisarlas. Nunca acepta nada por ti." checked={prefs.email !== false} onChange={(v) => savePrefs({ email: v })} />
            <Toggle id="pf-rem" label="Recordatorios de avance" desc="Un día antes y el día de cada entrega, tareas vencidas y tareas por aceptar." checked={prefs.reminders} onChange={(v) => savePrefs({ reminders: v })} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-4 text-[13.5px]">
            <span className="font-medium">Silencio</span><span className="text-fg-2">de</span>
            <SelectField id="pf-qs" value={String(prefs.quiet_start)} onChange={(v) => savePrefs({ quiet_start: Number(v) })} className="w-24 [&_select]:h-8">{hours.map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</SelectField>
            <span className="text-fg-2">a</span>
            <SelectField id="pf-qe" value={String(prefs.quiet_end)} onChange={(v) => savePrefs({ quiet_end: Number(v) })} className="w-24 [&_select]:h-8">{hours.map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</SelectField>
            <span className="w-full text-[12.5px] text-fg-2">En ese horario (hora de Lima) no llegan avisos push; los verás al abrir la app.</span>
          </div>
        </>}
      </Card>

      <Card icon={User} title="Perfil">
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); if (f.display_name.trim().length >= 2) updateProfile({ display_name: f.display_name.trim(), level: f.level }); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5"><label htmlFor="st-name" className="label">Nombre</label><input id="st-name" value={f.display_name} maxLength={60} onChange={(e) => setF({ ...f, display_name: e.target.value })} className="field" /></div>
            <div className="flex flex-col gap-1.5"><label htmlFor="st-level" className="label">Estudias en</label>
              <SelectField id="st-level" value={f.level} onChange={(v) => setF({ ...f, level: v })}>{Object.entries(LEVELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectField></div>
          </div>
          <p className="text-[12.5px] text-fg-2">Correo: {session?.user?.email}</p>
          <div><Btn kind="primary" type="submit">Guardar perfil</Btn></div>
        </form>
      </Card>

      <Card icon={theme === 'dark' ? Moon : Sun} title="Apariencia">
        <Segmented label="Tema" value={theme} onChange={setTheme} options={[{ id: 'light', label: 'Claro', icon: Sun }, { id: 'dark', label: 'Oscuro', icon: Moon }]} />
      </Card>

      <Card icon={Shield} title="Cuenta y privacidad">
        <p className="text-[13.5px] text-fg-2">Lee cómo tratamos tus datos en la <a href="#/privacidad" className="font-medium text-fg underline underline-offset-2">política de privacidad</a>.</p>
        <Btn kind="secondary" className="mt-4" onClick={signOut}><LogOut className="h-4 w-4" />Cerrar sesión</Btn>
      </Card>

      {!profile.is_admin && (
        <Card icon={Trash2} title="Eliminar mi cuenta" tone="danger">
          <p className="text-[13.5px] text-fg-2">Se borran tu perfil, tus mensajes y tus avisos. Los proyectos donde eres la única persona se eliminan; en los demás, otra persona pasa a coordinar.</p>
          <label htmlFor="st-del" className="mt-4 block text-[13px]">Escribe <strong>ELIMINAR</strong> para confirmar</label>
          <div className="mt-2 flex flex-wrap gap-2">
            <input id="st-del" value={del} onChange={(e) => setDel(e.target.value)} className="field min-w-0 flex-1" />
            <Btn kind="danger" disabled={del !== 'ELIMINAR'} onClick={deleteAccount}><Trash2 className="h-4 w-4" />Eliminar cuenta</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}
