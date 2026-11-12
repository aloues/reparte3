import { useMemo, useState } from 'react';
import { FileText, Download, ExternalLink, Loader2, Info, Plus, AlertTriangle, ListChecks, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { useApp } from '../../lib/store';
import { useSignedUrl } from '../../lib/hooks';
import { extractText } from '../../lib/extract';
import { analyzeBrief } from '../../lib/detect';
import { uploadBriefFile, briefDownload, VIEWABLE } from '../../lib/brief';
import { fmtSize, ago, todayISO } from '../../lib/format';
import { KINDS } from '../../lib/plan';
import { Btn, Mono, Segmented, Empty } from '../ui';
import { DropZone } from '../Chat';
import { openTask } from '../TaskViews';

export default function Brief({ p, role }) {
  const { tasks, updateProject, addTask, toast } = useApp();
  const coord = role === 'coordinador' && p.status === 'activo';
  const kind = VIEWABLE(p.brief_mime || '', p.brief_file || '');
  const [view, setView] = useState(kind ? 'original' : 'texto');
  const [busy, setBusy] = useState(false);
  const [replace, setReplace] = useState(false);
  const { url, error: urlErr } = useSignedUrl(view === 'original' && kind ? p.brief_path : null);
  const lines = useMemo(() => String(p.brief_text || '').replace(/\r\n?/g, '\n').split('\n'), [p.brief_text]);
  const ts = tasks.filter((t) => t.project_id === p.id);
  const byLine = {};
  ts.filter((t) => t.source_line).forEach((t) => { (byLine[t.source_line] ||= []).push(t); });
  const stale = ts.some((t) => t.source_line && t.brief_version && t.brief_version < (p.brief_version || 1));
  // Líneas que piden algo (viñetas, numeración o verbos de entrega) y que todavía no tienen tarea.
  const uncovered = useMemo(() => (p.brief_text ? analyzeBrief(p.brief_text, Number((p.due_date || todayISO()).slice(0, 4))).filter((x) => !byLine[x.line]) : []), [p.brief_text, ts.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const linked = ts.filter((t) => t.source_line).sort((a, b) => a.source_line - b.source_line);

  const upload = async (fs) => {
    const f = fs[0];
    setBusy(true);
    try {
      const out = await extractText(f);
      const saved = await uploadBriefFile(p.id, f, p.brief_path);
      const ok = await updateProject(p.id, { brief_text: out.text.slice(0, 100000), brief_file: out.fileName.slice(0, 200), brief_path: saved.path, brief_mime: saved.mime, brief_size: saved.size }, p.brief_text ? 'Consigna reemplazada. Las tareas conservan su línea de la versión anterior.' : 'Consigna guardada.');
      if (ok) await saved.cleanup(); else throw new Error('No se pudo guardar la consigna.');
      setReplace(false); setView(VIEWABLE(saved.mime || '', f.name) ? 'original' : 'texto');
    } catch (e) { toast(e.message, { icon: 'error' }); }
    setBusy(false);
  };
  const createFrom = async (x) => { const r = await addTask(p.id, { title: x.title, hours: x.hours, due_date: x.due || null, source_line: x.line }); if (r) toast(`Creaste «${x.title}».`); };

  if (!p.brief_text && !p.brief_path) {
    return coord ? (
      <div className="mx-auto max-w-xl">
        <Empty icon={FileText} title="Sube la consigna del trabajo" text="PDF, Word o texto, hasta 10 MB. Todo el grupo la verá aquí y cada tarea podrá citar la línea de donde sale." />
        <DropZone id="brief-up" multiple={false} busy={busy} accept=".pdf,.docx,.txt,.md,application/pdf" label="Arrastra la consigna aquí" hint="Se guarda en el espacio privado del grupo." onFiles={upload} />
      </div>
    ) : <Empty icon={FileText} title="Todavía no hay consigna" text="Cuando la coordinación la suba, aparecerá aquí con las tareas que salen de cada parte." />;
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-inset ring-line">
        <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
          <span className="grid grid-cols-1 h-9 w-9 shrink-0 place-items-center rounded-lg bg-hov2">{kind === 'image' ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold">{p.brief_file || 'Consigna'}</span>
            <span className="block text-[12px] text-fg-2">Versión {p.brief_version || 1}{p.brief_updated_at ? `, actualizada ${ago(p.brief_updated_at)}` : ''}{p.brief_size ? `, ${fmtSize(p.brief_size)}` : ''}</span>
          </span>
          {kind && <Segmented label="Vista" value={view} onChange={setView} options={[{ id: 'original', label: 'Original' }, { id: 'texto', label: 'Texto' }]} />}
          {p.brief_path && <Btn size="sm" onClick={() => briefDownload(p.brief_path, p.brief_file).catch((e) => toast(e.message, { icon: 'error' }))}><Download className="h-4 w-4" />Descargar</Btn>}
          {coord && <Btn size="sm" onClick={() => setReplace(!replace)}><RefreshCw className="h-4 w-4" />Reemplazar</Btn>}
        </header>
        {replace && <div className="border-b border-line p-4"><DropZone compact id="brief-rep" multiple={false} busy={busy} accept=".pdf,.docx,.txt,.md,application/pdf" label="Sube la nueva versión" hint="Las tareas existentes no se borran: conservan la línea de la versión anterior." onFiles={upload} /></div>}

        {view === 'original' && kind ? (
          <div className="relative min-h-[60vh] flex-1 bg-sunk">
            {urlErr ? <p className="m-5 flex items-start gap-2 text-[13.5px] text-orange"><AlertTriangle className="mt-0.5 h-4 w-4" />No se pudo abrir el archivo ({urlErr}). Prueba con «Descargar».</p>
              : !url ? <p className="m-5 flex items-center gap-2 text-[13px] text-fg-2"><Loader2 className="h-4 w-4 animate-spin" />Abriendo la consigna…</p>
                : kind === 'pdf' ? (
                  <>
                    <iframe title={`Consigna: ${p.brief_file}`} src={url} className="h-[70vh] w-full border-0" />
                    <a href={url} target="_blank" rel="noopener noreferrer" className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-lg bg-card px-3 py-1.5 text-[12.5px] font-medium shadow-pop ring-1 ring-inset ring-line">Abrir en otra pestaña<ExternalLink className="h-3.5 w-3.5" /></a>
                  </>
                ) : <img src={url} alt={`Consigna: ${p.brief_file}`} className="mx-auto max-h-[75vh] object-contain p-4" />}
          </div>
        ) : (
          <>
            {p.brief_path && !kind && <p className="flex items-start gap-2 border-b border-line bg-hov px-5 py-2.5 text-[12.5px] text-fg-2"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />El navegador no puede mostrar un Word tal cual: aquí ves su texto. Descárgalo para verlo con su formato.</p>}
            <ol className="max-h-[70vh] overflow-y-auto py-3 font-mono text-[12.5px] leading-[24px]">
              {lines.map((l, i) => {
                const n = i + 1; const hit = byLine[n]; const maybe = uncovered.find((x) => x.line === n);
                return (
                  <li key={i} className={`grid grid-cols-[44px_minmax(0,1fr)] items-start gap-3 px-3 ${hit ? 'bg-accent/[.07]' : ''}`}>
                    <span className={`select-none pt-px text-right ${hit ? 'font-semibold text-accent-ink' : 'text-fg-3'}`}>{n}</span>
                    <span className="min-w-0 whitespace-pre-wrap break-words font-sans text-[14px] leading-6">
                      {l || ' '}
                      {hit && hit.map((t) => <button key={t.id} type="button" onClick={() => openTask(t.id)} className="ml-2 inline-flex items-center gap-1 rounded bg-accent/10 px-1.5 align-middle text-[11.5px] font-medium text-accent-ink hover:bg-accent/20">#{t.seq}</button>)}
                      {!hit && maybe && <span className="ml-2 inline-flex items-center rounded px-1.5 align-middle text-[11px] text-amber ring-1 ring-inset ring-amber/30">sin tarea</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </section>

      <aside className="flex flex-col gap-5">
        <section className="rounded-2xl bg-card p-5 ring-1 ring-inset ring-line">
          <h3 className="flex items-center gap-2 text-[14px] font-semibold"><ListChecks className="h-4 w-4 text-fg-3" />Qué tarea sale de cada parte</h3>
          {stale && <p className="mt-2 text-[12.5px] text-amber">Algunas tareas citan líneas de una versión anterior de la consigna.</p>}
          {linked.length ? (
            <ul className="mt-3 flex flex-col gap-1">
              {linked.map((t) => (
                <li key={t.id}><button type="button" onClick={() => openTask(t.id)} className="flex w-full items-start gap-3 rounded-lg p-2 text-left hover:bg-hov">
                  <Mono className="mt-0.5 w-[54px] shrink-0 whitespace-nowrap text-fg-3">línea {t.source_line}</Mono>
                  <span className="min-w-0 flex-1"><span className="block text-[13.5px] leading-5">{t.title}</span>{t.kind && <span className={`text-[11.5px] ${t.kind === 'sugerencia' ? 'text-accent-ink' : 'text-fg-2'}`}>{KINDS[t.kind]}</span>}</span>
                </button></li>
              ))}
            </ul>
          ) : <p className="mt-2 text-[13px] text-fg-2">Las tareas creadas desde la consigna muestran aquí su línea de origen.</p>}
        </section>
        {uncovered.length > 0 && (
          <section className="rounded-2xl bg-amber/[.05] p-5 ring-1 ring-inset ring-amber/25">
            <h3 className="flex items-center gap-2 text-[14px] font-semibold"><AlertTriangle className="h-4 w-4 text-amber" />Partes que piden algo y no tienen tarea</h3>
            <p className="mt-1 text-[12.5px] leading-5 text-fg-2">Detectadas por formato (viñetas, numeración o verbos como «entregar»). Revisa si falta una tarea o si ya está cubierta por otra.</p>
            <ul className="mt-3 flex flex-col gap-2">
              {uncovered.slice(0, 8).map((x) => (
                <li key={x.line} className="flex items-start gap-2 text-[13px]">
                  <Mono className="mt-0.5 w-[54px] shrink-0 whitespace-nowrap text-fg-3">línea {x.line}</Mono>
                  <span className="min-w-0 flex-1 leading-5">{x.title}</span>
                  {coord && <button type="button" onClick={() => createFrom(x)} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-medium text-accent-ink ring-1 ring-inset ring-accent/30 hover:bg-accent/10"><Plus className="h-3.5 w-3.5" />Tarea</button>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}
