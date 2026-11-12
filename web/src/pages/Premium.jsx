import { Sparkles, MessageCircle, BellRing, Clock, Users, GraduationCap, Check, Paperclip } from 'lucide-react';
import { useApp } from '../lib/store';
import { isPremium } from '../lib/format';
import { Chip } from '../components/ui';

const FEATURES = [
  [MessageCircle, 'Chat del grupo y comentarios por tarea', 'Toda la conversación del trabajo dentro de Reparte3, junto a la tarea de la que habla.'],
  [BellRing, 'Notificaciones en el celular y la compu', 'Avisos cuando te asignan algo, cuando alguien entrega, cuando hay un bloqueo o un mensaje nuevo.'],
  [Clock, 'Recordatorios automáticos de avance', 'Un día antes y el día de cada entrega, si una tarea vence y si falta aceptar una tarea.'],
  [Users, 'Roles en el grupo', 'Coordinación, integrantes y revisión, para que cada entrega tenga quién la apruebe.'],
  [GraduationCap, 'Acceso para docentes', 'El profesor puede ver el avance y los bloqueos con un enlace de solo lectura.'],
  [Paperclip, 'Archivos privados del grupo', 'Hasta 10 MB por archivo, visibles solo para quienes están en el proyecto.'],
];

export default function PremiumPage() {
  const { projects } = useApp();
  const premium = projects.filter((p) => isPremium(p) && p.status === 'activo');
  return (
    <div className="mx-auto max-w-4xl">
      <section className="relative overflow-hidden rounded-2xl bg-card p-8 ring-1 ring-inset ring-line sm:p-10">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full" style={{ background: 'radial-gradient(closest-side, rgb(var(--accent) / .14), transparent)' }} />
        <Chip tone="accent"><Sparkles className="h-3 w-3" />Gratis durante el lanzamiento</Chip>
        <h2 className="relative mt-4 max-w-xl text-[30px] font-semibold leading-[1.15] tracking-[-0.03em]" style={{ textWrap: 'balance' }}>Todo el trabajo en grupo, sin depender del chat de WhatsApp</h2>
        <p className="relative mt-3 max-w-xl text-[15px] leading-relaxed text-fg-2">Por ahora Premium está activo sin costo en todos los grupos. Cuando empecemos a cobrar, el pago será por grupo y lo avisaremos con anticipación dentro de la app.</p>
        {premium.length > 0 && <p className="relative mt-5 flex items-center gap-2 text-[13.5px]"><Check className="sw-bold h-4 w-4 text-accent-ink" />Activo en {premium.length} {premium.length === 1 ? 'grupo tuyo' : 'grupos tuyos'}.</p>}
      </section>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(([I, t, x]) => (
          <li key={t} className="rounded-xl bg-card p-6 ring-1 ring-inset ring-line">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-hov2"><I className="h-4 w-4" /></span>
            <h3 className="mt-4 text-[14.5px] font-semibold">{t}</h3>
            <p className="mt-1 text-[13.5px] leading-relaxed text-fg-2">{x}</p>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-[12.5px] text-fg-2">Para recibir avisos con la app cerrada, actívalos en Ajustes en cada dispositivo. En iPhone, primero añade Reparte3 a la pantalla de inicio.</p>
    </div>
  );
}
