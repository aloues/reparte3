import { useEffect, useRef, useState } from 'react';
import {
  X, FolderOpen, Check, Hand, Play, Ban, UploadCloud, CheckCheck, Pencil, Undo2, GitBranch, Link2, Trash2,
  MessageSquare, Paperclip, History, Lock, UserPlus, ExternalLink,
} from 'lucide-react';
import { useApp } from '../lib/store';
import { useActivity } from '../lib/hooks';
import { displayStatus, STATUS, COLUMNS, ROLES, fmtShort, relDays, cap, ago, isPremium } from '../lib/format';
import { go } from '../lib/router';
import { Avatar, Badge, Btn, IconBtn, Mono, UnderlineTabs, PromptModal, SelectField, Spinner } from './ui';
import { Messages, Files } from './Chat';

function ActionBar({ t, role, uid, onAct, onPrompt }) {
  const mine = t.assignee === uid;
  const box = (tone, text, children) => (
    <div className={`mt-5 flex flex-wrap items-center gap-2 rounded-xl p-3 ring-1 ring-inset ${tone}`}>
      <p className="mr-auto min-w-[180px] flex-1 px-1 text-[13px]">{text}</p>{children}
    </div>
  );
  if (role === 'docente') return box('bg-hov ring-line', <span className="inline-flex items-center gap-2"><Lock className="h-3.5 w-3.5" />Vista de docente: solo lectura.</span>);
  if (!t.assignee && t.status !== 'lista') return box('bg-hov ring-line', 'Esta tarea no tiene responsable.', <Btn kind="primary" size="sm" onClick={() => onAct('tomar')}><UserPlus className="h-4 w-4" />Tomar tarea</Btn>);
  if (mine && !t.accepted) return box('bg-amber/[.07] ring-amber/20', 'Te asignaron esta tarea. ¿La tomas?', <>
    <Btn kind="secondary" size="sm" onClick={() => onPrompt('rechazar')}><Hand className="h-4 w-4" />No puedo</Btn>
    <Btn kind="primary" size="sm" onClick={() => onAct('aceptar')}><Check className="sw-bold h-4 w-4" />Aceptar tarea</Btn></>);
  if (t.status === 'en_revision' && !mine && (role === 'revisor' || role === 'coordinador')) return box('bg-violet/[.07] ring-violet/20', 'Te toca revisar esta entrega.', <>
    <Btn kind="secondary" size="sm" onClick={() => onPrompt('pedir_cambios')}><Pencil className="h-4 w-4" />Pedir cambios</Btn>
    <Btn kind="primary" size="sm" onClick={() => onAct('aprobar')}><CheckCheck className="h-4 w-4" />Aprobar entrega</Btn></>);
  if (t.status === 'en_revision' && mine) return box('bg-violet/[.07] ring-violet/20', 'Entregaste. Falta que alguien de revisión o coordinación la apruebe.');
  if (t.status === 'bloqueada' && (mine || role === 'coordinador')) return box('bg-red/[.07] ring-red/20', <>Bloqueada: {t.blocked_reason || 'sin motivo'}</>,
    <Btn kind="secondary" size="sm" onClick={() => onAct('desbloquear')}><Play className="h-4 w-4" />Quitar bloqueo</Btn>);
  if (mine && t.status === 'pendiente') return box('bg-hov ring-line', 'Aceptaste esta tarea. Avísale al grupo cuando empieces.', <>
    <Btn kind="ghost" size="sm" onClick={() => onPrompt('bloquear')}><Ban className="h-4 w-4" />Bloqueo</Btn>
    <Btn kind="primary" size="sm" onClick={() => onAct('iniciar')}><Play className="h-4 w-4" />Empezar</Btn></>);
  if (mine && t.status === 'en_curso') return box('bg-hov ring-line', 'Cuando termines, entrégala para revisión.', <>
    <Btn kind="ghost" size="sm" onClick={() => onPrompt('bloquear')}><Ban className="h-4 w-4" />Bloqueo</Btn>
    <Btn kind="primary" size="sm" onClick={() => onPrompt('entregar')}><UploadCloud className="h-4 w-4" />Entregar</Btn></>);
  if (t.status === 'lista' && role === 'coordinador') return box('bg-hov ring-line', 'Tarea lista y aprobada.', <Btn kind="secondary" size="sm" onClick={() => onPrompt('reabrir')}><Undo2 className="h-4 w-4" />Reabrir</Btn>);
  return null;
}

const PROMPTS = {
  rechazar: { title: 'No puedo tomar esta tarea', label: '¿Por qué? La coordinación lo verá para reasignarla.', confirm: 'Enviar respuesta', placeholder: 'Ej.: esa semana tengo parciales; puedo tomar otra más corta.' },
  bloquear: { title: 'Marcar un bloqueo', label: '¿Qué te impide avanzar?', confirm: 'Avisar al grupo', placeholder: 'Ej.: necesito los datos de la encuesta.' },
  entregar: { title: 'Entregar para revisión', label: 'Enlace a tu entrega (opcional)', confirm: 'Entregar', placeholder: 'https://docs.google.com/…', required: false, url: true },
  pedir_cambios: { title: 'Pedir cambios', label: '¿Qué hay que corregir?', confirm: 'Enviar', placeholder: 'Ej.: faltan las citas en APA.' },
  reabrir: { title: 'Reabrir la tarea', label: 'Motivo (opcional)', confirm: 'Reabrir', required: false },
};
const OK = { aceptar: 'Aceptaste la tarea.', rechazar: 'Avisaste a la coordinación.', tomar: 'Tomaste la tarea.', iniciar: 'Marcaste que empezaste.', bloquear: 'Avisaste del bloqueo al grupo.', desbloquear: 'Quitaste el bloqueo.', entregar: 'Entregaste para revisión.', aprobar: 'Aprobaste la entrega.', pedir_cambios: 'Pediste cambios.', reabrir: 'Reabriste la tarea.' };

export default function TaskDrawer({ taskId, onClose }) {
  const { tasks, uid, project, membersOf, nameOf, taskAction, updateTask, deleteTask, toast, loaded } = useApp();
  const open = !!taskId;
  const [shownId, setShownId] = useState(taskId);
  useEffect(() => { if (taskId) setShownId(taskId); }, [taskId]);
  const t = tasks.find((x) => x.id === shownId);
  const p = t ? project(t.project_id) : null;
  const role = p?.myRole;
  const coord = role === 'coordinador';
  const [tab, setTab] = useState('chat');
  const [prompt, setPrompt] = useState(null);
  const [editTitle, setEditTitle] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const closeRef = useRef(null);
  const activity = useActivity(open && tab === 'historial' ? t?.project_id : null, t?.id);

  useEffect(() => { if (open) { setTab('chat'); setEditTitle(false); setConfirmDel(false); setTimeout(() => closeRef.current?.focus(), 60); } }, [open, shownId]);
  useEffect(() => { if (t) { setTitle(t.title); setDesc(t.description || ''); } }, [t?.id, t?.title, t?.description]);
  useEffect(() => { document.body.style.overflow = open ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [open]);

  const act = async (action, note, url) => { const r = await taskAction(t.id, action, note, url); if (r) toast(OK[action]); return r; };
  const team = p ? membersOf(p.id).filter((m) => m.role !== 'docente') : [];
  const others = p ? tasks.filter((x) => x.project_id === p.id && x.id !== t.id) : [];
  const st = t ? displayStatus(t) : 'todo';

  return (
    <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <button type="button" tabIndex={-1} aria-label="Cerrar panel" onClick={onClose} className={`absolute inset-0 bg-overlay transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`} />
      <aside role="dialog" aria-modal="true" aria-labelledby="dr-title" inert={open ? undefined : ''}
             onKeyDown={(e) => { if (e.key === 'Escape' && !prompt) { e.stopPropagation(); onClose(); } }}
             className={`absolute inset-y-0 right-0 flex w-full flex-col border-l border-line bg-canvas shadow-pop transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] sm:w-[min(100%,580px)] lg:w-[42vw] lg:min-w-[500px] ${open ? 'translate-x-0' : 'translate-x-full'}`}
             style={{ paddingRight: 'env(safe-area-inset-right, 0px)', paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-5">
          {p && <>
            <FolderOpen className="h-4 w-4 shrink-0 text-fg-3" />
            <button type="button" onClick={() => { onClose(); go(`/p/${p.id}`); }} className="truncate text-[13px] text-fg-2 hover:text-fg hover:underline">{p.name}</button>
            <Mono className="text-fg-3">#{t.seq}</Mono>
          </>}
          <button ref={closeRef} type="button" aria-label="Cerrar (Esc)" title="Cerrar (Esc)" onClick={onClose}
                  className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg text-fg-2 transition-all hover:bg-hov hover:text-fg"><X className="h-4 w-4" /></button>
        </header>

        {!t ? (
          <div className="p-8">{!loaded ? <Spinner /> : <p className="text-[14px] text-fg-2">No encontramos esta tarea. Puede que la hayan borrado o que ya no estés en el grupo.</p>}</div>
        ) : (
          <div key={t.id} className="anim-enter min-h-0 flex-1 overflow-y-auto">
            <div className="px-6 pt-6 sm:px-8">
              <Badge st={st} dot />
              {coord && editTitle ? (
                <form className="mt-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (title.trim().length < 2) return; await updateTask(t.id, { title: title.trim() }); setEditTitle(false); }}>
                  <label htmlFor="dr-title-in" className="sr-only">Título</label>
                  <input id="dr-title-in" autoFocus value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} className="field h-11 text-[18px] font-semibold" />
                  <Btn kind="primary" type="submit">Guardar</Btn>
                </form>
              ) : (
                <h2 id="dr-title" className="group mt-3 text-[22px] font-semibold leading-tight tracking-[-0.02em]" style={{ textWrap: 'balance' }}>
                  {t.title}
                  {coord && <button type="button" onClick={() => setEditTitle(true)} aria-label="Editar título" className="ml-2 inline-grid h-7 w-7 place-items-center rounded-md align-middle text-fg-3 opacity-0 transition-opacity hover:bg-hov hover:text-fg group-hover:opacity-100 focus:opacity-100"><Pencil className="h-3.5 w-3.5" /></button>}
                </h2>
              )}

              <ActionBar t={t} role={role} uid={uid} onAct={(a) => act(a)} onPrompt={(a) => setPrompt(a)} />

              <dl className="mt-6 grid grid-cols-[108px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 text-[13px]">
                <dt className="text-fg-2">Estado</dt>
                <dd>{coord ? (
                  <SelectField id="dr-status" value={t.status} onChange={(v) => updateTask(t.id, { status: v }, `Estado: ${COLUMNS.find((c) => c.id === v).label}.`)} className="max-w-[220px]">
                    {COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </SelectField>
                ) : <span className="px-0.5">{STATUS[st].label}</span>}</dd>

                <dt className="text-fg-2">Responsable</dt>
                <dd>{coord ? (
                  <SelectField id="dr-who" value={t.assignee || ''} onChange={(v) => updateTask(t.id, { assignee: v || null }, v ? `Asignaste la tarea a ${nameOf(v, p.id)}. Le llegó un aviso.` : 'La tarea quedó sin asignar.')} className="max-w-[260px]">
                    <option value="">Sin asignar</option>
                    {team.map((m) => <option key={m.user_id} value={m.user_id}>{m.profile?.display_name}{m.user_id === uid ? ' (tú)' : ''}</option>)}
                  </SelectField>
                ) : (
                  <span className="flex items-center gap-2"><Avatar name={nameOf(t.assignee, p.id)} me={t.assignee === uid} pending={!t.assignee} size="sm" />{nameOf(t.assignee, p.id)}{t.assignee && !t.accepted && <span className="text-fg-2">(falta aceptar)</span>}</span>
                )}</dd>

                <dt className="text-fg-2">Fecha límite</dt>
                <dd>{coord ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <label htmlFor="dr-due" className="sr-only">Fecha límite</label>
                    <input id="dr-due" type="date" value={t.due_date || ''} onChange={(e) => updateTask(t.id, { due_date: e.target.value || null })} className="field w-auto" />
                    {t.due_date && <span className={st === 'overdue' ? 'text-orange' : 'text-fg-2'}>{relDays(t.due_date)}</span>}
                  </span>
                ) : <span className={st === 'overdue' ? 'text-orange' : ''}>{t.due_date ? `${cap(fmtShort(t.due_date))}, ${relDays(t.due_date)}` : 'Sin fecha'}</span>}</dd>

                <dt className="text-fg-2">Esfuerzo</dt>
                <dd>{coord ? (
                  <span className="flex items-center gap-2">
                    <label htmlFor="dr-hours" className="sr-only">Horas estimadas</label>
                    <input id="dr-hours" type="number" min="0.5" max="200" step="0.5" defaultValue={t.hours || ''} key={`h${t.id}${t.hours}`}
                           onBlur={(e) => { const v = e.target.value ? Number(e.target.value) : null; if (v !== (t.hours == null ? null : Number(t.hours))) updateTask(t.id, { hours: v }); }}
                           className="field w-24" />
                    <span className="text-fg-2">horas</span>
                  </span>
                ) : <span>{t.hours ? `${Number(t.hours)} h estimadas` : 'Sin estimar'}</span>}</dd>

                {(coord || t.depends_on) && <>
                  <dt className="text-fg-2">Depende de</dt>
                  <dd>{coord ? (
                    <SelectField id="dr-dep" value={t.depends_on || ''} onChange={(v) => updateTask(t.id, { depends_on: v || null })} className="max-w-[320px]">
                      <option value="">Ninguna</option>
                      {others.map((o) => <option key={o.id} value={o.id}>#{o.seq} {o.title}</option>)}
                    </SelectField>
                  ) : <span className="flex items-center gap-2"><GitBranch className="h-3.5 w-3.5 text-fg-3" />{others.find((o) => o.id === t.depends_on)?.title || 'Otra tarea'}</span>}</dd>
                </>}

                {t.delivery_url && <>
                  <dt className="text-fg-2">Entrega</dt>
                  <dd><a href={t.delivery_url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 truncate text-accent underline-offset-4 hover:underline"><Link2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{t.delivery_url}</span><ExternalLink className="h-3 w-3 shrink-0" /></a></dd>
                </>}
              </dl>

              <div className="mt-6">
                <label htmlFor="dr-desc" className="text-[12.5px] font-medium text-fg-2">Descripción</label>
                {coord ? (
                  <textarea id="dr-desc" rows={3} maxLength={4000} value={desc} onChange={(e) => setDesc(e.target.value)}
                            onBlur={() => { if (desc !== (t.description || '')) updateTask(t.id, { description: desc }, 'Descripción guardada.'); }}
                            placeholder="Qué hay que hacer, criterios de la rúbrica, enlaces útiles…" className="field mt-1.5" />
                ) : <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed">{t.description || <span className="text-fg-2">Sin descripción.</span>}</p>}
              </div>
            </div>

            <div className="sticky top-0 z-10 mt-6 border-b border-line bg-canvas/90 px-4 backdrop-blur sm:px-6">
              <UnderlineTabs label="Secciones de la tarea" value={tab} onChange={setTab} tabs={[
                { id: 'chat', label: 'Comentarios', icon: MessageSquare },
                { id: 'files', label: 'Archivos', icon: Paperclip },
                { id: 'historial', label: 'Historial', icon: History },
              ]} />
            </div>
            <div className="px-6 py-5 sm:px-8">
              {tab === 'chat' && <Messages compact projectId={p.id} taskId={t.id} readOnly={role === 'docente'} premium={isPremium(p)} emptyText="Sin comentarios. Pregunta o deja una nota para quien tenga la tarea." />}
              {tab === 'files' && <Files projectId={p.id} taskId={t.id} readOnly={role === 'docente'} />}
              {tab === 'historial' && (activity === null ? <Spinner /> : activity.length === 0 ? <p className="text-[13px] text-fg-2">Sin movimientos todavía.</p> : (
                <ol className="relative flex flex-col gap-4 border-l border-line pl-5">
                  {activity.map((a) => (
                    <li key={a.id} className="relative text-[13px]">
                      <span className="absolute -left-[25px] top-1 h-2 w-2 rounded-full bg-fg-3 ring-4 ring-canvas" />
                      <span className="font-medium">{nameOf(a.actor, p.id)}</span> <span className="text-fg-2">{a.summary}</span>
                      <span className="block text-[12px] text-fg-3">{ago(a.created_at)}</span>
                    </li>
                  ))}
                </ol>
              ))}
              {coord && (
                <div className="mt-10 border-t border-line pt-5">
                  {!confirmDel ? <Btn kind="ghost" size="sm" className="text-red hover:bg-red/10 hover:text-red" onClick={() => setConfirmDel(true)}><Trash2 className="h-4 w-4" />Eliminar tarea</Btn> : (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-red/[.06] p-3 ring-1 ring-inset ring-red/20">
                      <p className="mr-auto text-[13px]">¿Eliminar «{t.title}» con sus comentarios y archivos?</p>
                      <Btn size="sm" onClick={() => setConfirmDel(false)}>Cancelar</Btn>
                      <Btn kind="danger" size="sm" onClick={async () => { const r = await deleteTask(t.id); if (r) onClose(); }}>Eliminar</Btn>
                    </div>
                  )}
                </div>
              )}
              <p className="mt-6 text-[11.5px] text-fg-3">Tu rol en este grupo: {ROLES[role]?.label}.</p>
            </div>
          </div>
        )}
      </aside>
      <PromptModal open={!!prompt} {...(PROMPTS[prompt] || {})} required={PROMPTS[prompt]?.required !== false}
                   onCancel={() => setPrompt(null)}
                   onConfirm={async (v) => {
                     const isUrl = PROMPTS[prompt]?.url;
                     if (isUrl && v && !/^https?:\/\//i.test(v)) { toast('El enlace debe empezar con http:// o https://', { icon: 'error' }); return; }
                     const r = await act(prompt, isUrl ? null : v, isUrl ? v || null : null);
                     if (r) setPrompt(null);
                   }} />
    </div>
  );
}
