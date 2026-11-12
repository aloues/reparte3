import { useEffect, useMemo, useState } from 'react';
import {
  ListChecks, MessageCircle, Users, FileText, Settings, List, Columns3, Plus, Shuffle, Calendar, Sparkles, Copy, Check, Trash2,
  Link2, UserPlus, LogOut, Archive, GraduationCap, Info, Paperclip, LayoutDashboard, GitBranch, Activity as ActivityIcon,
} from 'lucide-react';
import { useApp } from '../lib/store';
import { useLocal } from '../lib/hooks';
import { go, appUrl } from '../lib/router';
import { ROLES, fmtShort, relDays, isPremium, ago, todayISO } from '../lib/format';
import { proposeDistribution } from '../lib/detect';
import { Btn, Chip, Mono, Avatar, AvatarStack, UnderlineTabs, Segmented, Empty, Spinner, Modal, SelectField, IconBtn } from '../components/ui';
import { ListView, BoardView, openTask } from '../components/TaskViews';
import { Messages } from '../components/Chat';
import Wizard from '../components/Wizard';
import Summary from '../components/project/Summary';
import Flow from '../components/project/Flow';
import Brief from '../components/project/Brief';
import Resources from '../components/project/Resources';
import ActivityFeed from '../components/project/ActivityFeed';
import { progressOf } from '../lib/center';
import { followUp, TRACK } from '../lib/plan';

/* ---------------- Mis tareas por aceptar: aceptar la lista completa ---------------- */
function MyPending({ p, role }) {
  const { tasks, uid, taskAction, toast } = useApp();
  const [busy, setBusy] = useState(false);
  if (role === 'docente' || p.status !== 'activo') return null;
  const mine = tasks.filter((t) => t.project_id === p.id && t.assignee === uid && !t.accepted && t.status !== 'lista');
  if (!mine.length) return null;
  const hours = mine.reduce((s, t) => s + (Number(t.hours) || 2), 0);
  const acceptAll = async () => {
    setBusy(true);
    let ok = 0;
    for (const t of mine) { if (await taskAction(t.id, 'aceptar')) ok++; }
    setBusy(false);
    if (ok) toast(ok === 1 ? 'Aceptaste tu tarea.' : `Aceptaste tus ${ok} tareas.`);
  };
  return (
    <section className="anim-enter mb-5 rounded-xl bg-amber/[.07] p-4 ring-1 ring-inset ring-amber/25" aria-label="Tareas por aceptar">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-[14px]">
          <span className="font-semibold">{mine.length === 1 ? 'Te tocó 1 tarea' : `Te tocaron ${mine.length} tareas`}</span>
          <span className="text-fg-2"> · {hours} h en total. Revísalas y acéptalas para que el grupo sepa que cuenta contigo.</span>
        </p>
        <Btn kind="primary" loading={busy} onClick={acceptAll} id="accept-all"><Check className="sw-bold h-4 w-4" />{mine.length === 1 ? 'Aceptar' : 'Aceptar todas'}</Btn>
      </div>
      <ul className="mt-3 flex flex-col gap-1.5">
        {mine.map((t) => (
          <li key={t.id}><button type="button" onClick={() => openTask(t.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-amber/10">
            <span className="min-w-0 flex-1 truncate">{t.title}</span><Mono className="shrink-0 text-fg-2">{Number(t.hours) || 2} h</Mono><span className="shrink-0 text-fg-2">{fmtShort(t.due_date)}</span>
          </button></li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-fg-2">Si no puedes con alguna, ábrela y elige «No puedo» con el motivo: la coordinación la reasigna.</p>
    </section>
  );
}

/* ---------------- Seguimiento por checkpoints ---------------- */
function FollowStrip({ p, role }) {
  const { checkpoints, tasks, membersOf, uid, releaseReserved } = useApp();
  const [busy, setBusy] = useState(false);
  const cps = checkpoints.filter((c) => c.project_id === p.id);
  const ts = tasks.filter((t) => t.project_id === p.id);
  const team = membersOf(p.id).filter((m) => m.role !== 'docente');
  const reserved = ts.filter((t) => t.reserved && !t.assignee && t.status !== 'lista');
  if (!cps.length && !reserved.length) return null;
  const f = followUp(cps, ts, team.map((m) => m.user_id), todayISO());
  const missing = Math.max(0, (p.expected_members || 0) - team.length);
  const people = team.filter((m) => f.byPerson[m.user_id]);
  return (
    <section className="mb-5 rounded-xl bg-card p-4 ring-1 ring-inset ring-line" aria-label="Seguimiento del plan">
      {cps.length > 0 && <>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[13.5px] font-semibold">Checkpoints</h3>
          {f.group && <Chip tone={TRACK[f.group].tone}>Grupo: {TRACK[f.group].label}</Chip>}
        </div>
        <ol className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
          {f.checkpoints.map((c) => (
            <li key={c.id} className={`min-w-[150px] flex-1 rounded-lg p-2.5 ring-1 ring-inset ${c.status === 'atrasado' ? 'bg-red/[.05] ring-red/25' : c.status === 'riesgo' ? 'bg-amber/[.06] ring-amber/30' : 'ring-line'}`}>
              <p className="flex items-center justify-between gap-2 text-[12px] text-fg-2"><span>{fmtShort(c.due_date)}</span><Mono>{c.done}/{c.tasks.length}</Mono></p>
              <p className="mt-0.5 truncate text-[13px] font-medium" title={c.title}>{c.title}</p>
              <p className={`mt-1 text-[11.5px] font-medium ${c.status === 'atrasado' ? 'text-red' : c.status === 'riesgo' ? 'text-amber' : 'text-fg-2'}`}>{TRACK[c.status].label}</p>
            </li>
          ))}
        </ol>
        {people.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px]">
            {people.map((m) => (
              <li key={m.user_id} className="flex items-center gap-1.5">
                <Avatar name={m.profile?.display_name} me={m.user_id === uid} size="sm" ring="card" />
                <span className="text-fg-2">{m.user_id === uid ? 'Tú' : m.profile?.display_name}:</span>
                <span className={f.byPerson[m.user_id] === 'atrasado' ? 'font-medium text-red' : f.byPerson[m.user_id] === 'riesgo' ? 'font-medium text-amber' : 'text-fg'}>{TRACK[f.byPerson[m.user_id]].label}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11.5px] text-fg-3">En riesgo: algo sin empezar a 2 días del checkpoint o un bloqueo. Atrasado: pasó la fecha con tareas sin entregar.</p>
      </>}
      {reserved.length > 0 && (
        <div className={`flex flex-wrap items-center gap-3 ${cps.length ? 'mt-4 border-t border-line pt-4' : ''}`}>
          <p className="min-w-0 flex-1 text-[13px]">
            <span className="font-medium text-accent">{reserved.length === 1 ? '1 tarea reservada' : `${reserved.length} tareas reservadas`}</span>
            <span className="text-fg-2"> {missing > 0 ? `para ${missing === 1 ? 'la persona que falta' : `las ${missing} personas que faltan`}. Se asignan solas cuando entren.` : 'esperando a alguien más.'}</span>
          </p>
          {role === 'coordinador' && <Btn kind="secondary" size="sm" loading={busy} onClick={async () => { setBusy(true); await releaseReserved(p.id); setBusy(false); }}>Ya estamos todos: repartir</Btn>}
        </div>
      )}
    </section>
  );
}

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
  const ts = tasks.filter((t) => t.project_id === p.id && !t.reserved);
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
           footer={<><Btn onClick={() => setRound(round + 1)} disabled={!pending.length}><Shuffle className="h-4 w-4" />Otra propuesta</Btn><Btn onClick={onClose}>Cancelar</Btn><Btn kind="primary" loading={busy} disabled={!pending.length} onClick={apply}>{pending.length === 1 ? 'Asignar 1 tarea' : `Asignar ${pending.length} tareas`}</Btn></>}>
      {!pending.length ? <p className="text-[14px] text-fg-2">Todas las tareas abiertas ya tienen responsable.</p> : <>
        <p className="text-[13.5px] text-fg-2">Primero las tareas más largas, a quien tenga menos horas. Ajusta lo que quieras: cada persona debe aceptar su tarea.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {team.map((m) => <Chip key={m.user_id}><Avatar name={m.profile?.display_name} me={m.user_id === uid} size="sm" ring="hov" />{m.user_id === uid ? 'Tú' : m.profile?.display_name}: <span className="font-mono">{hours[m.user_id] || 0} h</span></Chip>)}
        </div>
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl ring-1 ring-inset ring-line">
          {pending.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-card px-4 py-2.5">
              <span className="min-w-0 basis-full text-[13.5px] leading-5 sm:basis-0 sm:flex-1 sm:truncate">{t.title}</span>
              <Mono className="text-fg-2">{Number(t.hours) || 2} h</Mono>
              <SelectField id={`dist-${t.id}`} value={map[t.id] || ''} onChange={(v) => setMap({ ...map, [t.id]: v })} className="min-w-0 flex-1 sm:w-44 sm:flex-none [&_select]:h-8 [&_select]:text-[13px]" aria-label={`Responsable de ${t.title}`}>
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
  const [plan, setPlan] = useState(false);
  const ts = tasks.filter((t) => t.project_id === p.id);
  const coord = role === 'coordinador';
  const unassigned = ts.filter((t) => !t.assignee && !t.reserved && t.status !== 'lista').length;
  const canAdd = role !== 'docente' && p.status === 'activo';
  return (
    <div>
      {coord && p.status === 'activo' && !ts.length && (
        <section className="anim-enter mb-5 flex flex-wrap items-center gap-4 rounded-xl bg-accent/[.06] p-5 ring-1 ring-inset ring-accent/30">
          <Sparkles className="h-6 w-6 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold">Arma el plan del grupo</h3>
            <p className="mt-0.5 text-[13px] text-fg-2">Sube la consigna, conviértela en tareas con IA (gratis) y repártelas en partes iguales con checkpoints.</p>
          </div>
          <Btn kind="primary" onClick={() => setPlan(true)}>Subir consigna y repartir</Btn>
        </section>
      )}
      <MyPending p={p} role={role} />
      <FollowStrip p={p} role={role} />
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
      {coord && <Wizard open={plan} projectId={p.id} onClose={() => setPlan(false)} />}
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
  const prog = progressOf(ts);
  const chatUnread = notifs.filter((n) => !n.read_at && n.kind === 'mensaje' && n.project_id === id).length;
  const toTab = (t) => go(`/p/${id}${t === 'resumen' ? '' : `/${t}`}`);
  const tabs = [
    { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
    { id: 'tareas', label: 'Tareas', icon: ListChecks, count: ts.filter((t) => t.status !== 'lista').length },
    { id: 'flujo', label: 'Flujo', icon: GitBranch },
    { id: 'consigna', label: 'Consigna', icon: FileText },
    { id: 'archivos', label: 'Archivos', icon: Paperclip },
    { id: 'chat', label: 'Chat', icon: MessageCircle, count: chatUnread, alert: chatUnread > 0 },
    { id: 'actividad', label: 'Actividad', icon: ActivityIcon },
    { id: 'equipo', label: 'Equipo', icon: Users, count: membersOf(id).length },
  ];
  return (
    <div>
      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 sm:flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={role === 'coordinador' ? 'accent' : role === 'docente' ? 'violet' : 'neutral'}>{role === 'docente' && <GraduationCap className="h-3 w-3" />}{ROLES[role].short}</Chip>
            {isPremium(p) && <Chip tone="accent"><Sparkles className="h-3 w-3" />Premium</Chip>}
            {p.status === 'archivado' && <Chip><Archive className="h-3 w-3" />Archivado</Chip>}
          </div>
          <h2 className="mt-3 text-[26px] font-semibold leading-tight tracking-[-0.03em] sm:text-[32px]" style={{ textWrap: 'balance' }}>{p.name}</h2>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13.5px] text-fg-2">
            {p.course && <span>{p.course}</span>}
            <span className="inline-flex items-center gap-1.5"><Calendar className="h-4 w-4 text-fg-3" />{p.due_date ? `Entrega ${fmtShort(p.due_date)}, ${relDays(p.due_date)}` : 'Sin fecha de entrega'}</span>
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1 sm:w-40 sm:flex-none" title="Cuenta como avance una tarea aprobada">
            <p className="flex justify-between text-[12px] text-fg-2"><span>Avance aprobado</span><Mono>{prog.done}/{prog.total}</Mono></p>
            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-hov2" role="img" aria-label={`${prog.pct}% aprobado`}><span className="block h-full rounded-full bg-fg transition-[width] duration-700" style={{ width: `${prog.pct}%` }} /></span>
          </div>
          <button type="button" onClick={() => toTab('equipo')} aria-label="Ver equipo" className="rounded-full"><AvatarStack ring="canvas" people={membersOf(id).map((m) => ({ id: m.user_id, name: m.profile?.display_name || '?', me: m.user_id === uid }))} /></button>
          <IconBtn label="Ajustes del proyecto" onClick={() => toTab('ajustes')} className={`h-9 w-9 ring-1 ring-inset ring-line ${tab === 'ajustes' ? 'bg-hov2 text-fg' : ''}`}><Settings className="h-4 w-4" /></IconBtn>
        </div>
      </header>
      <div className="mb-6 border-b border-line">
        <UnderlineTabs label="Secciones del proyecto" value={tab} onChange={toTab} tabs={tabs} />
      </div>
      <div key={tab} className="anim-enter">
        {tab === 'resumen' && <Summary p={p} role={role} onTab={toTab} />}
        {tab === 'tareas' && <TasksTab p={p} role={role} route={route} />}
        {tab === 'flujo' && <Flow p={p} />}
        {tab === 'consigna' && <Brief p={p} role={role} />}
        {tab === 'archivos' && <Resources p={p} role={role} onTab={toTab} />}
        {tab === 'chat' && <ChatTab p={p} role={role} />}
        {tab === 'actividad' && <ActivityFeed p={p} />}
        {tab === 'equipo' && <TeamTab p={p} role={role} />}
        {tab === 'ajustes' && <SettingsTab p={p} role={role} />}
      </div>
    </div>
  );
}
