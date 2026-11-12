import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

const chanId = (p) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

/** Chat del grupo (taskId vacío) o comentarios de una tarea, en tiempo real. */
export function useMessages(projectId, taskId) {
  const [msgs, setMsgs] = useState(null);
  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    setMsgs(null);
    let q = supabase.from('messages').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(200);
    q = taskId ? q.eq('task_id', taskId) : q.is('task_id', null);
    q.then(({ data }) => { if (alive) setMsgs((data || []).reverse()); });
    const ch = supabase.channel(chanId(`msg-${projectId}`))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `project_id=eq.${projectId}` }, (p) => {
        const m = p.new;
        if ((m.task_id || null) !== (taskId || null)) return;
        setMsgs((l) => (l && !l.some((x) => x.id === m.id) ? [...l, m] : l));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `project_id=eq.${projectId}` }, (p) => setMsgs((l) => l && l.map((x) => (x.id === p.new.id ? { ...x, ...p.new } : x))))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (p) => setMsgs((l) => l && l.filter((x) => x.id !== p.old.id)))
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [projectId, taskId]);
  const pin = useCallback(async (id, pinned) => {
    const { error } = await supabase.from('messages').update({ pinned }).eq('id', id);
    if (error) throw error;
    setMsgs((l) => l && l.map((x) => (x.id === id ? { ...x, pinned } : x)));
  }, []);

  const send = useCallback(async (body) => {
    const { data, error } = await supabase.from('messages').insert({ project_id: projectId, task_id: taskId || null, body }).select().single();
    if (error) throw error;
    setMsgs((l) => (l && !l.some((x) => x.id === data.id) ? [...l, data] : l));
  }, [projectId, taskId]);
  const remove = useCallback(async (id) => {
    const { error } = await supabase.from('messages').delete().eq('id', id);
    if (error) throw error;
    setMsgs((l) => l && l.filter((x) => x.id !== id));
  }, []);
  return { msgs, send, remove, pin };
}

/** Enlaces del proyecto (Docs, Sheets, Slides, Drive, web), en tiempo real. */
export function useLinks(projectId) {
  const [links, setLinks] = useState(null);
  const load = useCallback(async () => {
    if (!projectId) return;
    const { data, error } = await supabase.from('project_links').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
    setLinks(error ? [] : data || []);
  }, [projectId]);
  useEffect(() => {
    if (!projectId) return undefined;
    setLinks(null); load();
    const ch = supabase.channel(chanId(`links-${projectId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_links', filter: `project_id=eq.${projectId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [projectId, load]);
  const add = useCallback(async (f) => {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('project_links').insert({ project_id: projectId, url: f.url, title: f.title || '', task_id: f.task_id || null, source: f.source || 'manual', added_by: u.user.id });
    if (error) throw error;
    await load();
  }, [projectId, load]);
  const update = useCallback(async (id, patch) => { const { error } = await supabase.from('project_links').update(patch).eq('id', id); if (error) throw error; await load(); }, [load]);
  const remove = useCallback(async (id) => { const { error } = await supabase.from('project_links').delete().eq('id', id); if (error) throw error; await load(); }, [load]);
  return { links, add, update, remove, reload: load };
}

/** URL firmada (2 min) de un archivo privado del proyecto, para el visor. */
export function useSignedUrl(path) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    setUrl(null); setError('');
    if (!path) return undefined;
    supabase.storage.from('archivos').createSignedUrl(path, 600).then(({ data, error: e }) => {
      if (!alive) return;
      if (e) setError(e.message); else setUrl(data.signedUrl);
    });
    return () => { alive = false; };
  }, [path]);
  return { url, error };
}

/** Archivos privados del proyecto (o de una tarea) en Supabase Storage. */
export function useFiles(projectId, taskId) {
  const [files, setFiles] = useState(null);
  const load = useCallback(async () => {
    if (!projectId) return;
    let q = supabase.from('files').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
    q = taskId ? q.eq('task_id', taskId) : q;
    const { data } = await q;
    setFiles(data || []);
  }, [projectId, taskId]);
  useEffect(() => { setFiles(null); load(); }, [load]);

  const upload = useCallback(async (list) => {
    for (const f of list) {
      if (f.size > 10 * 1024 * 1024) throw new Error(`«${f.name}» pesa más de 10 MB.`);
      const safe = f.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_').slice(-80);
      const path = `${projectId}/${taskId || 'general'}/${crypto.randomUUID()}-${safe}`;
      const up = await supabase.storage.from('archivos').upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: false });
      if (up.error) throw up.error;
      const { error } = await supabase.from('files').insert({ project_id: projectId, task_id: taskId || null, path, name: f.name.slice(0, 200), size: f.size, mime: f.type || null });
      if (error) { await supabase.storage.from('archivos').remove([path]); throw error; }
    }
    await load();
  }, [projectId, taskId, load]);
  const remove = useCallback(async (file) => {
    const { error } = await supabase.from('files').delete().eq('id', file.id);
    if (error) throw error;
    await supabase.storage.from('archivos').remove([file.path]);
    await load();
  }, [load]);
  const open = useCallback(async (file) => {
    const { data, error } = await supabase.storage.from('archivos').createSignedUrl(file.path, 120, { download: file.name });
    if (error) throw error;
    window.open(data.signedUrl, '_blank', 'noopener');
  }, []);
  return { files, upload, remove, open, reload: load };
}

/** Actividad del proyecto o de una tarea. `version` cambia cuando cambia algo del proyecto y fuerza una nueva lectura. */
export function useActivity(projectId, taskId, limit = 60, version = 0) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    if (!projectId) return;
    let q = supabase.from('activity').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(limit);
    q = taskId ? q.eq('task_id', taskId) : q;
    q.then(({ data }) => setItems(data || []));
  }, [projectId, taskId, limit, version]);
  return items;
}

export function useTheme() {
  const read = () => { try { return JSON.parse(localStorage.getItem('r3-theme')); } catch (e) { return null; } };
  const sys = () => (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const [theme, setThemeS] = useState(() => read() || sys());
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);
  const setTheme = (t) => { setThemeS(t); try { localStorage.setItem('r3-theme', JSON.stringify(t)); } catch (e) { /* sin almacenamiento */ } };
  return [theme, setTheme];
}

export function useLocal(key, initial) {
  const [v, setV] = useState(() => { try { const s = localStorage.getItem(key); return s === null ? initial : JSON.parse(s); } catch (e) { return initial; } });
  const set = (x) => { setV(x); try { localStorage.setItem(key, JSON.stringify(x)); } catch (e) { /* nada */ } };
  return [v, set];
}

export function useMedia(q) {
  const [m, setM] = useState(() => window.matchMedia?.(q).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(q); if (!mq) return undefined;
    const h = () => setM(mq.matches);
    mq.addEventListener?.('change', h);
    return () => mq.removeEventListener?.('change', h);
  }, [q]);
  return m;
}
