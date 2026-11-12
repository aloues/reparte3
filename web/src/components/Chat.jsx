import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, ArrowDown, Trash2, Lock, Sparkles, UploadCloud, FileText, Image as ImageIcon, File as FileIcon, Download, Loader2, Pin, PinOff, Search, X } from 'lucide-react';
import { useApp } from '../lib/store';
import { useMessages, useFiles } from '../lib/hooks';
import { chatSegments } from '../lib/center';
import { openTask } from './TaskViews';
import { ago, fmtSize } from '../lib/format';
import { errMsg } from '../lib/supabase';
import { go } from '../lib/router';
import { Avatar, Spinner, IconBtn } from './ui';

const dayKey = (ts) => new Date(ts).toLocaleDateString('es-PE', { timeZone: 'America/Lima', weekday: 'long', day: 'numeric', month: 'long' });

/** Texto de un mensaje con enlaces y referencias #12 a tareas. Nunca se interpreta como HTML. */
function Body({ body, bySeq, q }) {
  const mark = (s) => {
    if (!q) return s;
    const i = s.toLowerCase().indexOf(q);
    return i < 0 ? s : <>{s.slice(0, i)}<mark className="rounded bg-accent/20 px-0.5 text-fg">{s.slice(i, i + q.length)}</mark>{s.slice(i + q.length)}</>;
  };
  return chatSegments(body, bySeq).map((s, i) => (s.type === 'url'
    ? <a key={i} href={s.value} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-accent underline underline-offset-2">{s.value}</a>
    : s.type === 'task'
      ? <button key={i} type="button" onClick={() => openTask(s.task.id)} title={s.task.title} className="rounded bg-accent/10 px-1 font-medium text-accent hover:bg-accent/20">{s.value}</button>
      : <Fragment key={i}>{mark(s.value)}</Fragment>));
}

/** Chat del grupo o comentarios de una tarea. */
export function Messages({ projectId, taskId, readOnly, premium, compact, emptyText }) {
  const { uid, nameOf, toast, tasks, project } = useApp();
  const { msgs, send, remove, pin } = useMessages(projectId, taskId);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [away, setAway] = useState(false);
  const [showPins, setShowPins] = useState(false);
  const end = useRef(null);
  const list = useRef(null);
  const coord = project(projectId)?.myRole === 'coordinador';
  const bySeq = useMemo(() => Object.fromEntries(tasks.filter((t) => t.project_id === projectId).map((t) => [t.seq, t])), [tasks, projectId]);
  const q = query.trim().toLowerCase();
  const pins = (msgs || []).filter((m) => m.pinned);
  const shown = q ? (msgs || []).filter((m) => m.body.toLowerCase().includes(q)) : msgs;
  useEffect(() => {
    const el = list.current;
    const nearBottom = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (nearBottom && !q) end.current?.scrollIntoView({ block: 'end' });
  }, [msgs?.length, q]);
  const onScroll = () => { const el = list.current; if (el) setAway(el.scrollHeight - el.scrollTop - el.clientHeight > 320); };
  const jump = (id) => { setQuery(''); setSearching(false); setTimeout(() => document.getElementById(`m-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50); };

  const submit = async (e) => {
    e?.preventDefault();
    const v = text.trim();
    if (!v || busy) return;
    setBusy(true);
    try { await send(v); setText(''); } catch (err) { toast(errMsg(err), { icon: 'error' }); }
    setBusy(false);
  };

  let lastDay = null; let lastAuthor = null; let lastTime = 0;
  return (
    <div className={`relative flex min-h-0 flex-col ${compact ? '' : 'h-full'}`}>
      {!compact && msgs && msgs.length > 0 && (
        <div className="mb-2 flex shrink-0 flex-wrap items-center gap-2 border-b border-line pb-2">
          {pins.length > 0 && <button type="button" onClick={() => setShowPins(!showPins)} aria-expanded={showPins} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium ring-1 ring-inset ring-line hover:bg-hov"><Pin className="h-3.5 w-3.5" />{pins.length === 1 ? '1 fijado' : `${pins.length} fijados`}</button>}
          {searching ? (
            <label className="relative flex min-w-0 flex-1 items-center">
              <span className="sr-only">Buscar en el chat</span>
              <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-fg-3" />
              <input autoFocus type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar en la conversación" className="field h-8 pl-8 text-[13px]" />
              <button type="button" onClick={() => { setQuery(''); setSearching(false); }} aria-label="Cerrar búsqueda" className="absolute right-1.5 grid h-6 w-6 place-items-center text-fg-3 hover:text-fg"><X className="h-3.5 w-3.5" /></button>
            </label>
          ) : <button type="button" onClick={() => setSearching(true)} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] text-fg-2 hover:bg-hov hover:text-fg"><Search className="h-3.5 w-3.5" />Buscar</button>}
          {q && <span className="w-full text-[12px] text-fg-2">{shown.length === 1 ? '1 mensaje' : `${shown.length} mensajes`} con «{query.trim()}». Toca uno para verlo en contexto.</span>}
          {showPins && (
            <ul className="anim-enter flex w-full flex-col gap-1.5">
              {pins.map((m) => <li key={m.id}><button type="button" onClick={() => jump(m.id)} className="w-full rounded-lg bg-hov px-3 py-2 text-left text-[13px] leading-5 hover:bg-hov2"><span className="font-medium">{nameOf(m.author, projectId)}:</span> <span className="line-clamp-2">{m.body}</span></button></li>)}
            </ul>
          )}
        </div>
      )}
      <div ref={list} onScroll={onScroll} className={`min-h-0 flex-1 ${compact ? '' : 'overflow-y-auto px-1'}`} aria-live="polite">
        {msgs === null ? <Spinner label="Cargando mensajes…" /> : msgs.length === 0 ? (
          <p className="py-10 text-center text-[13.5px] text-fg-2">{emptyText || 'Todavía no hay mensajes. Escribe el primero.'}</p>
        ) : q && !shown.length ? <p className="py-10 text-center text-[13.5px] text-fg-2">Ningún mensaje contiene «{query.trim()}».</p> : (
          <ol className="flex flex-col pb-2">
            {shown.map((m) => {
              const d = dayKey(m.created_at);
              const t = new Date(m.created_at).getTime();
              const sameRun = m.author === lastAuthor && d === lastDay && t - lastTime < 5 * 60000;
              const showDay = d !== lastDay;
              lastDay = d; lastAuthor = m.author; lastTime = t;
              const mine = m.author === uid;
              return (
                <Fragment key={m.id}>
                  {showDay && !compact && <li className="my-4 flex items-center gap-3 text-[11.5px] font-medium text-fg-3"><span className="h-px flex-1 bg-line" />{d}<span className="h-px flex-1 bg-line" /></li>}
                  <li id={`m-${m.id}`} onClick={q ? () => jump(m.id) : undefined} className={`group flex gap-3 ${sameRun && !q ? 'mt-0.5' : 'mt-4'} ${m._fresh ? 'anim-enter' : ''} ${m.pinned ? 'rounded-lg bg-accent/[.04] ring-1 ring-inset ring-accent/15' : ''} ${q ? 'cursor-pointer rounded-lg hover:bg-hov' : ''}`}>
                    <span className="w-7 shrink-0">{(!sameRun || q) && <Avatar name={nameOf(m.author, projectId)} me={mine} size="md" />}</span>
                    <div className="min-w-0 flex-1">
                      {(!sameRun || q || m.pinned) && <p className="flex items-center gap-1.5 text-[12.5px]"><span className="font-medium text-fg">{mine ? 'Tú' : nameOf(m.author, projectId)}</span> <span className="text-fg-3">{ago(m.created_at)}</span>{m.pinned && <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-accent"><Pin className="h-3 w-3" />Fijado</span>}</p>}
                      <div className="flex items-start gap-1">
                        <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-fg"><Body body={m.body} bySeq={bySeq} q={q} /></p>
                        {coord && !taskId && !readOnly && <IconBtn label={m.pinned ? 'Desfijar mensaje' : 'Fijar mensaje'} onClick={async (e) => { e.stopPropagation(); try { await pin(m.id, !m.pinned); } catch (err) { toast(errMsg(err), { icon: 'error' }); } }} className={`h-7 w-7 hover:text-accent group-hover:opacity-100 focus:opacity-100 ${m.pinned ? 'text-accent' : 'text-fg-3 opacity-0'}`}>{m.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}</IconBtn>}
                        {mine && <IconBtn label="Borrar mensaje" onClick={async (e) => { e.stopPropagation(); try { await remove(m.id); } catch (err) { toast(errMsg(err), { icon: 'error' }); } }} className="h-7 w-7 text-fg-3 opacity-0 hover:text-red group-hover:opacity-100 focus:opacity-100"><Trash2 className="h-3.5 w-3.5" /></IconBtn>}
                      </div>
                    </div>
                  </li>
                </Fragment>
              );
            })}
          </ol>
        )}
        <div ref={end} />
      </div>
      {away && !q && <button type="button" onClick={() => end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })} className="anim-enter absolute bottom-24 right-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-fg px-3.5 text-[12.5px] font-medium text-canvas shadow-pop"><ArrowDown className="h-4 w-4" />Último mensaje</button>}
      {readOnly ? (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-hov px-3 py-2.5 text-[12.5px] text-fg-2"><Lock className="h-3.5 w-3.5" />Como docente puedes leer, pero no escribir.</p>
      ) : !premium ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-accent/[.06] p-3 ring-1 ring-inset ring-accent/20">
          <Sparkles className="h-4 w-4 text-accent" />
          <p className="min-w-0 flex-1 text-[13px]">El chat es parte de Premium. Este grupo usa el plan gratis.</p>
          <button type="button" onClick={() => go('/premium')} className="text-[13px] font-semibold text-accent underline-offset-4 hover:underline">Ver Premium</button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-3 shrink-0">
          <div className="flex items-end gap-2 rounded-xl bg-card p-2 ring-1 ring-inset ring-line transition-all focus-within:ring-2 focus-within:ring-accent/50">
            <label htmlFor={`msg-${taskId || projectId}`} className="sr-only">Escribe un mensaje</label>
            <textarea id={`msg-${taskId || projectId}`} rows={1} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
                      placeholder={taskId ? 'Escribe un comentario' : 'Escribe al grupo'}
                      className="max-h-36 min-h-[36px] flex-1 resize-none bg-transparent px-2 py-2 text-[14px] outline-none placeholder:text-fg-3" />
            <button type="submit" disabled={!text.trim() || busy} aria-label="Enviar"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-on-accent transition-all hover:brightness-110 active:scale-95 disabled:bg-hov2 disabled:text-fg-3">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="sw-bold h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1.5 px-1 text-[11.5px] text-fg-3">Enter envía. Shift + Enter hace un salto de línea. El grupo recibe un aviso.</p>
        </form>
      )}
    </div>
  );
}

export function DropZone({ onFiles, compact, label = 'Arrastra archivos aquí', hint = 'o haz clic para elegirlos', accept, multiple = true, id, busy }) {
  const [over, setOver] = useState(false);
  const input = useRef(null);
  return (
    <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
         onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]); }}
         onClick={() => !busy && input.current?.click()}
         onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
         role="button" tabIndex={0} aria-busy={busy || undefined}
         className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-center transition-all duration-200 ${compact ? 'px-4 py-6' : 'px-6 py-12'} ${over ? 'scale-[1.01] border-accent bg-accent/[.06]' : 'border-line hover:border-fg-3/60 hover:bg-hov'}`}>
      <span className={`grid place-items-center rounded-full transition-all ${compact ? 'h-9 w-9' : 'h-12 w-12'} ${over ? 'bg-accent text-on-accent' : 'bg-hov2 text-fg-2'}`}>
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <UploadCloud className={compact ? 'h-4 w-4' : 'h-5 w-5'} />}
      </span>
      <span className={`font-medium ${compact ? 'text-[13px]' : 'text-[14.5px]'}`}>{busy ? 'Subiendo…' : over ? 'Suelta para subir' : label}</span>
      <span className="text-[12.5px] text-fg-2">{hint}</span>
      <input id={id} ref={input} type="file" multiple={multiple} accept={accept} className="sr-only" tabIndex={-1}
             onChange={(e) => { if (e.target.files.length) onFiles([...e.target.files]); e.target.value = ''; }} />
    </div>
  );
}

export function Files({ projectId, taskId, readOnly }) {
  const { uid, nameOf, toast, project } = useApp();
  const { files, upload, remove, open } = useFiles(projectId, taskId);
  const [busy, setBusy] = useState(false);
  const isCoord = project(projectId)?.myRole === 'coordinador';
  const onFiles = async (list) => {
    setBusy(true);
    try { await upload(list); toast(list.length === 1 ? `Subiste ${list[0].name}.` : `Subiste ${list.length} archivos.`); }
    catch (e) { toast(errMsg(e), { icon: 'error' }); }
    setBusy(false);
  };
  const iconFor = (n) => (/\.pdf$/i.test(n) ? FileText : /\.(png|jpe?g|gif|webp)$/i.test(n) ? ImageIcon : FileIcon);
  return (
    <div className="flex flex-col gap-4">
      {!readOnly && <DropZone compact id={`files-${taskId || projectId}`} onFiles={onFiles} busy={busy} hint="Hasta 10 MB por archivo. Solo tu grupo puede verlos." />}
      {files === null ? <Spinner /> : files.length === 0 ? <p className="text-[13px] text-fg-2">Todavía no hay archivos.</p> : (
        <ul className="flex flex-col gap-2">
          {files.map((f) => {
            const I = iconFor(f.name);
            return (
              <li key={f.id} className="group flex items-center gap-3 rounded-lg p-2.5 ring-1 ring-inset ring-line transition-colors hover:bg-hov">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-hov2 text-fg-2"><I className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{f.name}</span><span className="block text-[12px] text-fg-2">{fmtSize(f.size)}, {nameOf(f.uploaded_by, projectId)}, {ago(f.created_at)}</span></span>
                <IconBtn label={`Descargar ${f.name}`} onClick={() => open(f).catch((e) => toast(errMsg(e), { icon: 'error' }))}><Download className="h-4 w-4" /></IconBtn>
                {(f.uploaded_by === uid || isCoord) && !readOnly && <IconBtn label={`Borrar ${f.name}`} onClick={() => remove(f).catch((e) => toast(errMsg(e), { icon: 'error' }))} className="hover:text-red"><Trash2 className="h-4 w-4" /></IconBtn>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
