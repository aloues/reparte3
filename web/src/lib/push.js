import { supabase, VAPID_PUBLIC_KEY } from './supabase';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

let regPromise = null;
export function registerSW() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  if (!regPromise) regPromise = navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => null);
  return regPromise;
}

function b64ToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await registerSW();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Pide permiso y guarda la suscripción de este dispositivo. Devuelve true si quedó activa. */
export async function enablePush() {
  if (!pushSupported()) throw new Error(isIOS() && !isStandalone()
    ? 'En iPhone, primero añade Reparte3 a la pantalla de inicio (Compartir > Añadir a inicio) y ábrela desde ahí.'
    : 'Este navegador no admite notificaciones push.');
  if (!VAPID_PUBLIC_KEY) throw new Error('Las notificaciones push aún no están configuradas en el servidor.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Bloqueaste las notificaciones. Actívalas en la configuración del navegador para este sitio.');
  const reg = await registerSW();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC_KEY) });
  const j = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200) });
  if (error) throw error;
  return true;
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
}

/** Muestra un aviso del sistema cuando la pestaña está oculta y este equipo no recibe push. */
export async function localNotify(title, body, url) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = await registerSW();
    if (reg) reg.showNotification(title, { body, icon: 'icon-192.png', data: { url } });
  } catch (e) { /* sin aviso del sistema */ }
}
