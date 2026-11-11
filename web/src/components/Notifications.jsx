import { useEffect, useRef, useState } from 'react';
import {
  X, Bell, BellRing, UserPlus, Check, Hand, UploadCloud, CheckCheck, Pencil, Ban, Play, MessageCircle, MessageSquare,
  Clock, AlertTriangle, Users, Calendar, Trash2,
} from 'lucide-react';
import { useApp } from '../lib/store';
import { go } from '../lib/router';
import { ago } from '../lib/format';
import { errMsg } from '../lib/supabase';
import { enablePush, currentSubscription, pushSupported } from '../lib/push';
import { Btn, IconBtn, Empty } from './ui';

const KIND = {
  asignada: UserPlus, aceptada: Check, rechazada: Hand, entrega: UploadCloud, aprobada: CheckCheck, cambios: Pencil,
  bloqueo: Ban, desbloqueo: Play, mensaje: MessageCircle, comentario: MessageSquare, recordatorio: Clock,
  vencida: AlertTriangle, por_aceptar: Clock, miembro: Users, fecha: Calendar,
};
const TONE = { bloqueo: 'text-red', vencida: 'text-orange', rechazada: 'text-amber', por_aceptar: 'text-amber', entrega: 'text-violet', cambios: 'text-violet' };

export default function NotificationsPanel({ open, onClose }) {
  const { notifs, markRead, clearNotifs, project, toast } = useApp();
  const [push, setPush] = useState(null);
  const closeRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    setTimeout(() => closeRef.current?.focus(), 60);
    currentSubscription().then((s) => setPush(!!s)).catch(() => setPush(false));
  }, [open]);

  const unread = notifs.filter((n) => !n.read_at);
  const openOne = (n) => {
    markRead(n.id);
    onClose();
    go(n.task_id ? `/p/${n.project_id}?tarea=${n.task_id}` : n.project_id ? `/p/${n.project_id}${n.kind === 'mensaje' ? '/chat' : ''}` : '/');
  };
  const groups = [['Nuevas', unread], ['Anteriores', notifs.filter((n) => n.read_at)]];

  return (
    <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <button type="button" tabIndex={-1} aria-label="Cerrar" onClick={onClose} className={`absolute inset-0 bg-overlay transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`} />
      <aside role="dialog" aria-modal="true" aria-labelledby="nt-title" inert={open ? undefined : ''}
             onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
             className={`absolute inset-y-0 right-0 flex w-full flex-col border-l border-line bg-canvas shadow-pop transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] sm:w-[420px] ${open ? 'translate-x-0' : 'translate-x-full'}`}
             style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-5">
          <Bell className="h-4 w-4 text-fg-3" />
          <h2 id="nt-title" className="text-[14.5px] font-semibold">Notificaciones</h2>
          <div className="ml-auto flex items-center gap-1">
            {unread.length > 0 && <Btn size="xs" onClick={() => markRead(unread.map((n) => n.id))}><CheckCheck className="h-3.5 w-3.5" />Marcar todo leído</Btn>}
            <button ref={closeRef} type="button" aria-label="Cerrar" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-fg-2 hover:bg-hov hover:text-fg"><X className="h-4 w-4" /></button>
          </div>
        </header>

        {push === false && pushSupported() && (
          <div className="m-4 mb-0 flex items-start gap-3 rounded-xl bg-accent/[.06] p-3.5 ring-1 ring-inset ring-accent/20">
            <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">Recibe avisos aunque cierres la app</p>
              <p className="mt-0.5 text-[12.5px] text-fg-2">Mensajes del grupo, tareas nuevas y recordatorios de entrega en este dispositivo.</p>
            </div>
            <Btn kind="primary" size="xs" onClick={async () => { try { await enablePush(); setPush(true); toast('Listo: este dispositivo recibirá avisos.'); } catch (e) { toast(errMsg(e), { icon: 'error' }); } }}>Activar</Btn>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          {notifs.length === 0 ? <Empty className="m-3" icon={Bell} title="Sin notificaciones" text="Aquí verás tareas asignadas, entregas, bloqueos, mensajes del grupo y recordatorios." /> : groups.map(([label, list]) => list.length > 0 && (
            <section key={label} className="mb-3">
              <h3 className="px-3 pb-1.5 pt-2 text-[11.5px] font-medium text-fg-3">{label}</h3>
              <ul className="flex flex-col">
                {list.map((n) => {
                  const I = KIND[n.kind] || Bell;
                  const p = project(n.project_id);
                  return (
                    <li key={n.id}>
                      <button type="button" onClick={() => openOne(n)} className={`group flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-hov ${n.read_at ? '' : 'bg-accent/[.04]'}`}>
                        <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-hov2 ${TONE[n.kind] || 'text-fg-2'}`}><I className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-[13.5px] leading-5 ${n.read_at ? 'text-fg-2' : 'font-medium text-fg'}`}>{n.title}</span>
                          {n.body && <span className="mt-0.5 line-clamp-2 block text-[12.5px] leading-5 text-fg-2">{n.body}</span>}
                          <span className="mt-1 block text-[11.5px] text-fg-3">{ago(n.created_at)}{p ? `, ${p.name}` : ''}</span>
                        </span>
                        {!n.read_at && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Sin leer" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
        {notifs.length > 0 && (
          <footer className="flex shrink-0 items-center justify-between border-t border-line px-5 py-3">
            <button type="button" onClick={() => { onClose(); go('/ajustes'); }} className="text-[12.5px] text-fg-2 hover:text-fg">Preferencias de avisos</button>
            <IconBtn label="Borrar todas" onClick={clearNotifs} className="hover:text-red"><Trash2 className="h-4 w-4" /></IconBtn>
          </footer>
        )}
      </aside>
    </div>
  );
}
