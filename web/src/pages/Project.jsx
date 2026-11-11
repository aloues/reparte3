import { useEffect, useMemo, useState } from 'react';
import {
  ListChecks, MessageCircle, Users, FileText, Settings, List, Columns3, Plus, Shuffle, Calendar, Sparkles, Copy, Check, Trash2,
  Link2, UserPlus, LogOut, Archive, GraduationCap, Info, MessageSquare, ArrowUpRight, Loader2, Paperclip,
} from 'lucide-react';
import { useApp } from '../lib/store';
import { useLocal } from '../lib/hooks';
import { go, appUrl } from '../lib/router';
import { ROLES, fmtShort, relDays, isPremium, ago, todayISO } from '../lib/format';
import { proposeDistribution, analyzeBrief } from '../lib/detect';
import { extractText } from '../lib/extract';
import { Btn, Chip, Mono, Avatar, AvatarStack, UnderlineTabs, Segmented, Empty, Spinner, Modal, SelectField, IconBtn } from '../components/ui';
import { ListView, BoardView } from '../components/TaskViews';
import { Messages, Files, DropZone } from '../components/Chat';

/* ---------------- Tareas ---------------- */
function AddTask({ p, coord, onDone }) {
  const { addTask, membersOf, uid, toast } = useApp();
  const [f, setF] = useState({ title: '', hours: '', due_date: '', assignee: '' });
  const [busy, setBusy] = useState(false);
  const team = membersOf(p.id).filter((m) => m.role !== 'docente');
  const submit = async (e) => {
    e.preventDefault();
    if (f.title.trim().length < 2) return;
    setBusy(true);
    const r = await addTask(p.id, { title: f.title.trim(), hours: f.hours ? Number(f.hours) : null, due_date: f.due_date || null, assignee: coord ? f.assignee || null : f.assignee === uid ? uid : null });
    setBusy(false);
    if (r) { toast('Tarea añadida.'); setF({ title: '', hours: '', due_date: '', assignee: '' }); onDone?.(); }
  };
  return (
    <form onSubmit={submit} className="anim-enter mb-4 grid gap-2 rounded-xl bg-card p-3 ring-1 ring-inset ring-line sm:grid-cols-[minmax(0,1fr)_90px_150px_170px_auto]">
      <label htmlFor="nt-title" className="sr-only">Tarea</label>
      <input id="nt-title" autoFocus value={f.title} maxLength={140} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="¿Qué hay que hacer?" className="field h-9" />
      <label htmlFor="nt-hours" className="sr-only">Horas</label>
      <input id="nt-hours" type="number" min="0.5" max="200" step="0.5" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} placeholder="Horas" className="field h-9" />
      <label htmlFor="nt-due" className="sr-only">Fecha</label>
      <input id="nt-due" type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} className="field h-9" />
      <SelectField id="nt-who" value={f.assignee} onChange={(v) => setF({ ...f, assignee: v })} className="[&_select]:h-9" aria-label="Responsable">
        <option value="">Sin asignar</option>
        {(coord ? team : team.filter((m) => m.user_id === uid)).map((m) => <option key={m.user_id} value={m.user_id}>{m.user_id === uid ? 'Yo' : m.profile?.display_name}</option>)}
      </SelectField>
      <Btn kind="primary" type="submit" loading={busy} disabled={f.title.trim().length < 2}>Añadir</Btn>
    </form>
  );
}

function Distribute({ p, open, onClose }) {
  const { tasks, membersOf, updateTask, toast, uid } = useApp();
  const team = membersOf(p.id).filter((m) => m.role !== 'docente');
  const ts = tasks.filter((t) => t.project_id === p.id);
  const [round, setRound] = useState(0);
  const [map, setMap] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setMap(proposeDistribution(ts, team.map((m) => m.user_id), round)); }, [open, round]); // eslint-disable-line react-hooks/exhaustive-deps
  const pending = ts.filter((t) => map[t.id] !== undefined);
  const hours = Object.fromEntries(team.map((m) => [m.user_id, ts.filter((t) => t.assignee === m.user_id && t.status !== 'lista').reduce((s, t) => s + (Number(t.hours) || 2), 0)]));
  pending.forEach((t) => { if (map[t.id]) hours[map[t.id]] = (hours[map[t.id]] || 0) + (Number(t.hours) || 2); });
  const apply = async () => {
    setBusy(true);
    let ok = 0;
    for (const t of pending) { if (map[t.id] && (await updateTask(t.id, { assignee: map[t.id] }))) ok++; }
    setBusy(false); onClose();
    if (ok) toast(`Repartiste ${ok} tareas. A cada persona le llegó un aviso para aceptar la suya.`);
  };
  return (
    <Modal open={open} onClose={onClose} title="Repartir tareas sin responsable" size="lg" labelledBy="dist-title"
           footer={<><Btn onClick={() => setRound(round + 1)} disabled={!pending.length}><Shuffle className="h-4 w-4" />Otra propuesta</Btn><Btn onClick={onClose}>Cancelar</Btn><Btn kind="primary" loading={busy} disabled={!pending.length} onClick={apply}>Asignar {pending.length} tareas</Btn></>}>
      {!pending.length ? <p className="text-[14px] text-fg-2">Todas las tareas abiertas ya tienen responsable.</p> : <>
        <p className="text-[13.5px] text-fg-2">Primero las tareas más largas, a quien tenga menos horas. Ajusta lo que quieras: cada persona debe aceptar su tarea.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {team.map((m) => <Chip key={m.user_id}><Avatar name={m.profile?.display_name} me={m.user_id === uid} size="sm" ring="hov" />{m.user_id === uid ? 'Tú' : m.profile?.display_name}: <span className="font-mono">{hours[m.user_id] || 0} h</span></Chip>)}
        </div>
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl ring-1 ring-inset ring-line">
          {pending.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 bg-card px-4 py-2.5">
              <span className="min-w-0 flex-1 truncate text-[13.5px]">{t.title}</span>
              <Mono className="text-fg-2">{Number(t.hours) || 2} h</Mono>
              <SelectField id={`dist-${t.id}`} value={map[t.id] || ''} onChange={(v) => setMap({ ...map, [t.id]: v })} className="w-44 [&_select]:h-8 [&_select]:text-[13px]" aria-label={`Responsable de ${t.title}`}>
                <option value="">Dejar sin asignar</option>
                {team.map((m) => <option key={m.user_id} value={m.user_id}>{m.user_id === uid ? 'Yo' : m.profile?.display_name}</option>)}
              </SelectField>
            </li>
          ))}
        </ul>
      </>}
    </Modal>
  );
}

function TasksTab({ p, role, route }) {
  const { tasks } = useApp();
  const [view, setView] = useLocal('r3-pview', 'lista');
  const [adding, setAdding] = useState(false);
  const [dist, setDist] = useState(false);
  const ts = tasks.filter((t) => t.project_id === p.id);
  const coord = role === 'coordinador';
  const unassigned = ts.filter((t) => !t.assignee && t.status !== 'lista').length;
  const canAdd = role !== 'docente' && p.status === 'activo';
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Vista" value={view} onChange={setView} options={[{ id: 'lista', label: 'Lista', icon: List }, { id: 'tablero', label: 'Tablero', icon: Columns3 }]} />
        <div className="flex flex-wrap gap-2">
          {coord && unassigned > 0 && <Btn kind="secondary" onClick={() => setDist(true)}><Shuffle className="h-4 w-4" />Repartir {unassigned}</Btn>}
          {canAdd && <Btn kind={ts.length ? 'secondary' : 'primary'} onClick={() => setAdding(!adding)}><Plus className="h-4 w-4" />Tarea</Btn>}
        </div>
      </div>
      {adding && <AddTask p={p} coord={coord} onDone={() => {}} />}
      {view === 'lista'
        ? <ListView tasks={ts} selectedId={route.query.tarea} empty={<Empty icon={ListChecks} title="Este proyecto aún no tiene tareas" text={coord ? 'Añádelas a mano o súbelas desde la consigna.' : 'La coordinación todavía no reparte el trabajo.'}>{canAdd && <Btn kind="primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Añadir tarea</Btn>}</Empty>} />
        : <BoardView tasks={ts} selectedId={route.query.tarea} />}
      {coord && <Distribute p={p} open={dist} onClose={() => setDist(false)} />}
    </div>
  );
}

/* ---------------- Chat ---------------- */
function ChatTab({ p, role }) {
  const { notifs, markRead } = useApp();
  useEffect(() => {
    const ids = notifs.filter((n) => !n.read_at && n.kind === 'mensaje' && n.project_id === p.id).map((n) => n.id);
    if (ids.length) markRead(ids);
  }, [notifs, p.id, markRead]);
  return (
    <div className="flex h-[calc(100dvh-260px)] min-h-[420px] flex-col rounded-xl bg-card p-4 ring-1 ring-inset ring-line sm:p-5">
      <Messages projectId={p.id} readOnly={role === 'docente'} premium={isPremium(p)} emptyText="Este es el chat del grupo. Lo que escriban aquí le llega como aviso a todos." />
    </div>
  );
}

/* ---------------- Equipo ---------------- */
function TeamTab({ p, role }) {
  const { membersOf, uid, setRole, removeMember, listInvites, createInvite, revokeInvite, toast } = useApp();
  const coord = role === 'coordinador';
  const ms = membersOf(p.id);
  const [invites, setInvites] = useState(null);
  const [newRole, setNewRole] = useState('integrante');
  const [copied, setCopied] = useState('');
  const [confirm, setConfirm] = useState(null);
  const load = async () => { if (coord) setInvites((await listInvites(p.id)) || []); };
  useEffect(() => { load(); }, [p.id, coord]); // eslint-disable-line react-hooks/exhaustive-deps
  const copy = async (code) => {
    const link = appUrl(`/unirse/${code}`);
    try { await navigator.clipboard.writeText(link); setCopied(code); setTimeout(() => setCopied(''), 2000); }
    catch (e) { toast(`Copia este enlace: ${link}`, { icon: 'info' }); }
  };
  const create = async () => { const inv = await createInvite(p.id, newRole); if (inv) { await load(); copy(inv.code); } };
  const live = (invites || []).filter((i) => new Date(i.expires_at) > new Date() && i.uses < i.max_uses);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section className="rounded-xl bg-card ring-1 ring-inset ring-line" aria-labelledby="tm-t">
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5"><h2 id="tm-t" className="text-[14px] font-semibold">Integrantes</h2><Mono className="text-fg-3">{ms.length} / 15</Mono></header>
        <ul className="divide-y divide-line">
          {ms.map((m) => {
            const me = m.user_id === uid;
            return (
              <li key={m.user_id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <Avatar name={m.profile?.display_name} me={me} size="lg" ring="card" />
                <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-medium">{m.profile?.display_name}{me && <span className="font-normal text-fg-2"> (tú)</span>}</span><span className="block text-[12px] text-fg-2">Se unió {ago(m.joined_at)}</span></span>
                {coord && !me ? (
                  <SelectField id={`role-${m.user_id}`} value={m.role} onChange={(v) => setRole(p.id, m.user_id, v)} className="w-40 [&_select]:h-8 [&_select]:text-[13px]" aria-label={`Rol de ${m.profile?.display_name}`}>
                    {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.short}</option>)}
                  </SelectField>
                ) : <Chip tone={m.role === 'coordinador' ? 'accent' : m.role === 'docente' ? 'violet' : 'neutral'}>{ROLES[m.role].short}</Chip>}
                {coord && !me && <IconBtn label={`Retirar a ${m.profile?.display_name}`} onClick={() => setConfirm(m)} className="hover:text-red"><Trash2 className="h-4 w-4" /></IconBtn>}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex flex-col gap-6">
        {coord && (
          <section className="rounded-xl bg-card p-5 ring-1 ring-inset ring-line" aria-labelledby="inv-t">
            <h2 id="inv-t" className="flex items-center gap-2 text-[14px] font-semibold"><UserPlus className="h-4 w-4 text-fg-3" />Invitar</h2>
            <p className="mt-1 text-[13px] text-fg-2">Comparte un enlace. Quien lo abra crea su cuenta y entra con el rol que elijas.</p>
            <div className="mt-4 flex gap-2">
              <SelectField id="inv-role" value={newRole} onChange={setNewRole} className="flex-1" aria-label="Rol del enlace">
                <option value="integrante">Integrante</option><option value="revisor">Revisor</option><option value="docente">Docente (solo lectura)</option>
              </SelectField>
              <Btn kind="primary" onClick={create}><Link2 className="h-4 w-4" />Crear enlace</Btn>
            </div>
            {invites === null ? <Spinner /> : live.length > 0 && (
              <ul className="mt-4 flex flex-col gap-2">
                {live.map((i) => (
                  <li key={i.code} className="flex items-center gap-2 rounded-lg bg-hov p-2.5 ring-1 ring-inset ring-line">
                    <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium">{ROLES[i.role].short}</span><span className="block text-[11.5px] text-fg-2">{i.uses} de {i.max_uses} usos, vence {relDays(new Date(i.expires_at).toLocaleDateString('en-CA', { timeZone: 'America/Lima' }))}</span></span>
                    <Btn size="xs" kind="secondary" onClick={() => copy(i.code)}>{copied === i.code ? <><Check className="h-3.5 w-3.5" />Copiado</> : <><Copy className="h-3.5 w-3.5" />Copiar</>}</Btn>
                    <IconBtn label="Desactivar enlace" onClick={async () => { await revokeInvite(i.code); load(); }} className="h-7 w-7 hover:text-red"><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        <section className="rounded-xl bg-card p-5 ring-1 ring-inset ring-line" aria-labelledby="roles-t">
          <h2 id="roles-t" className="text-[14px] font-semibold">Qué puede hacer cada rol</h2>
          <dl className="mt-3 flex flex-col gap-3 text-[13px]">
            {Object.entries(ROLES).map(([k, v]) => <div key={k}><dt className="font-medium">{v.short}</dt><dd className="text-fg-2">{v.desc}</dd></div>)}
          </dl>
        </section>
      </div>
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Retirar del grupo" size="sm" labelledBy="rm-title"
             footer={<><Btn onClick={() => setConfirm(null)}>Cancelar</Btn><Btn kind="danger" onClick={async () => { await removeMember(p.id, confirm.user_id); setConfirm(null); }}>Retirar</Btn></>}>
        <p className="text-[14px]">{confirm?.profile?.display_name} dejará de ver el proyecto. Sus tareas abiertas quedarán sin asignar.</p>
      </Modal>
    </div>
  );
}

/* ---------------- Consigna ---------------- */
function BriefTab({ p, role }) {
  const { updateProject, addTask, tasks, toast } = useApp();
  const coord = role === 'coordinador';
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState(null);
  const existing = new Set(tasks.filter((t) => t.project_id === p.id).map((t) => t.title.toLowerCase()));
  const upload = async (fs) => {
    setBusy(true);
    try {
      const out = await extractText(fs[0]);
      await updateProject(p.id, { brief_text: out.text.slice(0, 100000), brief_file: out.fileName.slice(0, 200) }, 'Consigna actualizada.');
    } catch (e) { toast(e.message, { icon: 'error' }); }
    setBusy(false);
  };
  const detect = () => setFound(analyzeBrief(p.brief_text, Number((p.due_date || todayISO()).slice(0, 4))).filter((x) => !existing.has(x.title.toLowerCase())).map((x) => ({ ...x, on: true })));
  const addFound = async () => {
    const list = found.filter((x) => x.on);
    setBusy(true);
    for (const x of list) await addTask(p.id, { title: x.title, hours: x.hours, due_date: x.due || null });
    setBusy(false); setFound(null);
    toast(`Añadiste ${list.length} tareas.`);
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <section className="rounded-xl bg-card ring-1 ring-inset ring-line" aria-labelledby="br-t">
        <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
          <h2 id="br-t" className="text-[14px] font-semibold">Consigna</h2>
          {p.brief_file && <Chip><FileText className="h-3 w-3" />{p.brief_file}</Chip>}
          {coord && p.brief_text && <Btn size="sm" kind="secondary" className="ml-auto" onClick={detect}><ListChecks className="h-4 w-4" />Detectar tareas</Btn>}
        </header>
        {p.brief_text ? <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap px-5 py-4 text-[14px] leading-relaxed">{p.brief_text}</div>
          : <p className="px-5 py-8 text-[14px] text-fg-2">{coord ? 'Todavía no subiste la consigna.' : 'La coordinación todavía no subió la consigna.'}</p>}
      </section>
      <div className="flex flex-col gap-6">
        {coord && <DropZone compact multiple={false} id="br-file" busy={busy} onFiles={upload} accept=".pdf,.docx,.txt,.md" label={p.brief_text ? 'Reemplazar la consigna' : 'Subir la consigna'} hint="PDF, Word o texto. Se lee en tu dispositivo." />}
        <section className="rounded-xl bg-card p-5 ring-1 ring-inset ring-line">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold"><Paperclip className="h-4 w-4 text-fg-3" />Archivos del grupo</h2>
          <div className="mt-3"><Files projectId={p.id} readOnly={role === 'docente'} /></div>
        </section>
      </div>
      <Modal open={!!found} onClose={() => setFound(null)} title="Tareas detectadas en la consigna" size="lg" labelledBy="det-title"
             footer={<><Btn onClick={() => setFound(null)}>Cancelar</Btn><Btn kind="primary" loading={busy} disabled={!found?.some((x) => x.on)} onClick={addFound}>Añadir {found?.filter((x) => x.on).length || 0}</Btn></>}>
        {found?.length === 0 ? <p className="text-[14px] text-fg-2">No encontramos tareas nuevas (con viñetas o verbos de entrega) que no estén ya en el proyecto.</p> : <>
          <p className="mb-3 flex items-start gap-2 text-[12.5px] text-fg-2"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />Detección por formato, sin IA. Marca solo las que correspondan.</p>
          <ul className="divide-y divide-line overflow-hidden rounded-xl ring-1 ring-inset ring-line">
            {found?.map((x, i) => (
              <li key={i}><label className="flex cursor-pointer items-center gap-3 bg-card px-4 py-2.5 hover:bg-hov">
                <input type="checkbox" checked={x.on} onChange={() => setFound(found.map((y, j) => (j === i ? { ...y, on: !y.on } : y)))} className="h-4 w-4 rounded accent-[rgb(var(--accent))]" />
                <span className="min-w-0 flex-1 text-[13.5px]">{x.title}</span><Mono className="text-fg-3">línea {x.line}</Mono>
              </label></li>
            ))}
          </ul>
        </>}
      </Modal>
    </div>
  );
}

/* ---------------- Ajustes ---------------- */
function SettingsTab({ p, role }) {
  const { updateProject, deleteProject, removeMember, uid, membersOf } = useApp();
  const coord = role === 'coordinador';
  const [f, setF] = useState({ name: p.name, course: p.course, due_date: p.due_date || '' });
  const [del, setDel] = useState('');
  const [leave, setLeave] = useState(false);
  const coords = membersOf(p.id).filter((m) => m.role === 'coordinador').length;
  return (
    <div className="grid max-w-2xl gap-6">
      {coord && (
        <form onSubmit={(e) => { e.preventDefault(); updateProject(p.id, { name: f.name.trim(), course: f.course.trim(), due_date: f.due_date || null }, 'Cambios guardados.'); }}
              className="rounded-xl bg-card p-5 ring-1 ring-inset ring-line">
          <h2 className="text-[14px] font-semibold">Datos del proyecto</h2>
          <div className="mt-4 grid gap-4">
            <div className="flex flex-col gap-1.5"><label htmlFor="ps-name" className="label">Nombre</label><input id="ps-name" value={f.name} maxLength={90} onChange={(e) => setF({ ...f, name: e.target.value })} className="field" /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5"><label htmlFor="ps-course" className="label">Curso</label><input id="ps-course" value={f.course} maxLength={60} onChange={(e) => setF({ ...f, course: e.target.value })} className="field" /></div>
              <div className="flex flex-col gap-1.5"><label htmlFor="ps-due" className="label">Fecha de entrega</label><input id="ps-due" type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} className="field" /></div>
            </div>
          </div>
          <Btn kind="primary" type="submit" className="mt-5" disabled={f.name.trim().length < 2}>Guardar</Btn>
        </form>
      )}
      <section className="rounded-xl bg-card p-5 ring-1 ring-inset ring-line">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold"><Sparkles className="h-4 w-4 text-accent" />Plan</h2>
        <p className="mt-1 text-[13.5px] text-fg-2">{isPremium(p) ? 'Premium activo: chat, avisos en el celular y recordatorios automáticos. Gratis durante el lanzamiento.' : 'Plan gratis: tareas y reparto. El chat y los recordatorios son parte de Premium.'}</p>
      </section>
      {coord && (
        <section className="rounded-xl bg-card p-5 ring-1 ring-inset ring-line">
          <h2 className="text-[14px] font-semibold">{p.status === 'activo' ? 'Archivar' : 'Reactivar'}</h2>
          <p className="mt-1 text-[13.5px] text-fg-2">{p.status === 'activo' ? 'Cuando entreguen, archiva el proyecto: deja de aparecer en Inicio y no se puede editar.' : 'El proyecto está archivado. Reactívalo para seguir trabajando.'}</p>
          <Btn kind="secondary" className="mt-4" onClick={() => updateProject(p.id, { status: p.status === 'activo' ? 'archivado' : 'activo' }, p.status === 'activo' ? 'Proyecto archivado.' : 'Proyecto reactivado.')}><Archive className="h-4 w-4" />{p.status === 'activo' ? 'Archivar proyecto' : 'Reactivar proyecto'}</Btn>
        </section>
      )}
      {!(coord && coords === 1) && (
        <section className="rounded-xl bg-card p-5 ring-1 ring-inset ring-line">
          <h2 className="text-[14px] font-semibold">Salir del proyecto</h2>
          <p className="mt-1 text-[13.5px] text-fg-2">Dejarás de verlo. Tus tareas abiertas quedarán sin asignar.</p>
          {!leave ? <Btn kind="danger" className="mt-4" onClick={() => setLeave(true)}><LogOut className="h-4 w-4" />Salir</Btn>
            : <div className="mt-4 flex gap-2"><Btn onClick={() => setLeave(false)}>Cancelar</Btn><Btn kind="danger" onClick={async () => { if (await removeMember(p.id, uid, 'Saliste del proyecto.')) go('/'); }}>Sí, salir</Btn></div>}
        </section>
      )}
      {coord && (
        <section className="rounded-xl bg-red/[.04] p-5 ring-1 ring-inset ring-red/20">
          <h2 className="text-[14px] font-semibold text-red">Eliminar proyecto</h2>
          <p className="mt-1 text-[13.5px] text-fg-2">Se borran para todos las tareas, el chat y los archivos. No se puede deshacer.</p>
          <label htmlFor="ps-del" className="mt-4 block text-[13px]">Escribe <strong>{p.name}</strong> para confirmar</label>
          <div className="mt-2 flex flex-wrap gap-2">
            <input id="ps-del" value={del} onChange={(e) => setDel(e.target.value)} className="field min-w-0 flex-1" />
            <Btn kind="danger" disabled={del !== p.name} onClick={async () => { if (await deleteProject(p.id)) go('/'); }}><Trash2 className="h-4 w-4" />Eliminar</Btn>
          </div>
        </section>
      )}
    </div>
  );
}

/* ---------------- página ---------------- */
export default function ProjectPage({ id, tab, route }) {
  const { project, loaded, tasks, membersOf, uid, notifs } = useApp();
  const p = project(id);
  const ts = useMemo(() => tasks.filter((t) => t.project_id === id), [tasks, id]);
  if (!loaded) return <Spinner />;
  if (!p) return <Empty icon={Info} title="No encontramos este proyecto" text="Puede que lo hayan eliminado o que ya no estés en el grupo."><Btn kind="primary" onClick={() => go('/')}>Ir al inicio</Btn></Empty>;
  const role = p.myRole;
  const done = ts.filter((t) => t.status === 'lista').length;
  const pct = ts.length ? Math.round((done / ts.length) * 100) : 0;
  const chatUnread = notifs.filter((n) => !n.read_at && n.kind === 'mensaje' && n.project_id === id).length;
  const tabs = [
    { id: 'tareas', label: 'Tareas', icon: ListChecks, count: ts.filter((t) => t.status !== 'lista').length },
    { id: 'chat', label: 'Chat', icon: MessageCircle, count: chatUnread, alert: chatUnread > 0 },
    { id: 'equipo', label: 'Equipo', icon: Users, count: membersOf(id).length },
    { id: 'consigna', label: 'Consigna', icon: FileText },
    { id: 'ajustes', label: 'Ajustes', icon: Settings },
  ];
  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={role === 'coordinador' ? 'accent' : role === 'docente' ? 'violet' : 'neutral'}>{role === 'docente' && <GraduationCap className="h-3 w-3" />}{ROLES[role].short}</Chip>
            {isPremium(p) && <Chip tone="accent"><Sparkles className="h-3 w-3" />Premium</Chip>}
            {p.status === 'archivado' && <Chip><Archive className="h-3 w-3" />Archivado</Chip>}
          </div>
          <h2 className="mt-3 text-[26px] font-semibold leading-tight tracking-[-0.03em] sm:text-[30px]" style={{ textWrap: 'balance' }}>{p.name}</h2>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13.5px] text-fg-2">
            {p.course && <span>{p.course}</span>}
            <span className="inline-flex items-center gap-1.5"><Calendar className="h-4 w-4 text-fg-3" />{p.due_date ? `Entrega ${fmtShort(p.due_date)}, ${relDays(p.due_date)}` : 'Sin fecha de entrega'}</span>
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-36"><p className="flex justify-between text-[12px] text-fg-2"><span>Avance</span><Mono>{done}/{ts.length}</Mono></p>
            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-hov2"><span className="block h-full rounded-full bg-fg transition-[width] duration-700" style={{ width: `${pct}%` }} /></span></div>
          <AvatarStack ring="canvas" people={membersOf(id).map((m) => ({ id: m.user_id, name: m.profile?.display_name || '?', me: m.user_id === uid }))} />
        </div>
      </header>
      <div className="mb-6 border-b border-line">
        <UnderlineTabs label="Secciones del proyecto" value={tab} onChange={(t) => go(`/p/${id}${t === 'tareas' ? '' : `/${t}`}`)} tabs={tabs} />
      </div>
      <div key={tab} className="anim-enter">
        {tab === 'tareas' && <TasksTab p={p} role={role} route={route} />}
        {tab === 'chat' && <ChatTab p={p} role={role} />}
        {tab === 'equipo' && <TeamTab p={p} role={role} />}
        {tab === 'consigna' && <BriefTab p={p} role={role} />}
        {tab === 'ajustes' && <SettingsTab p={p} role={role} />}
      </div>
    </div>
  );
}
