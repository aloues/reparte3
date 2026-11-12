import { useEffect, useMemo, useState } from 'react';
import {
  Home, CircleUser, FolderOpen, Sparkles, Shield, Plus, PanelLeftClose, PanelLeftOpen, X, Menu, Bell, Sun, Moon,
  ChevronsUpDown, Undo2, CheckCheck, Info, AlertTriangle, WifiOff,
} from 'lucide-react';
import { configured } from './lib/supabase';
import { AppProvider, useApp } from './lib/store';
import { useRoute, go, parse } from './lib/router';
import { useTheme, useLocal, useMedia } from './lib/hooks';
import { myQueue, initials } from './lib/format';
import { Avatar, Mono, IconBtn } from './components/ui';
import NotificationsPanel from './components/Notifications';
import TaskDrawer from './components/TaskDrawer';
import Wizard from './components/Wizard';
import InstallHint from './components/InstallHint';
import { AuthPage, Onboarding, ResetPassword, SetupScreen, Splash } from './pages/Auth';
import Dashboard from './pages/Dashboard';
import ProjectsPage from './pages/Projects';
import ProjectPage from './pages/Project';
import JoinPage from './pages/Join';
import PremiumPage from './pages/Premium';
import SettingsPage from './pages/Settings';
import AdminPage from './pages/Admin';
import LegalPage from './pages/Legal';
import LandingPage from './pages/Landing';

export default function App() {
  if (!configured) return <SetupScreen />;
  return <AppProvider><Root /></AppProvider>;
}

function Root() {
  const { session, profile, recovery } = useApp();
  const route = useRoute();
  const [theme, setTheme] = useTheme();
  if (route.parts[0] === 'privacidad') return <LegalPage />;
  if (session === undefined) return <Splash />;
  if (recovery) return <ResetPassword />;
  if (!session) {
    if (route.parts[0] === 'unirse' && route.parts[1]) { try { sessionStorage.setItem('r3-join', route.parts[1]); } catch (e) { /* nada */ } }
    // La portada explica el producto; el acceso vive en #/entrar. Una invitación va directo al acceso.
    if (route.parts[0] === 'entrar' || route.parts[0] === 'unirse') return <AuthPage theme={theme} setTheme={setTheme} initialMode={route.query.modo === 'registro' ? 'register' : 'login'} />;
    // Enlace directo (p. ej. «Revisar asignación» desde un correo): pedir acceso y volver ahí después de entrar.
    if (route.parts[0]) {
      try { sessionStorage.setItem('r3-next', window.location.hash); } catch (e) { /* nada */ }
      return <AuthPage theme={theme} setTheme={setTheme} initialMode="login" />;
    }
    return <LandingPage theme={theme} setTheme={setTheme} />;
  }
  if (profile === undefined) return <Splash />;
  if (profile === null) return <Onboarding />;
  return <Shell route={route} theme={theme} setTheme={setTheme} />;
}

/* ================= barra lateral ================= */
function SideItem({ icon: I, label, active, collapsed, count, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-current={active ? 'page' : undefined} aria-label={collapsed ? label : undefined}
            className={`group relative flex h-9 items-center rounded-lg text-[13.5px] transition-all duration-200 ${collapsed ? 'w-9 justify-center' : 'gap-3 px-2.5'} ${active ? 'bg-hov2 font-medium text-fg' : 'text-fg-2 hover:bg-hov hover:text-fg'}`}>
      <I className={`h-4 w-4 shrink-0 ${active ? 'text-fg' : 'text-fg-3 group-hover:text-fg-2'}`} />
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && count > 0 && <Mono className="ml-auto text-fg-2">{count}</Mono>}
      {collapsed && count > 0 && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent" />}
      {collapsed && <span role="tooltip" className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-md bg-fg px-2 py-1 text-[12px] font-medium text-canvas opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-hover:delay-150">{label}</span>}
    </button>
  );
}

function ThemeToggle({ theme, setTheme, collapsed }) {
  if (collapsed) {
    return <IconBtn label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="h-9 w-9">
      {theme === 'dark' ? <Moon key="m" className="pop h-4 w-4" /> : <Sun key="s" className="pop h-4 w-4" />}
    </IconBtn>;
  }
  return (
    <div role="radiogroup" aria-label="Tema" className="relative grid grid-cols-2 rounded-lg bg-hov p-0.5 ring-1 ring-inset ring-line">
      <span aria-hidden="true" className={`absolute bottom-0.5 left-0.5 top-0.5 w-[calc(50%-2px)] rounded-md bg-card shadow-xs ring-1 ring-inset ring-line transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] ${theme === 'dark' ? 'translate-x-full' : ''}`} />
      {[['light', Sun, 'Claro'], ['dark', Moon, 'Oscuro']].map(([id, I, lb]) => (
        <button key={id} type="button" role="radio" aria-checked={theme === id} onClick={() => setTheme(id)}
                className={`relative z-10 flex h-7 items-center justify-center gap-1.5 text-[12.5px] transition-colors ${theme === id ? 'font-medium text-fg' : 'text-fg-2 hover:text-fg'}`}>
          <I className="h-3.5 w-3.5" />{lb}
        </button>
      ))}
    </div>
  );
}

function Sidebar({ route, open, onClose, collapsed, setCollapsed, theme, setTheme, onNew, queueCount }) {
  const { projects, profile, tasks } = useApp();
  const c = collapsed;
  const at = route.parts[0] || 'inicio';
  const nav = (to) => { go(to); onClose(); };
  const active = projects.filter((p) => p.status === 'activo');
  const attention = (pid) => tasks.some((t) => t.project_id === pid && t.status === 'bloqueada');
  return (
    <>
      <button type="button" aria-label="Cerrar menú" tabIndex={-1} onClick={onClose}
              className={`fixed inset-0 z-30 bg-overlay backdrop-blur-[2px] transition-opacity duration-300 lg:hidden ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`} />
      <aside aria-label="Navegación"
             className={`fixed inset-y-0 left-0 z-40 w-[272px] border-r border-line bg-side transition-[transform,width] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] lg:sticky lg:top-0 lg:z-auto lg:h-[100dvh] lg:shrink-0 lg:translate-x-0 lg:border-0 lg:visible ${c ? 'lg:w-[68px]' : 'lg:w-[248px]'} ${open ? 'translate-x-0 shadow-pop' : 'invisible -translate-x-full'}`}
             style={{ paddingLeft: 'env(safe-area-inset-left, 0px)', paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className={`flex h-full flex-col gap-6 py-5 ${c ? 'items-center overflow-visible' : 'overflow-y-auto px-3'}`}>
          <div className={`flex items-center ${c ? 'flex-col gap-3' : 'justify-between pl-2'}`}>
            <button type="button" onClick={() => nav('/')} className="flex items-center gap-2.5 rounded-lg">
              <img src="./icon.svg" alt="" className="h-7 w-7" />
              {!c && <span className="text-[15.5px] font-semibold tracking-[-0.02em]">Reparte3</span>}
            </button>
            <IconBtn label={c ? 'Expandir barra lateral' : 'Contraer barra lateral'} onClick={() => setCollapsed(!c)} className="hidden text-fg-3 lg:grid">
              {c ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </IconBtn>
            <IconBtn label="Cerrar menú" onClick={onClose} className="lg:hidden"><X className="h-4 w-4" /></IconBtn>
          </div>

          <button type="button" onClick={() => { onClose(); onNew(); }} aria-label="Nuevo proyecto"
                  className={`group flex h-9 items-center justify-center gap-2 rounded-lg bg-accent text-[13.5px] font-medium text-on-accent shadow-glow transition-all duration-200 hover:-translate-y-px hover:brightness-110 active:translate-y-0 active:scale-[.98] ${c ? 'w-9' : 'w-full px-3'}`}>
            <Plus className="sw-bold h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
            {!c && <>Nuevo proyecto<kbd className="ml-auto rounded bg-white/15 px-1.5 font-mono text-[10.5px]">N</kbd></>}
          </button>

          <nav aria-label="Principal" className={`flex flex-col gap-0.5 ${c ? 'items-center' : ''}`}>
            <SideItem icon={Home} label="Inicio" active={at === 'inicio'} collapsed={c} onClick={() => nav('/')} />
            <SideItem icon={CircleUser} label="Mis tareas" active={at === 'mis-tareas'} collapsed={c} count={queueCount} onClick={() => nav('/mis-tareas')} />
            <SideItem icon={FolderOpen} label="Proyectos" active={at === 'proyectos'} collapsed={c} onClick={() => nav('/proyectos')} />
            <SideItem icon={Sparkles} label="Premium" active={at === 'premium'} collapsed={c} onClick={() => nav('/premium')} />
            {profile?.is_admin && <SideItem icon={Shield} label="Administración" active={at === 'admin'} collapsed={c} onClick={() => nav('/admin')} />}
          </nav>

          {!c && active.length > 0 && (
            <div>
              <p className="px-2.5 pb-2 text-[11.5px] font-medium text-fg-3">Tus grupos</p>
              <div className="flex flex-col gap-0.5">
                {active.map((p) => {
                  const here = route.parts[0] === 'p' && route.parts[1] === p.id;
                  return (
                    <button key={p.id} type="button" onClick={() => nav(`/p/${p.id}`)} aria-current={here ? 'page' : undefined}
                            className={`group flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] transition-colors ${here ? 'bg-hov2 text-fg' : 'text-fg-2 hover:bg-hov hover:text-fg'}`}>
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-hov2 text-[9px] font-semibold text-fg-2">{initials(p.name)}</span>
                      <span className="truncate">{p.name}</span>
                      {attention(p.id) && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-red" title="Hay un bloqueo" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className={`mt-auto flex flex-col gap-3 ${c ? 'items-center' : ''}`}>
            <ThemeToggle theme={theme} setTheme={setTheme} collapsed={c} />
            <button type="button" onClick={() => nav('/ajustes')} aria-label={`${profile.display_name}, ajustes`}
                    className={`group flex items-center rounded-xl text-left transition-colors hover:bg-hov ${c ? 'p-1' : 'gap-3 p-2'} ${at === 'ajustes' ? 'bg-hov' : ''}`}>
              <Avatar name={profile.display_name} me size="lg" ring="side" />
              {!c && <>
                <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium leading-5">{profile.display_name}</span><span className="block text-[12px] leading-4 text-fg-2">Ajustes y avisos</span></span>
                <ChevronsUpDown className="h-4 w-4 text-fg-3 group-hover:text-fg-2" />
              </>}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

/* ================= avisos en pantalla ================= */
function Toasts() {
  const { toasts, dismiss } = useApp();
  const icon = (k) => (k === 'error' ? AlertTriangle : k === 'info' ? Info : k === 'bell' ? Bell : CheckCheck);
  return (
    // Arriba, no abajo: así un aviso que llega en tiempo real nunca tapa «Confirmar», «Asignar» o «Aceptar»,
    // que viven en la parte inferior de las ventanas (en el celular el aviso ocupaba todo el ancho de abajo).
    <div aria-live="polite" className="pointer-events-none fixed right-0 top-0 z-[70] flex w-full max-w-[400px] flex-col gap-2"
         style={{ paddingRight: 'max(16px, env(safe-area-inset-right, 0px))', paddingTop: 'max(12px, env(safe-area-inset-top, 0px))', paddingLeft: 16 }}>
      {toasts.slice(-2).map((t) => {
        const I = icon(t.icon);
        const open = t.notif ? () => {
          const n = t.notif;
          go(n.task_id ? `/p/${n.project_id}?tarea=${n.task_id}` : n.project_id ? `/p/${n.project_id}${n.kind === 'mensaje' ? '/chat' : ''}` : '/');
          dismiss(t.id);
        } : null;
        return (
          // El cuerpo del aviso deja pasar los toques (pointer-events-none); solo sus botones responden.
          <div key={t.id} role={t.icon === 'error' ? 'alert' : 'status'} className="toast anim-toast pointer-events-none relative overflow-hidden rounded-xl bg-fg text-canvas shadow-pop [&_button]:pointer-events-auto">
            <div className="flex items-start gap-3 p-3.5 pr-2.5">
              <I className={`mt-0.5 h-4 w-4 shrink-0 ${t.icon === 'bell' ? 'ring-bell' : 'opacity-80'}`} />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] leading-5">{t.text}</p>
                {t.notif?.body && <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-5 opacity-70">{t.notif.body}</p>}
              </div>
              {open && <button type="button" onClick={open} className="shrink-0 rounded-md px-2 py-0.5 text-[13px] font-semibold underline decoration-canvas/40 underline-offset-2 hover:decoration-canvas">Ver</button>}
              {t.action && <button type="button" onClick={() => { t.action.fn(); dismiss(t.id); }} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[13px] font-semibold underline decoration-canvas/40 underline-offset-2 hover:decoration-canvas"><Undo2 className="h-3.5 w-3.5" />{t.action.label}</button>}
              <button type="button" onClick={() => dismiss(t.id)} aria-label="Cerrar aviso" className="grid h-6 w-6 shrink-0 place-items-center rounded-md opacity-60 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
            </div>
            <div className="toast-bar absolute bottom-0 left-0 h-[2px] w-full bg-canvas/30" onAnimationEnd={() => dismiss(t.id)} />
          </div>
        );
      })}
    </div>
  );
}

/* ================= armazón ================= */
const TITLES = { inicio: 'Inicio', 'mis-tareas': 'Mis tareas', proyectos: 'Proyectos', premium: 'Premium', ajustes: 'Ajustes', admin: 'Administración', unirse: 'Unirse a un grupo' };

function Shell({ route, theme, setTheme }) {
  const { tasks, projects, uid, notifs, online, project } = useApp();
  const isLg = useMedia('(min-width: 1024px)');
  const [collapsed, setCollapsed] = useLocal('r3-collapsed', false);
  const [menu, setMenu] = useState(false);
  const [wizard, setWizard] = useState(false);
  const [bell, setBell] = useState(false);
  const queue = useMemo(() => myQueue(tasks, projects, uid), [tasks, projects, uid]);
  const unread = notifs.filter((n) => !n.read_at).length;
  const at = route.parts[0] || 'inicio';
  const taskId = route.query.tarea;

  // Después de entrar desde #/entrar, ir al inicio.
  useEffect(() => {
    let next = null;
    try { next = sessionStorage.getItem('r3-next'); if (next) sessionStorage.removeItem('r3-next'); } catch (e) { /* nada */ }
    if (next && !next.startsWith('#/entrar')) window.location.hash = next;
    else if (at === 'entrar') go('/');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Invitación pendiente guardada antes de iniciar sesión.
  useEffect(() => {
    try { const code = sessionStorage.getItem('r3-join'); if (code) { sessionStorage.removeItem('r3-join'); go(`/unirse/${code}`); } } catch (e) { /* nada */ }
  }, []);
  useEffect(() => { document.title = unread ? `(${unread}) Reparte3` : 'Reparte3'; }, [unread]);
  useEffect(() => {
    const onKey = (e) => {
      const el = document.activeElement;
      if (el && (/INPUT|TEXTAREA|SELECT/.test(el.tagName) || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey || wizard || taskId || bell) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setWizard(true); }
      if (e.key === '[') setCollapsed(!collapsed);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [wizard, taskId, bell, collapsed, setCollapsed]);

  const closeTask = () => { const { parts, query } = parse(); const q = new URLSearchParams(query); q.delete('tarea'); const s = q.toString(); go(`/${parts.map(encodeURIComponent).join('/')}${s ? `?${s}` : ''}`); };
  const p = at === 'p' ? project(route.parts[1]) : null;
  const title = p ? p.name : TITLES[at] || 'Reparte3';

  let page;
  if (at === 'inicio') page = <Dashboard scope="all" route={route} onNew={() => setWizard(true)} />;
  else if (at === 'mis-tareas') page = <Dashboard scope="mine" route={route} onNew={() => setWizard(true)} />;
  else if (at === 'proyectos') page = <ProjectsPage onNew={() => setWizard(true)} />;
  else if (at === 'p') page = <ProjectPage id={route.parts[1]} tab={route.parts[2] || 'resumen'} route={route} />;
  else if (at === 'unirse') page = <JoinPage code={route.parts[1]} />;
  else if (at === 'premium') page = <PremiumPage />;
  else if (at === 'ajustes') page = <SettingsPage theme={theme} setTheme={setTheme} />;
  else if (at === 'admin') page = <AdminPage />;
  else page = <Dashboard scope="all" route={route} onNew={() => setWizard(true)} />;

  return (
    <div className="lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-lg focus:bg-fg focus:px-3 focus:py-2 focus:text-canvas">Saltar al contenido</a>
      <Sidebar route={route} open={menu} onClose={() => setMenu(false)} collapsed={collapsed && isLg} setCollapsed={setCollapsed}
               theme={theme} setTheme={setTheme} onNew={() => setWizard(true)} queueCount={queue.length} />
      <div className="min-w-0 flex-1 overflow-x-clip lg:py-2 lg:pr-2">
        <div className="r3-ruled min-h-[100dvh] lg:min-h-[calc(100dvh-16px)] lg:rounded-xl lg:shadow-xs lg:ring-1 lg:ring-inset lg:ring-line">
          <header className="sticky top-[env(safe-area-inset-top,0px)] z-20 border-b border-line bg-canvas/85 backdrop-blur-md lg:rounded-t-xl">
            <div className="gutter mx-auto flex h-14 max-w-[1280px] items-center gap-2">
              <IconBtn label="Abrir menú" onClick={() => setMenu(true)} className="-ml-1.5 h-9 w-9 lg:hidden"><Menu className="h-5 w-5" /></IconBtn>
              <nav aria-label="Ruta" className="flex min-w-0 items-center gap-1.5 text-[13.5px]">
                {p && <><button type="button" onClick={() => go('/proyectos')} className="hidden text-fg-2 hover:text-fg sm:inline">Proyectos</button><span className="hidden text-fg-3 sm:inline">/</span></>}
                <h1 className="truncate font-medium">{title}</h1>
              </nav>
              <div className="ml-auto flex items-center gap-1.5">
                {!online && <span className="hidden items-center gap-1.5 rounded-md bg-orange/10 px-2 py-1 text-[12px] font-medium text-orange sm:inline-flex"><WifiOff className="h-3.5 w-3.5" />Sin conexión</span>}
                <button type="button" onClick={() => setBell(true)} aria-label={unread ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'}
                        className="relative grid h-9 w-9 place-items-center rounded-lg text-fg-2 transition-all hover:bg-hov hover:text-fg">
                  <Bell key={unread} className={`h-[18px] w-[18px] ${unread ? 'ring-bell' : ''}`} />
                  {unread > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-accent px-1 font-mono text-[10px] font-medium text-on-accent">{unread > 9 ? '9+' : unread}</span>}
                </button>
                <button type="button" onClick={() => setWizard(true)} aria-label="Nuevo proyecto" className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-on-accent shadow-glow active:scale-95 lg:hidden"><Plus className="sw-bold h-4 w-4" /></button>
              </div>
            </div>
          </header>
          <main id="main" tabIndex={-1} className="gutter mx-auto max-w-[1280px] pb-24 pt-6 outline-none lg:pt-8"><InstallHint />{page}</main>
        </div>
      </div>
      <TaskDrawer taskId={taskId} onClose={closeTask} />
      <NotificationsPanel open={bell} onClose={() => setBell(false)} />
      <Wizard open={wizard} onClose={() => setWizard(false)} />
      <Toasts />
    </div>
  );
}
