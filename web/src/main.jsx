import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { registerSW } from './lib/push';

registerSW();
// Al tocar una notificación con la app abierta, el service worker pide navegar aquí.
navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data?.type === 'open' && e.data.url) {
    try { const u = new URL(e.data.url); window.location.hash = u.hash; } catch (err) { /* url inválida */ }
  }
});

createRoot(document.getElementById('root')).render(<App />);
