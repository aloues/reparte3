import { useState } from 'react';
import { Target, Check, AlertTriangle, Info, ArrowUpRight, CircleDot, Pencil, CheckCheck, Hand, Activity as ActIcon, Archive, UserPlus, FileText, ArrowRight } from 'lucide-react';
import { useApp } from '../../lib/store';
import { useActivity, useFiles, useLinks } from '../../lib/hooks';
import { go } from '../../lib/router';
import { todayISO, fmtShort, relDays, ago, displayStatus } from '../../lib/format';
import { projectAlerts, progressOf, flowState } from '../../lib/center';
import { followUp, TRACK } from '../../lib/plan';
import { Btn, Mono, Avatar, Dot, Badge } from '../ui';
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
      <Target className="mt-1 h-5 w-5 shrink-0 text-accent-ink" />
      <div className="min-w-0 flex-1">
        {p.goal ? <p className="text-[17px] font-medium leading-snug tracking-[-0.01em]" style={{ textWrap: 'pretty' }}>{p.goal}</p>
          : <p className="text-[14.5px] text-fg-2">{coord ? 'Todavía no hay objetivo. Escribirlo en una frase ayuda al grupo a decidir qué es importante.' : 'La coordinación todavía no escribió el objetivo.'}</p>}
      </div>
      {coord && <Btn size="sm" onClick={() => setEdit(true)}><Pencil className="h-3.5 w-3.5" />{p.goal ? 'Editar' : 'Escribir objetivo'}</Btn>}
    </div>
  );
}

function Panel({ title, icon: I, children, tone, aside }) {
  return (
    <section className={`flex flex-col rounded-2xl p-5 ring-1 ring-inset ${tone === 'risk' ? 'bg-st-blocked/[.04] ring-st-blocked/25' : 'bg-card ring-line'}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold"><I className={`h-4 w-4 ${tone === 'risk' ? 'text-red' : 'text-fg-3'}`} />{title}</h3>
        {aside}
      </div>
      <div className="mt-4 flex-1">{children}</div>
    </section>
  );
}

const COORD_ONLY = ['objetivo', 'consigna', 'grupo', 'reparto', 'cierre'];

/** El detalle de un tiempo: qué significa, sus pasos con datos reales y la acción que lo hace avanzar. */
function StagePanel({ p, role, st, n, onTab }) {
  const { tasks, checkpoints, membersOf, updateProject } = useApp();
  const coord = role === 'coordinador';
  const s = st.stages.find((x) => x.n === n) || st.stages[0];
  const ts = tasks.filter((t) => t.project_id === p.id);
  const today = todayISO();
  const prog = progressOf(ts);
  const team = membersOf(p.id).filter((m) => m.role !== 'docente');
  const [notes, setNotes] = useState(p.closing_notes || '');
  const f = followUp(checkpoints.filter((c) => c.project_id === p.id), ts, team.map((m) => m.user_id), today);
  const nextCp = f.checkpoints.find((c) => c.status !== 'cumplido');
  const next = s.nextStep;
  const canAct = next && role !== 'docente' && p.status === 'activo' && (coord || !COORD_ONLY.includes(next.key));
  const goStep = (step) => (step.tab === 'resumen' ? null : onTab(step.tab === 'flujo' ? 'flujo' : step.tab));
  const count = (k) => ts.filter((t) => flowState(t, today).key === k).length;
  const tone = `Tiempo ${s.n} de 4 · ${{ done: 'hecho', current: 'en curso', open: 'quedó con pasos pendientes', todo: 'por empezar' }[s.state]}`;
  const [sure, setSure] = useState(false);
  const lower = (x) => x.charAt(0).toLowerCase() + x.slice(1);

  return (
    <section id="stage-panel" aria-labelledby="stage-t" className="rounded-2xl bg-card p-5 ring-1 ring-inset ring-line sm:p-7">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <span className={`font-mono text-[44px] font-medium leading-[.9] tabular-nums ${s.state === 'current' ? 'text-accent-ink' : s.state === 'done' ? 'text-fg' : 'text-fg-3'}`} aria-hidden="true">{s.n}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] text-fg-2">{tone}{st.current && st.current.n !== s.n && <> · el grupo está en <button type="button" onClick={() => go(`/p/${p.id}?tiempo=${st.current.n}`)} className="font-medium text-fg underline underline-offset-2">{st.current.n}. {st.current.label}</button></>}</p>
          <h3 id="stage-t" className="mt-0.5 text-[22px] font-semibold leading-tight tracking-[-0.02em]">{s.label}</h3>
          <p className="mt-1 text-[14px] text-fg-2">{s.what}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Pasos del tiempo, marcados con datos reales */}
        <ol className="flex flex-col gap-1.5">
          {s.steps.map((x) => {
            const isNext = next?.key === x.key;
            return (
              <li key={x.key} className={`flex items-start gap-3 rounded-xl p-3 ${isNext ? 'bg-accent/[.06] ring-1 ring-inset ring-accent/30' : ''}`}>
                <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${x.done ? 'bg-fg text-canvas' : isNext ? 'ring-[1.5px] ring-inset ring-accent' : 'ring-1 ring-inset ring-fg-3'}`}>{x.done && <Check className="sw-bold h-3 w-3" />}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[14px] ${x.done ? 'text-fg-2' : 'font-medium'}`}><span className="sr-only">{x.done ? 'Hecho: ' : isNext ? 'Siguiente: ' : 'Pendiente: '}</span>{x.label}</span>
                  {isNext && <span className="mt-0.5 block text-[12.5px] leading-5 text-fg-2">{x.why}</span>}
                  {isNext && !coord && role !== 'docente' && COORD_ONLY.includes(x.key) && <span className="mt-1 block text-[12px] font-medium text-fg-2">Esto lo hace la coordinación.</span>}
                </span>
              </li>
            );
          })}
          {canAct && next.tab !== 'resumen' && (
            <li className="mt-2"><Btn kind="primary" onClick={() => goStep(next)}>Siguiente paso: {lower(next.action)}<ArrowRight className="h-4 w-4" /></Btn></li>
          )}
          {!next && <li className="mt-1 flex items-center gap-2 text-[13.5px] text-fg-2"><CheckCheck className="h-4 w-4" />Este tiempo está completo.</li>}
        </ol>

        {/* Lo propio de cada tiempo */}
        <div className="flex flex-col gap-4 lg:border-l lg:border-line lg:pl-6">
          {s.key === 'armar' && <>
            <Goal p={p} coord={coord && p.status === 'activo'} />
            <div className="grid grid-cols-2 gap-3 text-[13px]">
              <button type="button" onClick={() => onTab('consigna')} className="flex items-center gap-2.5 rounded-xl p-3 text-left ring-1 ring-inset ring-line hover:bg-hov">
                <FileText className="h-4 w-4 shrink-0 text-fg-3" /><span><span className="block font-medium">Consigna</span><span className="text-fg-2">{p.brief_text || p.brief_path ? 'Subida' : 'Falta'}</span></span>
              </button>
              <button type="button" onClick={() => onTab('equipo')} className="flex items-center gap-2.5 rounded-xl p-3 text-left ring-1 ring-inset ring-line hover:bg-hov">
                <UserPlus className="h-4 w-4 shrink-0 text-fg-3" /><span><span className="block font-medium">Grupo</span><span className="text-fg-2"><Mono className="text-[13px]">{team.length}{p.expected_members ? `/${p.expected_members}` : ''}</Mono> {team.length === 1 ? 'persona' : 'personas'}</span></span>
              </button>
            </div>
          </>}
          {s.key === 'repartir' && (
            <dl className="grid grid-cols-3 gap-3">
              {[['Tareas', st.counts.total], ['Con responsable', st.counts.assigned], ['Aceptadas', st.counts.accepted]].map(([k, v]) => (
                <div key={k}><dt className="text-[12px] text-fg-2">{k}</dt><dd className="mt-1 font-mono text-[24px] leading-none tabular-nums">{v}</dd></div>
              ))}
            </dl>
          )}
          {s.key === 'avanzar' && <>
            <div>
              <p className="flex items-baseline justify-between text-[12.5px] text-fg-2"><span>Aprobadas</span><Mono className="text-[13px] text-fg">{prog.done}/{prog.total}</Mono></p>
              <span className="mt-2 block h-2 overflow-hidden rounded-full bg-hov2" role="img" aria-label={`${prog.pct}% aprobado`}><span className="block h-full rounded-full bg-st-done transition-[width] duration-700" style={{ width: `${prog.pct}%` }} /></span>
              <p className="mt-1.5 text-[12px] text-fg-2">Solo cuenta como avance una tarea aprobada.</p>
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
              {[['en_curso', 'progress', 'en curso', 'en curso'], ['en_revision', 'review', 'en revisión', 'en revisión'], ['bloqueada', 'blocked', 'bloqueada', 'bloqueadas'], ['vencida', 'overdue', 'vencida', 'vencidas']].map(([k, d, one, many]) => (
                <li key={k} className="flex items-center gap-2"><Dot st={d} /><Mono className="text-[13px]">{count(k)}</Mono><span className="text-fg-2">{count(k) === 1 ? one : many}</span></li>
              ))}
            </ul>
            {nextCp && <p className="text-[13px]"><span className="text-fg-2">Próximo checkpoint: </span><span className="font-medium">{nextCp.title}</span><span className="text-fg-2">, {fmtShort(nextCp.due_date)} ({relDays(nextCp.due_date)}). </span><span className={nextCp.status === 'atrasado' ? 'font-medium text-red' : nextCp.status === 'riesgo' ? 'font-medium text-amber' : 'text-fg-2'}>{TRACK[nextCp.status].label}</span></p>}
          </>}
          {s.key === 'cerrar' && ((st.counts.total > 0 && !st.counts.open) || p.status === 'archivado' ? <>
            <p className="text-[13.5px] text-fg-2">{st.counts.open ? `Archivado con ${prog.done} de ${prog.total} tareas aprobadas.` : prog.total === 1 ? 'Aprobaron la única tarea' : `Aprobaron las ${prog.total} tareas`}{!st.counts.open && ` (${prog.hDone} h estimadas).`} Escriban en pocas líneas qué funcionó y qué harían distinto: sirve para el próximo trabajo.</p>
            <ul className="flex flex-wrap gap-2">
              {team.map((m) => <li key={m.user_id} className="flex items-center gap-2 rounded-full bg-hov py-1 pl-1 pr-3 text-[12.5px]"><Avatar name={m.profile?.display_name} size="sm" ring="hov" />{m.profile?.display_name}: {ts.filter((t) => t.assignee === m.user_id && t.status === 'lista').length} aprobadas</li>)}
            </ul>
            {coord ? (
              <form onSubmit={async (e) => { e.preventDefault(); await updateProject(p.id, { closing_notes: notes.trim() || null }, 'Cierre guardado.'); }}>
                <label htmlFor="close-in" className="label">Qué aprendieron</label>
                <textarea id="close-in" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Qué funcionó, qué se trabó y cómo lo resolvieron." className="field mt-1.5" />
                <div className="mt-2 flex flex-wrap gap-2">
                  <Btn kind="secondary" size="sm" type="submit">Guardar cierre</Btn>
                  {p.status === 'activo' && (!sure
                    ? <Btn kind="primary" size="sm" onClick={() => setSure(true)}><Archive className="h-4 w-4" />Cerrar y archivar</Btn>
                    : <span className="flex basis-full flex-wrap items-center gap-2 text-[12.5px] text-fg-2">Al archivar, nadie podrá editar el proyecto (se puede reactivar en Ajustes).
                        <Btn size="sm" onClick={() => setSure(false)}>Cancelar</Btn>
                        <Btn kind="primary" size="sm" onClick={async () => { if (await updateProject(p.id, { closing_notes: notes.trim() || null, status: 'archivado' }, 'Proyecto cerrado y archivado.')) setSure(false); }}>Sí, archivar</Btn></span>)}
                </div>
              </form>
            ) : p.closing_notes ? <p className="whitespace-pre-wrap rounded-lg bg-hov p-3 text-[13.5px]">{p.closing_notes}</p> : <p className="text-[13px] text-fg-2">La coordinación escribe el cierre.</p>}
          </> : (
            <p className="text-[13.5px] text-fg-2">{st.counts.total ? (st.counts.open === 1 ? 'Para cerrar falta 1 tarea por aprobar.' : `Para cerrar faltan ${st.counts.open} tareas por aprobar.`) : 'Primero armen y repartan el trabajo.'} Cuando todo esté aprobado, aquí escriben qué aprendieron y archivan el proyecto.</p>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Summary({ p, role, onTab, stages: st, stage }) {
  const { tasks, membersOf, uid, nameOf, taskAction, toast } = useApp();
  const ts = tasks.filter((t) => t.project_id === p.id);
  const members = membersOf(p.id);
  const coord = role === 'coordinador';
  const today = todayISO();
  const activity = useActivity(p.id, null, 6, ts.map((t) => `${t.id}${t.status}${t.accepted}${t.assignee}`).join());
  const { files } = useFiles(p.id);
  const { links } = useLinks(p.id);
  const resources = files === null || links === null ? null : files.length + links.length;
  const alerts = projectAlerts({ project: p, tasks: ts, members, today, resources, uid });
  const archived = p.status === 'archivado';
  const mine = ts.filter((t) => t.assignee === uid && t.status !== 'lista');
  const toAccept = mine.filter((t) => !t.accepted);
  const toReview = ts.filter((t) => t.status === 'en_revision' && t.assignee !== uid && (role === 'revisor' || coord));
  const doing = mine.filter((t) => t.accepted).sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999')).slice(0, 5);
  const [busy, setBusy] = useState(false);
  const act = (a) => (a.task ? openTask(a.task) : onTab(a.tab));
  const acceptAll = async () => { setBusy(true); let ok = 0; for (const t of toAccept) if (await taskAction(t.id, 'aceptar')) ok++; setBusy(false); if (ok) toast(ok === 1 ? 'Aceptaste tu tarea.' : `Aceptaste tus ${ok} tareas.`); };
  const risky = alerts.some((a) => a.level === 'riesgo');
  const urgent = role !== 'docente' && (toAccept.length > 0 || toReview.length > 0);

  return (
    <div className="grid grid-cols-1 gap-5">
      {archived && <p className="rounded-xl bg-hov px-4 py-3 text-[13.5px] text-fg-2 ring-1 ring-inset ring-line">Proyecto archivado: solo lectura.{coord && ' Puedes reactivarlo en Ajustes (engranaje).'}</p>}
      <div className={urgent ? 'order-2' : ''}><StagePanel p={p} role={role} st={st} n={stage} onTab={onTab} /></div>

      <div className={`grid grid-cols-1 items-start gap-5 ${role === 'docente' ? '' : 'lg:grid-cols-2'} ${urgent ? 'order-1' : 'order-3'}`}>
        {role !== 'docente' && <Panel title="Qué te toca" icon={CircleDot} aside={mine.length > 0 && <span className="text-[12px] text-fg-2"><Mono className="text-[12px]">{mine.length}</Mono> {mine.length === 1 ? 'pendiente' : 'pendientes'}</span>}>
          {toAccept.length > 0 && (
            <div className="mb-4 rounded-xl bg-accent/[.06] p-3 ring-1 ring-inset ring-accent/25">
              <p className="text-[13.5px]"><strong className="font-semibold">Por aceptar {toAccept.length}</strong><span className="text-fg-2"> · Al {toAccept.length === 1 ? 'aceptarla' : 'aceptarlas'}, el grupo sabe que cuenta contigo.</span></p>
              <div className="mt-2.5 flex flex-wrap gap-2"><Btn kind="primary" size="sm" loading={busy} onClick={acceptAll}><Check className="sw-bold h-4 w-4" />{toAccept.length === 1 ? 'Aceptar' : 'Aceptar todas'}</Btn><Btn size="sm" onClick={() => openTask(toAccept[0].id)}><Hand className="h-4 w-4" />{toAccept.length === 1 ? 'Ver la tarea' : 'Ver una por una'}</Btn></div>
            </div>
          )}
          {toReview.length > 0 && <button type="button" onClick={() => openTask(toReview[0].id)} className="mb-3 flex w-full items-center gap-2 rounded-lg p-2 text-left text-[13.5px] ring-1 ring-inset ring-st-progress/35 hover:bg-st-progress/[.07]"><Dot st="review" /><span className="flex-1">{toReview.length === 1 ? '1 entrega espera tu revisión' : `${toReview.length} entregas esperan tu revisión`}</span><ArrowUpRight className="h-4 w-4 text-fg-3" /></button>}
          {doing.length > 0 ? (
            <ul className="flex flex-col gap-0.5">
              {doing.map((t) => (
                <li key={t.id}><button type="button" onClick={() => openTask(t.id)} className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left hover:bg-hov">
                  <Dot st={displayStatus(t, today)} label /><span className="min-w-0 flex-1 truncate text-[13.5px]">{t.title}</span>{['blocked', 'overdue'].includes(displayStatus(t, today)) && <Badge st={displayStatus(t, today)} />}<span className="shrink-0 text-[12px] text-fg-2">{t.due_date ? relDays(t.due_date) : 'sin fecha'}</span>
                </button></li>
              ))}
            </ul>
          ) : !toAccept.length && !toReview.length && <p className="flex items-center gap-2 text-[13.5px] text-fg-2"><CheckCheck className="h-4 w-4" />No tienes nada pendiente en este proyecto.</p>}
        </Panel>}

        <Panel title="Qué está en riesgo" icon={AlertTriangle} tone={risky ? 'risk' : undefined} aside={alerts.length > 0 && <Mono className="text-fg-2">{alerts.length}</Mono>}>
          {alerts.length === 0 ? <p className="flex items-center gap-2 text-[13.5px] text-fg-2"><Check className="h-4 w-4" />Nada en riesgo con los datos de hoy.</p> : (
            <ul className="flex flex-col gap-2.5">
              {alerts.slice(0, 5).map((a) => (
                <li key={a.id} className="rounded-xl bg-card p-3 ring-1 ring-inset ring-line">
                  <p className="flex items-start gap-2 text-[13.5px] font-medium">{a.level === 'riesgo' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-fg-2" />}<span>{a.title}</span></p>
                  <p className="mt-1 pl-6 text-[12.5px] leading-5 text-fg-2">{a.why}</p>
                  {role !== 'docente' && !archived && (a.who === 'coord' && !coord
                    ? <p className="mt-1.5 pl-6 text-[12px] font-medium text-fg-2">Le toca a la coordinación.</p>
                    : <button type="button" onClick={() => act(a)} className="mt-1.5 pl-6 text-[12.5px] font-medium text-accent-ink underline-offset-4 hover:underline">{a.action}</button>)}
                </li>
              ))}
              {alerts.length > 5 && <li className="text-[12.5px] text-fg-2">y {alerts.length - 5} más.</li>}
            </ul>
          )}
        </Panel>
      </div>

      <div className="order-4"><Panel title="Qué está pasando" icon={ActIcon} aside={<button type="button" onClick={() => onTab('actividad')} className="text-[12.5px] text-fg-2 underline underline-offset-4 hover:text-fg">Ver toda la actividad</button>}>
        {activity === null ? <p className="text-[13px] text-fg-3">Cargando…</p> : activity.length === 0 ? <p className="text-[13.5px] text-fg-2">Todavía no hay movimiento.</p> : (
          <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2">
            {activity.slice(0, 6).map((a) => (
              <li key={a.id} className="flex items-start gap-2.5">
                <Avatar name={nameOf(a.actor, p.id)} size="sm" ring="card" />
                <p className="min-w-0 flex-1 text-[13px] leading-5"><span className="font-medium">{nameOf(a.actor, p.id)}{a.actor === uid && <span className="font-normal text-fg-2"> (tú)</span>}</span> <span className="text-fg-2">{a.summary.charAt(0).toLowerCase() + a.summary.slice(1)}</span>
                  {a.task_id && <> <button type="button" onClick={() => openTask(a.task_id)} className="text-left text-fg underline decoration-fg-3/50 underline-offset-2 hover:decoration-fg">«{ts.find((t) => t.id === a.task_id)?.title || 'tarea'}»</button></>}
                  <span className="block text-[11.5px] text-fg-3">{ago(a.created_at)}</span></p>
              </li>
            ))}
          </ul>
        )}
      </Panel></div>
      <p className="order-5 text-[12px] text-fg-3">Los tiempos, alertas y pasos se calculan con las tareas, fechas y confirmaciones reales del proyecto.</p>
    </div>
  );
}
