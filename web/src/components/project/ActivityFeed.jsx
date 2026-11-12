import { useMemo, useState } from 'react';
import { Activity, Check, Hand, Play, Ban, UploadCloud, CheckCheck, Pencil, Undo2, UserPlus, FolderPlus, ListChecks, CircleDot } from 'lucide-react';
import { useApp } from '../../lib/store';
import { useActivity } from '../../lib/hooks';
import { ago } from '../../lib/format';
import { Avatar, Spinner, Empty } from '../ui';
import { openTask } from '../TaskViews';

const ICON = { aceptar: Check, rechazar: Hand, tomar: UserPlus, iniciar: Play, bloquear: Ban, desbloquear: Play, entregar: UploadCloud, aprobar: CheckCheck, cambios: Pencil, reabrir: Undo2, miembro: UserPlus, proyecto: FolderPlus, plan: ListChecks };
const GROUPS = [['todo', 'Todo', null], ['tareas', 'Compromisos y entregas', ['aceptar', 'rechazar', 'tomar', 'iniciar', 'entregar', 'aprobar', 'cambios', 'reabrir']], ['bloqueos', 'Bloqueos', ['bloquear', 'desbloquear']], ['grupo', 'Grupo y plan', ['miembro', 'proyecto', 'plan']]];
const dayKey = (ts) => new Date(ts).toLocaleDateString('es-PE', { timeZone: 'America/Lima', weekday: 'long', day: 'numeric', month: 'long' });

/** Registro de lo que pasó en el proyecto: quién aceptó, entregó o pidió ayuda, y cuándo. */
export default function ActivityFeed({ p }) {
  const { tasks, nameOf, uid } = useApp();
  const ts = tasks.filter((t) => t.project_id === p.id);
  const version = ts.map((t) => `${t.status}${t.accepted}${t.assignee}`).join();
  const items = useActivity(p.id, null, 200, version);
  const [g, setG] = useState('todo');
  const kinds = GROUPS.find((x) => x[0] === g)[2];
  const list = useMemo(() => (items || []).filter((a) => !kinds || kinds.includes(a.kind)), [items, kinds]);
  if (items === null) return <Spinner />;
  let last = null;
  return (
    <div className="mx-auto grid grid-cols-1 max-w-3xl gap-4">
      <div role="tablist" aria-label="Filtrar actividad" className="no-scrollbar flex gap-1 overflow-x-auto">
        {GROUPS.map(([k, lb]) => <button key={k} type="button" role="tab" aria-selected={g === k} onClick={() => setG(k)} className={`h-8 shrink-0 rounded-lg px-3 text-[13px] ${g === k ? 'bg-hov2 font-medium text-fg' : 'text-fg-2 hover:bg-hov hover:text-fg'}`}>{lb}</button>)}
      </div>
      {!list.length ? <Empty icon={Activity} title="Sin actividad todavía" text="Aquí quedará registrado quién aceptó, entregó, revisó o pidió ayuda, y cuándo." /> : (
        <ol className="rounded-2xl bg-card px-5 py-2 ring-1 ring-inset ring-line">
          {list.map((a) => {
            const d = dayKey(a.created_at); const show = d !== last; last = d;
            const I = ICON[a.kind] || CircleDot; const t = a.task_id ? ts.find((x) => x.id === a.task_id) : null;
            return (
              <li key={a.id}>
                {show && <p className="pb-1 pt-4 text-[12px] font-medium capitalize text-fg-3">{d}</p>}
                <div className="flex items-start gap-3 py-2.5">
                  <Avatar name={nameOf(a.actor, p.id)} me={a.actor === uid} size="md" ring="card" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] leading-5"><span className="font-medium">{a.actor === uid ? 'Tú' : nameOf(a.actor, p.id)}</span> <span className="text-fg-2">{a.summary.charAt(0).toLowerCase() + a.summary.slice(1)}</span></p>
                    {t && <button type="button" onClick={() => openTask(t.id)} className="mt-0.5 text-[12.5px] text-fg underline decoration-fg-3/50 underline-offset-2 hover:decoration-fg">#{t.seq} {t.title}</button>}
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-fg-3"><I className="h-3.5 w-3.5" />{ago(a.created_at)}</span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <p className="text-[12px] text-fg-3">El registro muestra acciones dentro de Reparte3. Marcar una tarea como hecha no mide su calidad.</p>
    </div>
  );
}
