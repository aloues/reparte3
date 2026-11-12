// Consigna: guarda el archivo original en el almacenamiento privado del proyecto (bucket «archivos»)
// junto con su texto extraído, para mostrarlo en el visor. Solo la coordinación puede reemplazarla (RLS).
import { supabase } from './supabase';

export const BRIEF_MAX = 10 * 1024 * 1024;
export const VIEWABLE = (mime = '', name = '') => (/pdf/i.test(mime) || /\.pdf$/i.test(name) ? 'pdf' : /^image\//i.test(mime) ? 'image' : null);

export async function uploadBriefFile(projectId, file, previousPath) {
  if (file.size > BRIEF_MAX) throw new Error(`«${file.name}» pesa más de 10 MB.`);
  const safe = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80);
  const path = `${projectId}/consigna/${crypto.randomUUID()}-${safe}`;
  const up = await supabase.storage.from('archivos').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (up.error) throw up.error;
  // El archivo anterior se borra después de guardar el nuevo (las tareas conservan su línea y su versión).
  return { path, mime: file.type || null, size: file.size, cleanup: async () => { if (previousPath && previousPath !== path) await supabase.storage.from('archivos').remove([previousPath]); } };
}

export async function briefDownload(path, name) {
  const { data, error } = await supabase.storage.from('archivos').createSignedUrl(path, 120, { download: name || true });
  if (error) throw error;
  window.open(data.signedUrl, '_blank', 'noopener');
}
