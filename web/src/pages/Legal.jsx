import { ArrowLeft } from 'lucide-react';

// BORRADOR: debe revisarlo una persona con conocimiento legal antes del uso público (Ley 29733 y su reglamento).
export default function LegalPage() {
  const back = () => { if (window.history.length > 1) window.history.back(); else window.location.hash = '#/'; };
  return (
    <div className="gutter min-h-[100dvh] bg-canvas py-10">
      <article className="mx-auto max-w-[68ch] text-[14.5px] leading-relaxed">
        <button type="button" onClick={back} className="mb-8 inline-flex items-center gap-1.5 text-[13px] text-fg-2 hover:text-fg"><ArrowLeft className="h-4 w-4" />Volver</button>
        <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Política de privacidad</h1>
        <p className="mt-2 text-[13px] text-fg-2">Versión preliminar del 10 de noviembre de 2026. Proyecto estudiantil en etapa piloto.</p>

        <h2 className="mt-8 text-[17px] font-semibold">Qué datos guardamos</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Tu nombre, correo, fecha de nacimiento y si estudias en universidad, instituto o colegio.</li>
          <li>Lo que tú y tu grupo crean en la app: proyectos, tareas, mensajes, comentarios y archivos.</li>
          <li>Si activas los avisos, un identificador técnico de tu navegador para poder enviártelos.</li>
        </ul>

        <h2 className="mt-8 text-[17px] font-semibold">Para qué los usamos</h2>
        <p className="mt-2">Solo para que funcione Reparte3: mostrarle a tu grupo el trabajo compartido y enviarte avisos y recordatorios. No vendemos datos ni mostramos publicidad. La fecha de nacimiento sirve para confirmar que tienes 14 años o más.</p>

        <h2 className="mt-8 text-[17px] font-semibold">Quién puede verlos</h2>
        <p className="mt-2">Las personas de cada proyecto ven su contenido. Un docente invitado ve el avance, pero no escribe. La administración de Reparte3 ve cifras generales y nombres de grupos, no el contenido de chats ni archivos. Los datos se guardan en Supabase, nuestro proveedor de base de datos.</p>

        <h2 className="mt-8 text-[17px] font-semibold">Edad mínima</h2>
        <p className="mt-2">Reparte3 es para personas de 14 años o más. Si tienes menos, no crees una cuenta.</p>

        <h2 className="mt-8 text-[17px] font-semibold">Tus derechos</h2>
        <p className="mt-2">Puedes corregir tu nombre en Ajustes y eliminar tu cuenta desde la misma pantalla en cualquier momento. Para otras solicitudes de acceso, rectificación, cancelación u oposición, escríbenos al contacto del equipo.</p>

        <h2 className="mt-8 text-[17px] font-semibold">Conducta en el chat</h2>
        <p className="mt-2">El chat es para coordinar el trabajo. No compartas datos sensibles ni contenido ofensivo. La coordinación del grupo puede retirar a una persona del proyecto.</p>
      </article>
    </div>
  );
}
