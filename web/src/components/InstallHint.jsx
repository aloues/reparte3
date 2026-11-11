import { useEffect, useState } from 'react';
import { X, Share, PlusSquare, Download } from 'lucide-react';
import { Btn } from './ui';

const KEY = 'r3-install-hint';
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * Aviso para instalar la app en el celular:
 * - iPhone/iPad en el navegador: pasos de Safari (iOS no tiene aviso automático de instalación).
 * - Android: botón «Instalar» con el aviso del sistema.
 * - Ya instalada o descartada: no se muestra.
 */
export default function InstallHint() {
  const [prompt, setPrompt] = useState(null);
  const [hidden, setHidden] = useState(() => { try { return standalone() || localStorage.getItem(KEY) === 'no'; } catch (e) { return standalone(); } });
  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setPrompt(e); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);
  const dismiss = () => { setHidden(true); try { localStorage.setItem(KEY, 'no'); } catch (e) { /* sin almacenamiento */ } };
  if (hidden) return null;
  const ios = isIOS();
  if (!ios && !prompt) return null;
  return (
    <aside className="anim-enter mb-5 flex items-start gap-3 rounded-xl bg-card p-3.5 ring-1 ring-inset ring-line lg:hidden" aria-label="Instalar Reparte3">
      <img src="./apple-touch-icon.png" alt="" className="h-10 w-10 shrink-0 rounded-[10px]" />
      <div className="min-w-0 flex-1 text-[13px] leading-5">
        <p className="font-medium">Instala Reparte3 en tu celular</p>
        {ios ? (
          <p className="mt-0.5 text-fg-2">
            En <strong className="font-medium text-fg">Safari</strong>, toca <Share className="inline h-3.5 w-3.5 -translate-y-px" aria-label="Compartir" /> y luego
            {' '}<span className="whitespace-nowrap font-medium text-fg"><PlusSquare className="inline h-3.5 w-3.5 -translate-y-px" /> Agregar a inicio</span>.
            Ábrela desde el ícono y activa los avisos en Ajustes.
          </p>
        ) : (
          <>
            <p className="mt-0.5 text-fg-2">Se abre como una app, sin barra del navegador, y te llegan los avisos.</p>
            <Btn kind="primary" size="sm" className="mt-2" onClick={async () => { prompt.prompt(); await prompt.userChoice.catch(() => null); setPrompt(null); dismiss(); }}><Download className="h-4 w-4" />Instalar</Btn>
          </>
        )}
      </div>
      <button type="button" onClick={dismiss} aria-label="No mostrar más" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-fg-3 hover:bg-hov hover:text-fg"><X className="h-4 w-4" /></button>
    </aside>
  );
}
