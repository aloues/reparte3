// Prueba de la Edge Function «analizar-consigna» contra Supabase LOCAL (o un proyecto de prueba).
// Sin ANTHROPIC_API_KEY verifica permisos, validaciones y la respuesta «no_key».
// Con la clave configurada (supabase/functions/.env o secretos) también hace un análisis real y lo valida.
// Uso: SUPABASE_URL=... SUPABASE_ANON_KEY=... node web/scripts/ai-check.mjs [--real]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { validatePlan } from '../src/lib/plan.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const URL = process.env.SUPABASE_URL; const ANON = process.env.SUPABASE_ANON_KEY;
if (!URL || !ANON) { console.error('Faltan SUPABASE_URL o SUPABASE_ANON_KEY'); process.exit(2); }
const REAL = process.argv.includes('--real');
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const run = Date.now().toString(36);
let pass = 0; let fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.log(`  ✗ ${m}${x ? ` — ${x}` : ''}`); } };
async function user(label) {
  const c = createClient(URL, ANON, opts);
  const email = `${label}-${run}@test.reparte3.local`;
  const { data, error } = await c.auth.signUp({ email, password: 'clave-de-prueba-123', options: { data: { display_name: label, birth_date: '2004-05-01', level: 'universidad' } } });
  if (error) throw error;
  if (!data.session) await c.auth.signInWithPassword({ email, password: 'clave-de-prueba-123' });
  return { c, id: data.user.id };
}
const call = async (u, body) => {
  const { data, error } = await u.c.functions.invoke('analizar-consigna', { body });
  if (!error) return { status: 200, data };
  let info = null; try { info = await error.context.json(); } catch (e) { /* */ }
  return { status: error.context?.status, data: info };
};

const BRIEF = fs.readFileSync(path.join(here, '..', '..', 'tests', 'fixtures', 'consigna.md'), 'utf8');
const A = await user('coord'); const B = await user('integrante');
const pid = (await A.c.rpc('create_project', { p_name: `IA ${run}`, p_course: 'Prueba', p_due: '2026-12-15', p_expected: 4 })).data;
const inv = (await A.c.from('invites').insert({ project_id: pid, role: 'integrante' }).select().single()).data;
await B.c.rpc('join_project', { p_code: inv.code });

console.log('\nPermisos y validaciones');
const r1 = await call(B, { project_id: pid, text: BRIEF });
ok(r1.status === 403 && r1.data?.code === 'forbidden', 'un integrante que no coordina no puede usar la IA', JSON.stringify(r1));
const r2 = await call(A, { project_id: pid, text: 'muy corto' });
ok(r2.status === 400 && r2.data?.code === 'too_short', 'un texto casi vacío (PDF escaneado) se rechaza con explicación', JSON.stringify(r2));
const r3 = await call(A, { project_id: pid, text: 'x'.repeat(70000) });
ok(r3.status === 413 && r3.data?.code === 'too_long', 'una consigna demasiado larga se rechaza sin truncarla', JSON.stringify(r3));
const r4 = await call(A, { project_id: 'no-es-uuid', text: BRIEF });
ok(r4.status === 400, 'un proyecto inválido se rechaza');

console.log(REAL ? '\nAnálisis real con Claude' : '\nSin clave de IA');
const r5 = await call(A, { project_id: pid, text: BRIEF });
if (!REAL) {
  ok(r5.status === 503 && r5.data?.code === 'no_key', 'sin ANTHROPIC_API_KEY responde «no_key» y la web ofrece la detección rápida', JSON.stringify(r5));
} else {
  ok(r5.status === 200, `responde en ${Math.round((r5.data?.ms || 0) / 1000)} s con ${r5.data?.model}`, JSON.stringify(r5.data));
  const v = validatePlan(r5.data?.plan, BRIEF, { defaultYear: 2026 });
  ok(v.ok && v.tasks.length >= 4, `el plan valida: ${v.tasks.length} tareas, ${v.warnings.length} ajustes`, v.errors.join('; '));
  ok(!v.warnings.some((w) => /no aparece en la consigna/.test(w)), 'no inventó fechas');
  console.log(`  tokens: ${r5.data?.usage?.input_tokens} de entrada, ${r5.data?.usage?.output_tokens} de salida`);
  v.tasks.forEach((t) => console.log(`    - [${t.kind}] ${t.title} (${t.hours} h, ${t.phase}, líneas ${t.lines.join(',') || '—'})`));
}
console.log(`\nResultado: ${pass} pasan, ${fail} fallan`);
process.exit(fail ? 1 : 0);
