import { useEffect, useState } from 'react';

// Rutas con # para que GitHub Pages no devuelva 404 al recargar: #/p/<id>/chat?tarea=<id>
export function parse(hash = window.location.hash) {
  const h = hash.replace(/^#\/?/, '');
  const [path, qs = ''] = h.split('?');
  return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), query: Object.fromEntries(new URLSearchParams(qs)) };
}
export function useRoute() {
  const [route, setRoute] = useState(() => parse());
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
export const go = (to) => { const next = to.startsWith('#') ? to : `#${to}`; if (window.location.hash !== next) window.location.hash = next; };
export const appUrl = (to = '/') => `${window.location.origin}${window.location.pathname}#${to}`;
