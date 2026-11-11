import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, errMsg } from './supabase';
import { localNotify, currentSubscription } from './push';
import { appUrl } from './router';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [session, setSession] = useState(undefined);   // undefined = cargando
  const [profile, setProfile] = useState(undefined);   // null = falta completar perfil
  const [recovery, setRecovery] = useState(false);
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState({});          // project_id -> [{ user_id, role, joined_at, profile }]
  const [tasks, setTasks] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [online, setOnline] = useState(navigator.onLine);
  const toastId = useRef(0);
  const pushActive = useRef(false);
  const uid = session?.user?.id;

  /* ---------- avisos en pantalla ---------- */
  const toast = useCallback((text, opts = {}) => {
    const id = ++toastId.current;
    setToasts((ts) => [...ts.slice(-2), { id, text, ...opts }]);
  }, []);
  const dismiss = useCallback((id) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const fail = useCallback((e) => { toast(errMsg(e), { icon: 'error' }); }, [toast]);

  /* ---------- sesión ---------- */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((ev, s) => {
      setSession(s ?? null);
      if (ev === 'PASSWORD_RECOVERY') setRecovery(true);
    });
    const on = () => setOnline(navigator.onLine);
    window.addEventListener('online', on); window.addEventListener('offline', on);
    return () => { sub.subscription.unsubscribe(); window.removeEventListener('online', on); window.removeEventListener('offline', on); };
  }, []);

  const loadProfile = useCallback(async () => {
    if (!uid) { setProfile(undefined); return; }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (error) { fail(error); return; }
    setProfile(data ?? null);
  }, [uid, fail]);
  useEffect(() => { loadProfile(); }, [loadProfile]);

  /* ---------- datos ---------- */
  const loadAll = useCallback(async () => {
    if (!uid) return;
    const { data: mine, error } = await supabase.from('memberships').select('role, project:projects(*)').eq('user_id', uid);
    if (error) { fail(error); return; }
    const projs = (mine || []).filter((m) => m.project).map((m) => ({ ...m.project, myRole: m.role }))
      .sort((a, b) => (a.status === b.status ? (a.due_date || '9999').localeCompare(b.due_date || '9999') : a.status === 'activo' ? -1 : 1));
    const ids = projs.map((p) => p.id);
    let ms = [], ts = [];
    if (ids.length) {
      const [a, b] = await Promise.all([
        supabase.from('memberships').select('project_id, user_id, role, joined_at, profile:profiles(display_name, level)').in('project_id', ids),
        supabase.from('tasks').select('*').in('project_id', ids).order('seq'),
      ]);
      if (a.error || b.error) { fail(a.error || b.error); return; }
      ms = a.data; ts = b.data;
    }
    const byProject = {};
    ms.forEach((m) => { (byProject[m.project_id] ||= []).push(m); });
    Object.values(byProject).forEach((l) => l.sort((x, y) => x.joined_at.localeCompare(y.joined_at)));
    setProjects(projs); setMembers(byProject); setTasks(ts); setLoaded(true);
  }, [uid, fail]);

  const loadNotifs = useCallback(async () => {
    if (!uid) return;
    const { data } = await supabase.from('notifications').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(80);
    setNotifs(data || []);
  }, [uid]);

  useEffect(() => {
    if (!uid || !profile) { setLoaded(false); return; }
    loadAll(); loadNotifs();
    currentSubscription().then((s) => { pushActive.current = !!s; });
  }, [uid, profile, loadAll, loadNotifs]);

  /* ---------- tiempo real ---------- */
  const projectIds = useMemo(() => new Set(projects.map((p) => p.id)), [projects]);
  const idsRef = useRef(projectIds); idsRef.current = projectIds;
  const reloadTimer = useRef(null);
  const softReload = useCallback(() => { clearTimeout(reloadTimer.current); reloadTimer.current = setTimeout(loadAll, 150); }, [loadAll]);

  useEffect(() => {
    if (!uid || !profile) return undefined;
    const ch = supabase.channel(`r3-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (p) => {
        if (p.eventType === 'DELETE') { setTasks((ts) => ts.filter((t) => t.id !== p.old.id)); return; }
        const row = p.new;
        if (!idsRef.current.has(row.project_id)) return;
        setTasks((ts) => { const i = ts.findIndex((t) => t.id === row.id); if (i < 0) return [...ts, row]; const c = ts.slice(); c[i] = row; return c; });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'memberships' }, softReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, softReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, (p) => {
        if (p.eventType === 'DELETE') { setNotifs((ns) => ns.filter((n) => n.id !== p.old.id)); return; }
        const n = p.new;
        setNotifs((ns) => [n, ...ns.filter((x) => x.id !== n.id)].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 80));
        // Aviso nuevo o reagrupado (el chat se agrupa cada 10 min): ni leído ni ya enviado por push.
        if (!n.read_at && !n.push_sent_at) {
          const url = n.task_id ? appUrl(`/p/${n.project_id}?tarea=${n.task_id}`) : n.project_id ? appUrl(`/p/${n.project_id}${n.kind === 'mensaje' ? '/chat' : ''}`) : appUrl('/');
          if (document.hidden) { if (!pushActive.current) localNotify(n.title, n.body, url); }
          else toast(n.title, { icon: 'bell', notif: n });
        }
      })
      .subscribe();
    const onFocus = () => { loadAll(); loadNotifs(); };
    window.addEventListener('focus', onFocus);
    return () => { supabase.removeChannel(ch); window.removeEventListener('focus', onFocus); };
  }, [uid, profile, softReload, loadAll, loadNotifs, toast]);

  /* ---------- acciones ---------- */
  const run = useCallback(async (fn, okMsg) => {
    try { const r = await fn(); if (r?.error) throw r.error; if (okMsg) toast(okMsg); return r?.data ?? r ?? true; }
    catch (e) { fail(e); return null; }
  }, [toast, fail]);

  const upsertTask = (row) => row && setTasks((ts) => { const i = ts.findIndex((t) => t.id === row.id); if (i < 0) return [...ts, row]; const c = ts.slice(); c[i] = row; return c; });

  const api = useMemo(() => ({
    reload: loadAll,
    reloadProfile: loadProfile,
    async createProject(f) {
      const id = await run(() => supabase.rpc('create_project', { p_name: f.name, p_course: f.course || '', p_due: f.due || null, p_brief: f.brief || null, p_brief_file: f.briefFile || null, p_tasks: f.tasks || [] }));
      if (id) await loadAll();
      return id;
    },
    async updateProject(id, patch, msg) { const r = await run(() => supabase.from('projects').update(patch).eq('id', id).select().single(), msg); if (r) await loadAll(); return r; },
    async deleteProject(id) { const r = await run(() => supabase.from('projects').delete().eq('id', id), 'Proyecto eliminado.'); if (r) await loadAll(); return r; },
    async taskAction(id, action, note, url) {
      const r = await run(() => supabase.rpc('task_action', { p_task: id, p_action: action, p_note: note || null, p_url: url || null }));
      if (r) upsertTask(r);
      return r;
    },
    async addTask(projectId, f) {
      const r = await run(() => supabase.from('tasks').insert({ project_id: projectId, title: f.title, description: f.description || '', hours: f.hours || null, due_date: f.due_date || null, assignee: f.assignee || null }).select().single());
      if (r) upsertTask(r);
      return r;
    },
    async updateTask(id, patch, msg) { const r = await run(() => supabase.from('tasks').update(patch).eq('id', id).select().single(), msg); if (r) upsertTask(r); return r; },
    async deleteTask(id) { const r = await run(() => supabase.from('tasks').delete().eq('id', id), 'Tarea eliminada.'); if (r) setTasks((ts) => ts.filter((t) => t.id !== id)); return r; },
    async setRole(projectId, userId, role) { const r = await run(() => supabase.from('memberships').update({ role }).eq('project_id', projectId).eq('user_id', userId), 'Rol actualizado.'); if (r) await loadAll(); return r; },
    async removeMember(projectId, userId, msg = 'Integrante retirado.') { const r = await run(() => supabase.from('memberships').delete().eq('project_id', projectId).eq('user_id', userId), msg); if (r) await loadAll(); return r; },
    listInvites: (projectId) => run(() => supabase.from('invites').select('*').eq('project_id', projectId).eq('revoked', false).order('created_at', { ascending: false })),
    createInvite: (projectId, role) => run(() => supabase.from('invites').insert({ project_id: projectId, role }).select().single()),
    revokeInvite: (code) => run(() => supabase.from('invites').update({ revoked: true }).eq('code', code), 'Enlace desactivado.'),
    previewInvite: (code) => run(() => supabase.rpc('invite_preview', { p_code: code })),
    async joinProject(code) { const id = await run(() => supabase.rpc('join_project', { p_code: code })); if (id) await loadAll(); return id; },
    async markRead(ids) {
      const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
      if (!list.length) return;
      const now = new Date().toISOString();
      setNotifs((ns) => ns.map((n) => (list.includes(n.id) ? { ...n, read_at: now } : n)));
      await supabase.from('notifications').update({ read_at: now }).in('id', list);
    },
    async clearNotifs() { setNotifs([]); await supabase.from('notifications').delete().eq('user_id', uid); },
    async updateProfile(patch) { const r = await run(() => supabase.from('profiles').update(patch).eq('id', uid).select().single(), 'Perfil actualizado.'); if (r) setProfile(r); return r; },
    async createProfile(f) { const r = await run(() => supabase.from('profiles').insert({ id: uid, ...f }).select().single()); if (r) setProfile(r); return r; },
    async signOut() { await supabase.auth.signOut(); setProjects([]); setTasks([]); setNotifs([]); setMembers({}); },
    async deleteAccount() { const r = await run(() => supabase.rpc('delete_my_account')); if (r !== null) { await supabase.auth.signOut(); } return r; },
    run,
  }), [run, loadAll, loadProfile, uid]);

  const value = {
    session, uid, profile, recovery, setRecovery, projects, members, tasks, notifs, loaded, online,
    toasts, toast, dismiss, fail, ...api,
    project: (id) => projects.find((p) => p.id === id),
    membersOf: (id) => members[id] || [],
    nameOf: (id, projectId) => {
      if (!id) return 'Sin asignar';
      if (id === uid) return profile?.display_name || 'Tú';
      const lists = projectId ? [members[projectId] || []] : Object.values(members);
      for (const l of lists) { const m = l.find((x) => x.user_id === id); if (m?.profile) return m.profile.display_name; }
      return 'Excompañero';
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
