// Google Drive Picker (opcional). Solo se activa si existen VITE_GOOGLE_CLIENT_ID y VITE_GOOGLE_API_KEY.
// Alcance mínimo: drive.file (la app solo ve los archivos que la persona elige en el Picker).
// No se guarda ningún token: se usa en el navegador para abrir el Picker y se descarta.
// Lo que queda en Reparte3 es solo el enlace, el nombre y el tipo del archivo elegido.
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';
const APP_ID = import.meta.env.VITE_GOOGLE_APP_ID || '';
export const pickerEnabled = !!(CLIENT_ID && API_KEY);

const load = (src) => new Promise((resolve, reject) => {
  if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
  const s = document.createElement('script');
  s.src = src; s.async = true; s.onload = () => resolve(); s.onerror = () => reject(new Error('No se pudo cargar Google. Revisa tu conexión.'));
  document.head.appendChild(s);
});

async function ready() {
  await Promise.all([load('https://accounts.google.com/gsi/client'), load('https://apis.google.com/js/api.js')]);
  await new Promise((resolve, reject) => window.gapi.load('picker', { callback: resolve, onerror: () => reject(new Error('No se pudo cargar el selector de Drive.')) }));
}

function token() {
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (r) => (r.error ? reject(new Error(r.error === 'access_denied' ? 'Cancelaste el permiso de Google.' : 'Google no dio permiso.')) : resolve(r.access_token)),
      error_callback: (e) => reject(new Error(e?.type === 'popup_closed' ? 'Cerraste la ventana de Google.' : 'No se pudo abrir el permiso de Google (¿ventanas emergentes bloqueadas?).')),
    });
    client.requestAccessToken({ prompt: '' });
  });
}

/** Abre el Picker y devuelve [{ url, title, mime }] de lo elegido, o [] si se cancela. */
export async function pickFromDrive() {
  if (!pickerEnabled) throw new Error('El selector de Google Drive no está configurado en este servidor.');
  await ready();
  const accessToken = await token();
  return new Promise((resolve) => {
    const G = window.google.picker;
    const view = new G.DocsView(G.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(true);
    const builder = new G.PickerBuilder()
      .addView(view)
      .enableFeature(G.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(accessToken)
      .setDeveloperKey(API_KEY)
      .setLocale('es')
      .setCallback((data) => {
        if (data.action === G.Action.PICKED) resolve(data.docs.map((d) => ({ url: d.url, title: d.name, mime: d.mimeType })));
        else if (data.action === G.Action.CANCEL) resolve([]);
      });
    if (APP_ID) builder.setAppId(APP_ID);
    builder.build().setVisible(true);
  });
}
