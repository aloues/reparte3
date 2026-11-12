import { useState } from 'react';
import { Target, Check, AlertTriangle, Info, ArrowUpRight, Flag, CircleDot, Pencil, CheckCheck, Hand, Activity as ActIcon, BookOpenCheck } from 'lucide-react';
import { useApp } from '../../lib/store';
import { useActivity, useFiles, useLinks } from '../../lib/hooks';
import { go } from '../../lib/router';
import { todayISO, fmtShort, relDays, ago, displayStatus } from '../../lib/format';
import { projectAlerts, projectRoute, progressOf } from '../../lib/center';
import { followUp, TRACK } from '../../lib/plan';
import { Btn, Mono, Avatar, Dot } from '../ui';
import { openTask } from '../TaskViews';

/** Objetivo del proyecto en una frase: lo edita la coordinación. */
function Goal({ p, coord }) {
  const { updateProject } = useApp();
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(p.goal || '');
  const save = async (e) => { e.preventDefault(); if (await updateProject(p.id, { goal: v.trim() || null }, 'Objetivo guardado.')) setEdit(false); };
  if (edit) {
    return (
      <form onSubmit={save} className="anim-enter">
        <label htmlFor="goal-in" className="text-[13px] font-medium">¿Qué deben lograr? En una frase.</label>
        <textarea id="goal-in" autoFocus rows={2} maxLength={400} value={v} onChange={(e) => setV(e.target.value)} placeholder="Ej.: Proponer un plan de reciclaje viable para el campus, con datos de una encuesta propia." className="field mt-2 text-[15px]" />
        <div className="mt-2 flex gap-2"><Btn kind="primary" size="sm" type="submit">Guardar objetivo</Btn><Btn size="sm" onClick={() => { setEdit(false); setV(p.goal || ''); }}>Cancelar</Btn></div>
      </form>
    );
  }
  return (
    <div className="flex items-start gap-3">
      <Target className="mt-1 h-5 w-5 shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        {p.goal ? <p className="text-[18px] font-medium leading-snug tracking-[-0.01em]" style={{ textWrap: 'pretty' }}>{p.goal}</p>
          : <p className="text-[15px] text-fg-2">{coord ? 'Todavía no hay objetivo. Escribirlo en una frase ayuda al grupo a decidir qué es importante.' : 'La coordinación todavía no escribió el objetivo.'}</p>}
      </div>
      {coord && <Btn size="sm" onClick={() => setEdit(true)}><Pencil className="h-3.5 w-3.5" />{p.goal ? 'Editar' : 'Escribir objetivo'}</Btn>}
    </div>
  );
}

function Panel({ title, icon: I, children, tone }) {
  return (
    <section className={`flex flex-col rounded-2xl p-5 ring-1 ring-inset ${tone === 'risk' ? 'bg-red/[.03] ring-red/15' : 'bg-card ring-line'}`}>
      <h3 className="flex items-center gap-2 text-[14px] font-semibold"><I className={`h-4 w-4 ${tone === 'risk' ? 'text-red' : 'text-fg-3'}`} />{title}</h3>
      <div className="mt-4 flex-1">{children}</div>
    </section>
  );
}

export default function Summary({ p, role, onTab }) {
  const { tasks, checkpoints, membersOf, uid, nameOf, taskAction, toast, updateProject } = useApp();
  const ts = tasks.filter((t) => t.project_id === p.id);
  const cps = checkpoints.filter((c) => c.project_id === p.id);
  const members = membersOf(p.id);
  const coord = role === 'coordinador';
  const today = todayISO();
  const activity = useActivity(p.id, null, 6, ts.map((t) => `${t.id}${t.status}${t.accepted}${t.assignee}`).join());
  const { files } = useFiles(p.id);
  const { links } = useLinks(p.id);
  const resources = files === null || links === null ? null : files.length + links.length;
  const prog = progressOf(ts);
  const alerts = projectAlerts({ project: p, tasks: ts, members, today, resources });
  const route = projectRoute({ project: p, tasks: ts, members, checkpoints: cps });
  const f = followUp(cps, ts, members.filter((m) => m.role !== 'docente').map((m) => m.user_id), today);
  const nextCp = f.checkpoints.find((c) => c.status !== 'cumplido');
  const mine = ts.filter((t) => t.assignee === uid && t.status !== 'lista');
  const toAccept = mine.filter((t) => !t.accepted);
  const toReview = ts.filter((t) => t.status === 'en_revision' && t.assignee !== uid && (role === 'revisor' || coord));
  const doing = mine.filter((t) => t.accepted).sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999')).slice(0, 4);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState(p.closing_notes || '');
  const allDone = ts.length > 0 && ts.every((t) => t.status === 'lista');
  const act = (a) => (a.task ? openTask(a.task) : onTab(a.tab));

  const acceptAll = async () => { setBusy(true); let ok = 0; for (const t of toAccept) if (await taskAction(t.id, 'aceptar')) ok++; setBusy(false); if (ok) toast(ok === 1 ? 'Aceptaste tu tarea.' : `Aceptaste tus ${ok} tareas.`); };

  return (
    <div className="grid grid-cols-1 gap-5">
      {/* Objetivo y avance */}
      <section className="grid grid-cols-1 gap-6 rounded-2xl bg-card p-5 ring-1 ring-inset ring-line sm:p-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Goal p={p} coord={coord && p.status === 'activo'} />
        <div className="grid grid-cols-2 gap-4 lg:border-l lg:border-line lg:pl-6">
          <div>
            <p className="text-[12.5px] text-fg-2">Avance</p>
            <p className="mt-1 text-[28px] font-semibold leading-none tracking-[-0.02em]">{prog.pct}<span className="text-[16px] text-fg-2">%</span></p>
            <span className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-hov2" role="img" aria-label={`${prog.done} de ${prog.total} tareas aprobadas`}><span className="block h-full rounded-full bg-fg transition-[width] duration-700" style={{ width: `${prog.pct}%` }} /></span>
            <p className="mt-2 text-[12px] leading-4 text-fg-2">{prog.done} de {prog.total} tareas aprobadas. Solo cuenta lo aprobado.</p>
          </div>
          <div>
            <p className="text-[12.5px] text-fg-2">Próximo checkpoint</p>
            {nextCp ? <>
              <p className="mt-1 text-[15px] font-semibold leading-tight">{nextCp.title}</p>
              <p className="mt-1 text-[12.5px] text-fg-2">{fmtShort(nextCp.due_date)}, {relDays(nextCp.due_date)}. {nextCp.done} de {nextCp.tasks.length} entregadas</p>
              <p className={`mt-1 text-[12.5px] font-medium ${nextCp.status === 'atrasado' ? 'text-red' : nextCp.status === 'riesgo' ? 'text-amber' : 'text-fg-2'}`}>{TRACK[nextCp.status].label}</p>
            </> : <p className="mt-1 text-[13px] text-fg-2">{p.due_date ? `Entrega ${fmtShort(p.due_date)}, ${relDays(p.due_date)}` : 'Sin fecha de entrega'}</p>}
          </div>
        </div>
      </section>

      {/* Siguiente paso de la ruta */}
      {route.next && p.status === 'activo' && (
        <section className="flex flex-wrap items-center gap-4 rounded-2xl bg-accent/[.06] p-5 ring-1 ring-inset ring-accent/25">
          <span className="grid grid-cols-1 h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-[15px] font-semibold text-on-accent">{route.steps.indexOf(route.next) + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] text-fg-2">Siguiente paso del proyecto</p>
            <p className="text-[16px] font-semibold">{route.next.label}</p>
            <p className="mt-0.5 text-[13px] text-fg-2">{route.next.why}</p>
          </div>
          {(coord || !['objetivo', 'consigna', 'reparto', 'cierre'].includes(route.next.key)) && <Btn kind="primary" onClick={() => onTab(route.next.tab)}>{route.next.action}</Btn>}
        </section>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel title="Qué te toca" icon={CircleDot}>
          {toAccept.length > 0 && (
            <div className="mb-4 rounded-xl bg-amber/[.07] p-3 ring-1 ring-inset ring-amber/25">
              <p className="text-[13.5px]"><strong className="font-semibold">{toAccept.length === 1 ? 'Te tocó 1 tarea' : `Te tocaron ${toAccept.length} tareas`}</strong> por confirmar.</p>
              <div className="mt-2.5 flex flex-wrap gap-2"><Btn kind="primary" size="sm" loading={busy} onClick={acceptAll}><Check className="sw-bold h-4 w-4" />{toAccept.length === 1 ? 'Aceptar' : 'Aceptar todas'}</Btn><Btn size="sm" onClick={() => openTask(toAccept[0].id)}><Hand className="h-4 w-4" />Revisar una por una</Btn></div>
            </div>
          )}
          {toReview.length > 0 && <button type="button" onClick={() => openTask(toReview[0].id)} className="mb-3 flex w-full items-center gap-2 rounded-lg p-2 text-left text-[13.5px] ring-1 ring-inset ring-violet/25 hover:bg-violet/[.06]"><Dot st="review" /><span className="flex-1">{toReview.length === 1 ? '1 entrega espera tu revisión' : `${toReview.length} entregas esperan tu revisión`}</span><ArrowUpRight className="h-4 w-4 text-fg-3" /></button>}
          {doing.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {doing.map((t) => (
                <li key={t.id}><button type="button" onClick={() => openTask(t.id)} className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left hover:bg-hov">
                  <Dot st={displayStatus(t, today)} /><span className="min-w-0 flex-1 truncate text-[13.5px]">{t.title}</span><span className="shrink-0 text-[12px] text-fg-2">{t.due_date ? relDays(t.due_date) : 'sin fecha'}</span>
                </button></li>
              ))}
            </ul>
          ) : !toAccept.length && !toReview.length && <p className="flex items-center gap-2 text-[13.5px] text-fg-2"><CheckCheck className="h-4 w-4" />{role === 'docente' ? 'Como docente ves el avance sin tareas propias.' : 'No tienes nada pendiente en este proyecto.'}</p>}
        </Panel>

        <Panel title="Qué está pasando" icon={ActIcon}>
          {activity === null ? <p className="text-[13px] text-fg-3">Cargando…</p> : activity.length === 0 ? <p className="text-[13.5px] text-fg-2">Todavía no hay movimiento.</p> : (
            <ul className="flex flex-col gap-3">
              {activity.slice(0, 5).map((a) => (
                <li key={a.id} className="flex items-start gap-2.5">
                  <Avatar name={nameOf(a.actor, p.id)} size="sm" ring="card" />
                  <p className="min-w-0 flex-1 text-[13px] leading-5"><span className="font-medium">{a.actor === uid ? 'Tú' : nameOf(a.actor, p.id)}</span> <span className="text-fg-2">{a.summary.charAt(0).toLowerCase() + a.summary.slice(1)}</span>
                    {a.task_id && <> <button type="button" onClick={() => openTask(a.task_id)} className="text-left text-fg underline decoration-fg-3/50 underline-offset-2 hover:decoration-fg">«{ts.find((t) => t.id === a.task_id)?.title || 'tarea'}»</button></>}
                    <span className="block text-[11.5px] text-fg-3">{ago(a.created_at)}</span></p>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => onTab('actividad')} className="mt-3 text-[12.5px] text-fg-2 underline underline-offset-4 hover:text-fg">Ver toda la actividad</button>
        </Panel>

        <Panel title="Qué está en riesgo" icon={AlertTriangle} tone={alerts.some((a) => a.level === 'riesgo') ? 'risk' : undefined}>
          {alerts.length === 0 ? <p className="flex items-center gap-2 text-[13.5px] text-fg-2"><Check className="h-4 w-4" />Nada en riesgo con los datos de hoy.</p> : (
            <ul className="flex flex-col gap-3">
              {alerts.slice(0, 6).map((a) => (
                <li key={a.id} className="rounded-lg p-2.5 ring-1 ring-inset ring-line">
                  <p className="flex items-start gap-2 text-[13.5px] font-medium">{a.level === 'riesgo' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber" />}<span>{a.title}</span></p>
                  <p className="mt-1 pl-6 text-[12.5px] leading-5 text-fg-2">{a.why}</p>
                  {role !== 'docente' && <button type="button" onClick={() => act(a)} className="mt-1.5 pl-6 text-[12.5px] font-medium text-accent underline-offset-4 hover:underline">{a.action}</button>}
                </li>
              ))}
              {alerts.length > 6 && <li className="text-[12.5px] text-fg-2">y {alerts.length - 6} más.</li>}
            </ul>
          )}
        </Panel>
      </div>

      {/* Ruta del proyecto: lo que enseña mientras se trabaja */}
      <section className="rounded-2xl bg-card p-5 ring-1 ring-inset ring-line sm:p-6" aria-labelledby="ruta-t">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="ruta-t" className="flex items-center gap-2 text-[14px] font-semibold"><Flag className="h-4 w-4 text-fg-3" />Ruta del proyecto</h3>
          <Mono className="text-fg-2">{route.doneCount}/{route.steps.length}</Mono>
        </div>
        <ol className="mt-5 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          {route.steps.map((s, i) => {
            const isNext = route.next?.key === s.key;
            return (
              <li key={s.key} className={`flex items-start gap-3 rounded-xl p-3 ${isNext ? 'bg-accent/[.06] ring-1 ring-inset ring-accent/30' : ''}`}>
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11.5px] font-semibold ${s.done ? 'bg-fg text-canvas' : isNext ? 'bg-accent text-on-accent' : 'ring-1 ring-inset ring-line text-fg-2'}`}>{s.done ? <Check className="sw-bold h-3.5 w-3.5" /> : i + 1}</span>
                <span className="min-w-0"><span className={`block text-[13.5px] ${s.done ? 'text-fg-2' : 'font-medium'}`}>{s.label}</span>{isNext && <span className="mt-0.5 block text-[12px] leading-4 text-fg-2">{s.why}</span>}</span>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Cierre: solo con datos que lo sustentan */}
      {(allDone || p.status === 'archivado') && (
        <section className="rounded-2xl bg-card p-5 ring-1 ring-inset ring-line sm:p-6">
          <h3 className="flex items-center gap-2 text-[14px] font-semibold"><BookOpenCheck className="h-4 w-4 text-fg-3" />Cierre del proyecto</h3>
          <p className="mt-2 text-[13.5px] text-fg-2">Entregaron {prog.done} tareas ({prog.hDone} h estimadas). Escriban en pocas líneas qué funcionó y qué harían distinto: sirve para el próximo trabajo.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {members.filter((m) => m.role !== 'docente').map((m) => (
              <li key={m.user_id} className="flex items-center gap-2 rounded-full bg-hov py-1 pl-1 pr-3 text-[12.5px]"><Avatar name={m.profile?.display_name} size="sm" ring="hov" />{m.profile?.display_name}: {ts.filter((t) => t.assignee === m.user_id && t.status === 'lista').length} entregadas</li>
            ))}
          </ul>
          {coord ? (
            <form onSubmit={async (e) => { e.preventDefault(); await updateProject(p.id, { closing_notes: notes.trim() || null }, 'Cierre guardado.'); }} className="mt-4">
              <label htmlFor="close-in" className="sr-only">Qué aprendimos</label>
              <textarea id="close-in" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Qué funcionó, qué se trabó y cómo lo resolvieron." className="field" />
              <Btn kind="primary" size="sm" type="submit" className="mt-2">Guardar cierre</Btn>
            </form>
          ) : p.closing_notes ? <p className="mt-4 whitespace-pre-wrap rounded-lg bg-hov p-3 text-[13.5px]">{p.closing_notes}</p> : null}
        </section>
      )}
      <p className="text-[12px] text-fg-3">Las alertas y la ruta se calculan con las tareas, fechas y confirmaciones reales del proyecto. <button type="button" onClick={() => go(`/p/${p.id}/flujo`)} className="underline underline-offset-2 hover:text-fg-2">Ver el flujo completo</button></p>
    </div>
  );
}
