import { useEffect, useState } from 'react';
import { Shield, Search, Sparkles } from 'lucide-react';
import { useApp } from '../lib/store';
import { supabase } from '../lib/supabase';
import { go } from '../lib/router';
import { LEVELS, ago } from '../lib/format';
import { Btn, Chip, Empty, Spinner, Mono } from '../components/ui';

export default function AdminPage() {
  const { profile, run, toast } = useApp();
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const load = async () => {
    const [a, b] = await Promise.all([run(() => supabase.rpc('admin_overview')), run(() => supabase.rpc('admin_projects'))]);
    setStats(a); setRows(b || []);
  };
  useEffect(() => { if (profile.is_admin) load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!profile.is_admin) return <Empty icon={Shield} title="Solo administración" text="Esta sección es para quien administra Reparte3."><Btn onClick={() => go('/')}>Ir al inicio</Btn></Empty>;
  if (!stats || !rows) return <Spinner />;
  const setPlan = async (r, plan) => {
    const ok = await run(() => supabase.rpc('admin_set_plan', { p_project: r.id, p_plan: plan, p_until: null }));
    if (ok) { toast(`«${r.name}» ahora está en plan ${plan}.`); load(); }
  };
  const tiles = [
    ['Personas', stats.users, `+${stats.users_7d} en 7 días`],
    ['Proyectos activos', stats.projects_active, `${stats.projects} en total`],
    ['Tareas listas', stats.tasks_done, `de ${stats.tasks}`],
    ['Mensajes', stats.messages_7d, 'en 7 días'],
    ['Dispositivos con avisos', stats.push_devices, 'push activado'],
  ];
  const list = rows.filter((r) => !q || `${r.name} ${r.course} ${r.coordinator}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="flex flex-col gap-6">
      <p className="text-[13px] text-fg-2">Cifras reales de la base de datos. No incluyen el contenido de chats ni archivos.</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map(([l, n, s]) => (
          <div key={l} className="rounded-xl bg-card p-5 ring-1 ring-inset ring-line">
            <p className="text-[12.5px] text-fg-2">{l}</p>
            <p className="mt-2 font-mono text-[26px] font-medium leading-none tabular-nums">{n}</p>
            <p className="mt-2 text-[12px] text-fg-2">{s}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-[12.5px] text-fg-2">
        {Object.entries(stats.by_level || {}).map(([k, v]) => <Chip key={k}>{LEVELS[k] || k}: <Mono>{v}</Mono></Chip>)}
      </div>
      <section className="overflow-hidden rounded-xl bg-card ring-1 ring-inset ring-line">
        <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-[14px] font-semibold">Grupos</h2><Mono className="text-fg-3">{rows.length}</Mono>
          <label className="relative ml-auto flex w-full items-center sm:w-64"><span className="sr-only">Buscar grupo</span><Search className="pointer-events-none absolute left-3 h-4 w-4 text-fg-3" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" className="field h-8 pl-9 text-[13px]" /></label>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead className="text-[12px] text-fg-2"><tr className="border-b border-line">
              <th className="px-5 py-2.5 font-medium">Proyecto</th><th className="px-3 py-2.5 font-medium">Coordinación</th><th className="px-3 py-2.5 font-medium">Integrantes</th><th className="px-3 py-2.5 font-medium">Tareas</th><th className="px-3 py-2.5 font-medium">Creado</th><th className="px-5 py-2.5 text-right font-medium">Plan</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {list.map((r) => (
                <tr key={r.id} className="hover:bg-hov">
                  <td className="px-5 py-3"><span className="block font-medium">{r.name}</span><span className="text-[12px] text-fg-2">{r.course || 'Sin curso'}{r.status !== 'activo' ? ', archivado' : ''}</span></td>
                  <td className="px-3 py-3">{r.coordinator || '—'}</td>
                  <td className="px-3 py-3 font-mono">{r.members}</td>
                  <td className="px-3 py-3 font-mono">{r.tasks_done}/{r.tasks}</td>
                  <td className="px-3 py-3 text-fg-2">{ago(r.created_at)}</td>
                  <td className="px-5 py-3 text-right">
                    {r.plan === 'premium'
                      ? <Btn size="xs" kind="secondary" onClick={() => setPlan(r, 'gratis')}><Sparkles className="h-3 w-3 text-accent-ink" />Premium</Btn>
                      : <Btn size="xs" kind="ghost" onClick={() => setPlan(r, 'premium')}>Gratis</Btn>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="text-[12px] text-fg-2">Cambiar el plan a «Gratis» desactiva el chat y los recordatorios de ese grupo. Durante el lanzamiento todos los grupos nuevos empiezan en Premium.</p>
    </div>
  );
}
