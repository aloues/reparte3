// Planificación con IA desde la app: la web manda el texto de la consigna a la Edge Function
// «analizar-consigna», que llama a Claude con la clave del servidor. El usuario no sale de Reparte3.
import { supabase } from './supabase';

/** Devuelve { plan, model, usage, ms } o lanza un Error con `code` y un mensaje en español. */
export async function planWithAI(projectId, text) {
  const { data, error } = await supabase.functions.invoke('analizar-consigna', { body: { project_id: projectId, text } });
  if (!error) return data;
  let info = null;
  try { info = await error.context?.json?.(); } catch (e) { /* respuesta sin JSON */ }
  const err = new Error(info?.error || 'No se pudo conectar con la IA. Revisa tu conexión o usa la detección rápida.');
  err.code = info?.code || 'network';
  throw err;
}
