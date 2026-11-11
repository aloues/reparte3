import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL || '';
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const configured = Boolean(url && key && !url.includes('TU-PROYECTO'));
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

// pkce: los enlaces de confirmación y recuperación vuelven con ?code= y no chocan con el router #/.
export const supabase = configured
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } })
  : null;

/** Traduce errores de Supabase/Postgres a mensajes claros en español. */
export function errMsg(e) {
  if (!e) return 'Algo salió mal. Intenta de nuevo.';
  const m = String(e.message || e.error_description || e);
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sin conexión con el servidor. Revisa tu internet e intenta de nuevo.';
  if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (/Email not confirmed/i.test(m)) return 'Confirma tu correo con el enlace que te enviamos antes de entrar.';
  if (/User already registered|already been registered/i.test(m)) return 'Ya existe una cuenta con ese correo. Inicia sesión.';
  if (/Password should be at least/i.test(m)) return 'La contraseña debe tener al menos 8 caracteres.';
  if (/rate limit|too many/i.test(m)) return 'Demasiados intentos seguidos. Espera un minuto e intenta otra vez.';
  if (/Database error saving new user/i.test(m)) return 'No se pudo crear la cuenta. Revisa la fecha de nacimiento: Reparte3 es para personas de 14 años o más.';
  if (e.code === '42501' || /row-level security|permission denied/i.test(m)) return m.length < 140 && !/row-level|permission denied/i.test(m) ? m : 'No tienes permiso para hacer esto en este proyecto.';
  if (e.code === 'P0001') return m;
  if (/JWT expired/i.test(m)) return 'Tu sesión venció. Vuelve a iniciar sesión.';
  if (/payload too large|exceeded the maximum allowed size/i.test(m)) return 'El archivo pesa más de 10 MB.';
  return m.length < 200 ? m : 'Algo salió mal. Intenta de nuevo.';
}
