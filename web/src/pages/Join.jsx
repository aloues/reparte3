import { useEffect, useState } from 'react';
import { Users, AlertTriangle, ArrowRight } from 'lucide-react';
import { useApp } from '../lib/store';
import { go } from '../lib/router';
import { ROLES } from '../lib/format';
import { Btn, Spinner } from '../components/ui';

export default function JoinPage({ code }) {
  const { previewInvite, joinProject } = useApp();
  const [info, setInfo] = useState(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => { previewInvite(code).then((r) => setInfo(Array.isArray(r) ? r[0] || null : null)); }, [code]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (info?.already) go(`/p/${info.project_id}`); }, [info]);

  if (info === undefined || info?.already) return <Spinner label="Revisando la invitación…" />;
  const join = async () => { setBusy(true); const id = await joinProject(code); setBusy(false); if (id) go(`/p/${id}`); };
  return (
    <div className="anim-enter mx-auto max-w-md py-10 text-center">
      {!info || !info.valid ? <>
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-orange/10 text-orange"><AlertTriangle className="h-5 w-5" /></span>
        <h2 className="mt-5 text-[22px] font-semibold tracking-[-0.02em]">Este enlace ya no sirve</h2>
        <p className="mt-2 text-[14px] text-fg-2">{info ? `La invitación a «${info.project_name}» venció o se desactivó.` : 'No encontramos esta invitación.'} Pide un enlace nuevo a quien coordina el grupo.</p>
        <Btn className="mt-6" onClick={() => go('/')}>Ir al inicio</Btn>
      </> : <>
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent/10 text-accent"><Users className="h-5 w-5" /></span>
        <p className="mt-5 text-[13.5px] text-fg-2">Te invitaron a</p>
        <h2 className="mt-1 text-[24px] font-semibold tracking-[-0.025em]" style={{ textWrap: 'balance' }}>{info.project_name}</h2>
        <p className="mt-2 text-[14px] text-fg-2">{info.course ? `${info.course}, ` : ''}{info.members} {info.members === 1 ? 'persona' : 'personas'} en el grupo</p>
        <div className="mx-auto mt-6 max-w-sm rounded-xl bg-card p-4 text-left ring-1 ring-inset ring-line">
          <p className="text-[13px] font-medium">Entrarás como {ROLES[info.role].short.toLowerCase()}</p>
          <p className="mt-1 text-[12.5px] text-fg-2">{ROLES[info.role].desc}</p>
        </div>
        <Btn kind="primary" size="lg" className="mt-6 w-full max-w-sm" loading={busy} onClick={join}>Unirme al grupo<ArrowRight className="h-4 w-4" /></Btn>
      </>}
    </div>
  );
}
