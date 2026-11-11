import { Plus, Archive, Sparkles } from 'lucide-react';
import { useApp } from '../lib/store';
import { go } from '../lib/router';
import { ROLES, fmtDay, relDays, initials, isPremium } from '../lib/format';
import { AvatarStack, Chip, Spinner, Dot } from '../components/ui';

export default function ProjectsPage({ onNew }) {
  const { projects, tasks, membersOf, uid, loaded } = useApp();
  if (!loaded) return <Spinner />;
  const groups = [['Activos', projects.filter((p) => p.status === 'activo')], ['Archivados', projects.filter((p) => p.status !== 'activo')]];
  return (
    <div className="flex flex-col gap-10">
      {groups.map(([label, list], gi) => (list.length > 0 || gi === 0) && (
        <section key={label} aria-labelledby={`pg-${gi}`}>
          <h2 id={`pg-${gi}`} className="mb-4 flex items-center gap-2 text-[14px] font-semibold">{gi === 1 && <Archive className="h-4 w-4 text-fg-3" />}{label}<span className="font-mono text-[11.5px] font-normal text-fg-3">{list.length}</span></h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {list.map((p) => {
              const ts = tasks.filter((t) => t.project_id === p.id);
              const done = ts.filter((t) => t.status === 'lista').length;
              const blocked = ts.filter((t) => t.status === 'bloqueada').length;
              const pct = ts.length ? Math.round((done / ts.length) * 100) : 0;
              return (
                <button key={p.id} type="button" onClick={() => go(`/p/${p.id}`)}
                        className={`group flex flex-col rounded-xl bg-card p-6 text-left shadow-xs ring-1 ring-inset ring-line transition-all duration-200 hover:-translate-y-0.5 hover:ring-fg-3/40 ${gi ? 'opacity-75' : ''}`}>
                  <span className="flex items-start justify-between gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-hov2 text-[12px] font-semibold">{initials(p.name)}</span>
                    <span className="flex flex-wrap justify-end gap-1.5">
                      {blocked > 0 && <Chip tone="red"><Dot st="blocked" className="h-1.5 w-1.5" />{blocked} bloqueo{blocked > 1 ? 's' : ''}</Chip>}
                      {isPremium(p) && <Chip tone="accent"><Sparkles className="h-3 w-3" />Premium</Chip>}
                    </span>
                  </span>
                  <span className="mt-4 text-[15px] font-semibold leading-snug">{p.name}</span>
                  <span className="mt-0.5 text-[12.5px] text-fg-2">{p.course || 'Sin curso'}, {ROLES[p.myRole].short.toLowerCase()}</span>
                  <span className="mt-5 block h-1.5 overflow-hidden rounded-full bg-hov2"><span className="block h-full rounded-full bg-fg" style={{ width: `${pct}%` }} /></span>
                  <span className="mt-3 flex items-center justify-between gap-3 text-[12px] text-fg-2">
                    <span>{ts.length ? `${done} de ${ts.length} listas` : 'Sin tareas'}{p.due_date ? `, entrega ${fmtDay(p.due_date)} (${relDays(p.due_date)})` : ''}</span>
                    <AvatarStack ring="card" people={membersOf(p.id).map((m) => ({ id: m.user_id, name: m.profile?.display_name || '?', me: m.user_id === uid }))} />
                  </span>
                </button>
              );
            })}
            {gi === 0 && (
              <button type="button" onClick={onNew} className="flex min-h-[210px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line text-fg-2 transition-all duration-200 hover:border-accent/50 hover:bg-accent/[.04] hover:text-fg">
                <Plus className="h-5 w-5" /><span className="text-[13.5px] font-medium">Nuevo proyecto</span>
              </button>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
