import { useState } from 'react';
import { FileText, Sheet, Presentation, Folder, HardDrive, Globe, PlayCircle, ClipboardList, File as FileIcon, ExternalLink, Trash2, Link2, Plus, Paperclip, MessageCircle, Loader2 } from 'lucide-react';
import { useApp } from '../../lib/store';
import { useLinks } from '../../lib/hooks';
import { LINK_KINDS, linkKind, linkTitle, validUrl } from '../../lib/center';
import { pickerEnabled, pickFromDrive } from '../../lib/google';
import { ago } from '../../lib/format';
import { errMsg } from '../../lib/supabase';
import { Btn, IconBtn, SelectField, Spinner } from '../ui';
import { Files } from '../Chat';
import { openTask } from '../TaskViews';

const ICON = { doc: FileText, sheet: Sheet, slides: Presentation, form: ClipboardList, folder: Folder, drive: HardDrive, pdf: FileIcon, video: PlayCircle, web: Globe };
// Íconos en gris: la forma distingue el tipo y la interfaz no suma colores de marca ajenos.
const TONE = new Proxy({}, { get: () => 'text-fg-2' });
const FILTERS = [['todos', 'Todos'], ['doc', 'Documentos'], ['sheet', 'Hojas'], ['slides', 'Presentaciones'], ['drive', 'Drive'], ['otros', 'Otros']];
const match = (f, k) => f === 'todos' || f === k || (f === 'drive' && (k === 'drive' || k === 'folder')) || (f === 'otros' && ['pdf', 'video', 'web', 'form'].includes(k));

function AddLink({ p, onAdd }) {
  const { tasks } = useApp();
  const [f, setF] = useState({ url: '', title: '', task_id: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const ts = tasks.filter((t) => t.project_id === p.id && t.status !== 'lista');
  const k = f.url ? linkKind(f.url) : null;
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (!validUrl(f.url)) { setErr('Pega un enlace completo que empiece con https://'); return; }
    setBusy(true);
    try { await onAdd({ url: f.url.trim(), title: f.title.trim(), task_id: f.task_id || null }); setF({ url: '', title: '', task_id: '' }); }
    catch (e2) { setErr(/duplicate|unique/i.test(errMsg(e2)) ? 'Ese enlace ya está en el proyecto.' : errMsg(e2)); }
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-2 rounded-2xl bg-card p-4 ring-1 ring-inset ring-line sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_200px_auto]">
      <label htmlFor="ln-url" className="sr-only">Enlace</label>
      <input id="ln-url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="Pega el enlace del Doc, Sheet, Slides o carpeta" className="field h-10" inputMode="url" />
      <label htmlFor="ln-title" className="sr-only">Nombre</label>
      <input id="ln-title" value={f.title} maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={k ? `Nombre (${LINK_KINDS[k].toLowerCase()})` : 'Nombre (opcional)'} className="field h-10" />
      <SelectField id="ln-task" value={f.task_id} onChange={(v) => setF({ ...f, task_id: v })} aria-label="Tarea relacionada" className="[&_select]:h-10">
        <option value="">Sin tarea</option>
        {ts.map((t) => <option key={t.id} value={t.id}>#{t.seq} {t.title}</option>)}
      </SelectField>
      <Btn kind="primary" type="submit" loading={busy} className="h-10"><Plus className="h-4 w-4" />Agregar</Btn>
      {err && <p role="alert" className="text-[12.5px] text-orange sm:col-span-4">{err}</p>}
      <p className="text-[12px] text-fg-2 sm:col-span-4">El enlace se abre con los permisos que ya tenga en Google: Reparte3 no cambia quién puede verlo. Los enlaces que compartan en el chat también aparecen aquí.</p>
    </form>
  );
}

export default function Resources({ p, role, onTab }) {
  const { uid, nameOf, tasks, toast } = useApp();
  const { links, add, remove } = useLinks(p.id);
  const [filter, setFilter] = useState('todos');
  const [picking, setPicking] = useState(false);
  const canEdit = role !== 'docente' && p.status === 'activo';
  const coord = role === 'coordinador';
  const taskOf = (id) => tasks.find((t) => t.id === id);
  const shown = (links || []).filter((l) => match(filter, l.kind));
  const pick = async () => {
    setPicking(true);
    try {
      const docs = await pickFromDrive();
      let n = 0;
      for (const d of docs) { try { await add({ url: d.url, title: d.title, source: 'drive' }); n++; } catch (e) { /* ya estaba */ } }
      if (n) toast(n === 1 ? 'Agregaste 1 archivo de Drive.' : `Agregaste ${n} archivos de Drive.`);
    } catch (e) { toast(e.message, { icon: 'error' }); }
    setPicking(false);
  };

  return (
    <div className="grid grid-cols-1 gap-6">
      {canEdit && (
        <div className="grid grid-cols-1 gap-3">
          <AddLink p={p} onAdd={async (f) => { await add(f); toast('Enlace agregado.'); }} />
          {pickerEnabled && <Btn kind="secondary" onClick={pick} loading={picking} className="justify-self-start"><HardDrive className="h-4 w-4" />Elegir de Google Drive</Btn>}
        </div>
      )}

      <section aria-labelledby="ln-t">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 id="ln-t" className="flex items-center gap-2 text-[14px] font-semibold"><Link2 className="h-4 w-4 text-fg-3" />Enlaces del proyecto {links && <span className="font-normal text-fg-2">{links.length}</span>}</h3>
          <div role="tablist" aria-label="Filtrar enlaces" className="no-scrollbar flex gap-1 overflow-x-auto">
            {FILTERS.map(([k, lb]) => <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={`h-8 shrink-0 rounded-lg px-2.5 text-[12.5px] ${filter === k ? 'bg-hov2 font-medium text-fg' : 'text-fg-2 hover:bg-hov hover:text-fg'}`}>{lb}</button>)}
          </div>
        </div>
        {links === null ? <Spinner /> : shown.length === 0 ? (
          <p className="rounded-2xl p-6 text-center text-[13.5px] text-fg-2 ring-1 ring-inset ring-dashed ring-line">{links.length ? 'Ningún enlace de este tipo.' : 'Todavía no hay enlaces. Agrega el documento de trabajo del grupo para que nadie lo busque en el chat.'}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((l) => {
              const I = ICON[l.kind] || Globe; const t = l.task_id ? taskOf(l.task_id) : null;
              return (
                <li key={l.id} className="group flex flex-col rounded-2xl bg-card p-4 ring-1 ring-inset ring-line transition-colors hover:ring-fg-3/40">
                  <div className="flex items-start gap-3">
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-hov ${TONE[l.kind]}`}><I className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1">
                      <a href={l.url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 text-[14px] font-medium leading-5 underline-offset-4 hover:underline">{linkTitle(l)}</a>
                      <span className="mt-0.5 block text-[12px] text-fg-2">{LINK_KINDS[l.kind]}</span>
                    </span>
                    {(l.added_by === uid || coord) && canEdit && <IconBtn label={`Quitar ${linkTitle(l)}`} onClick={() => remove(l.id).catch((e) => toast(errMsg(e), { icon: 'error' }))} className="h-8 w-8 text-fg-3 opacity-0 hover:text-red group-hover:opacity-100 focus:opacity-100"><Trash2 className="h-4 w-4" /></IconBtn>}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-fg-2">
                    {t && <button type="button" onClick={() => openTask(t.id)} className="rounded-md bg-hov px-1.5 py-0.5 text-fg hover:bg-hov2">#{t.seq} {t.title.length > 26 ? `${t.title.slice(0, 26)}…` : t.title}</button>}
                    <span className="inline-flex items-center gap-1">{l.source === 'chat' && <MessageCircle className="h-3 w-3" />}{l.source === 'chat' ? 'Del chat' : l.source === 'drive' ? 'De Drive' : 'Agregado'} por {l.added_by === uid ? 'ti' : nameOf(l.added_by, p.id)}, {ago(l.created_at)}</span>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 font-medium text-accent hover:underline">Abrir<ExternalLink className="h-3.5 w-3.5" /></a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="rounded-2xl bg-card p-5 ring-1 ring-inset ring-line" aria-labelledby="fl-t">
          <h3 id="fl-t" className="flex items-center gap-2 text-[14px] font-semibold"><Paperclip className="h-4 w-4 text-fg-3" />Archivos subidos</h3>
          <div className="mt-3"><Files projectId={p.id} readOnly={!canEdit} /></div>
        </section>
        <section className="rounded-2xl bg-card p-5 ring-1 ring-inset ring-line">
          <h3 className="flex items-center gap-2 text-[14px] font-semibold"><FileText className="h-4 w-4 text-fg-3" />Consigna</h3>
          <p className="mt-2 text-[13px] text-fg-2">{p.brief_file || p.brief_text ? `«${p.brief_file || 'Consigna'}», versión ${p.brief_version || 1}.` : 'Todavía no se subió.'}</p>
          <Btn size="sm" className="mt-3" onClick={() => onTab('consigna')}>{p.brief_file || p.brief_text ? 'Ver consigna' : 'Subir consigna'}</Btn>
          {!pickerEnabled && <p className="mt-5 text-[12px] leading-5 text-fg-3">Para elegir archivos directo desde Google Drive, la administración debe configurar el acceso a Google. Mientras tanto, pega el enlace.</p>}
          {picking && <Loader2 className="mt-2 h-4 w-4 animate-spin" />}
        </section>
      </div>
    </div>
  );
}
