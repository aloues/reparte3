// Recorrido V3 (centro de proyecto) con datos realistas, contra Supabase LOCAL + `vite preview`.
// Arma el proyecto por API (dos personas, estados variados, dependencias, consigna PDF, enlaces, chat)
// y luego entra como la coordinadora para recorrer y fotografiar cada pestaña, con clics reales.
// Uso: SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/ui-v3.mjs   (capturas en ../docs/capturas/v3/)
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { fromFormat, distribute, buildCheckpoints } from '../src/lib/plan.js';
import { analyzeBrief } from '../src/lib/detect.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.APP_URL || 'http://localhost:4173/';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(here, '..', '..', 'docs', 'capturas', 'v3');
const PDF = path.join(here, '..', '..', 'tests', 'fixtures', 'consigna.pdf');
const URL_ = process.env.SUPABASE_URL; const ANON = process.env.SUPABASE_ANON_KEY;
if (!URL_ || !ANON) { console.error('Faltan SUPABASE_URL o SUPABASE_ANON_KEY'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const run = Date.now().toString(36);
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) errors.push(m); };
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const PASS = 'clave-de-prueba-123';

async function user(label, name) {
  const c = createClient(URL_, ANON, opts);
  const email = `${label}-${run}@test.local`;
  const { data, error } = await c.auth.signUp({ email, password: PASS, options: { data: { display_name: name, birth_date: '2004-05-01', level: 'universidad' } } });
  if (error) throw error;
  if (!data.session) await c.auth.signInWithPassword({ email, password: PASS });
  return { c, id: data.user.id, email };
}

/* ------------------------------------------------------------------ datos por API */
const BRIEF = ['Proyecto final: Plan de reciclaje para el campus', 'El grupo debe entregar un informe y una exposición.', '1. Investigar cuánta basura genera el campus', '2. Encuestar a 30 estudiantes sobre sus hábitos', '3. Diseñar la propuesta de puntos de acopio', '4. Redactar el informe (máximo 12 páginas)', '5. Preparar las diapositivas de la exposición', '6. Exponer en clase el 28/11/2026', 'Criterios: claridad, evidencia y trabajo en equipo.'].join('\n');
const A = await user('ana', 'Ana Torres'); const B = await user('beto', 'Beto Ramos');
const pid = (await A.c.rpc('create_project', { p_name: 'Plan de reciclaje del campus', p_course: 'Emprendimiento I', p_due: '2026-12-04', p_expected: 2 })).data;
const inv = (await A.c.from('invites').insert({ project_id: pid, role: 'integrante' }).select().single()).data;
await B.c.rpc('join_project', { p_code: inv.code });
const plan = fromFormat(analyzeBrief(BRIEF, 2026));
const dist = distribute(plan, [A.id, B.id], { expected: 2 });
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
const cps = buildCheckpoints(plan, { today, due: '2026-12-04' });
await A.c.rpc('save_plan', { p_project: pid, p_checkpoints: cps.checkpoints, p_tasks: plan.map((t) => ({ key: t.id, title: t.title, hours: t.hours, phase: t.phase, kind: 'requisito', origin: 'formato', due_date: cps.taskDue[t.id], checkpoint: cps.taskCheckpoint[t.id], source_line: t.line, assignee: dist.assign[t.id], reserved: false })) });
const ts = (await A.c.from('tasks').select('*').eq('project_id', pid).order('seq')).data;
const byTitle = (s) => ts.find((t) => t.title.includes(s));
// Dependencias reales: redactar depende de encuestar; diapositivas depende de redactar.
await A.c.from('tasks').update({ depends_on: byTitle('Encuestar').id }).eq('id', byTitle('Redactar').id);
await A.c.from('tasks').update({ depends_on: byTitle('Redactar').id }).eq('id', byTitle('diapositivas').id);
const actAs = async (u, t, action, note, url) => { const r = await u.c.rpc('task_action', { p_task: t.id, p_action: action, p_note: note || null, p_url: url || null }); if (r.error) console.log('   (aviso)', action, r.error.message); };
const mine = (u) => ts.filter((t) => t.assignee === u.id);
for (const t of mine(B)) await actAs(B, t, 'aceptar');
for (const t of mine(A).slice(0, 2)) await actAs(A, t, 'aceptar');
const tb = mine(B);
if (tb[0]) { await actAs(B, tb[0], 'iniciar'); await actAs(B, tb[0], 'entregar', null, 'https://docs.google.com/document/d/informe/edit'); await actAs(A, tb[0], 'aprobar', 'Buen trabajo'); }
if (tb[1]) await actAs(B, tb[1], 'iniciar');
if (tb[2]) await actAs(B, tb[2], 'bloquear', 'Faltan los datos de la encuesta');
await A.c.from('projects').update({ goal: 'Proponer un plan de reciclaje viable para el campus, con datos de una encuesta propia.', brief_text: BRIEF, brief_file: 'consigna.pdf' }).eq('id', pid);
const pdf = fs.readFileSync(PDF);
const up = await A.c.storage.from('archivos').upload(`${pid}/consigna/${run}-consigna.pdf`, pdf, { contentType: 'application/pdf' });
if (!up.error) await A.c.from('projects').update({ brief_path: `${pid}/consigna/${run}-consigna.pdf`, brief_mime: 'application/pdf', brief_size: pdf.length }).eq('id', pid);
await A.c.from('project_links').insert({ project_id: pid, url: 'https://docs.google.com/document/d/informe/edit', title: 'Informe final (borrador)', task_id: byTitle('Redactar').id, added_by: A.id });
await A.c.from('project_links').insert({ project_id: pid, url: 'https://docs.google.com/presentation/d/expo/edit', title: 'Diapositivas de la exposición', added_by: A.id });
const pinMsg = (await A.c.from('messages').insert({ project_id: pid, body: 'Reunión de avance el jueves a las 7 pm por Meet.' }).select().single()).data;
await A.c.from('messages').update({ pinned: true }).eq('id', pinMsg.id);
await B.c.from('messages').insert({ project_id: pid, body: `Subí las respuestas de la encuesta aquí: https://docs.google.com/spreadsheets/d/encuesta/edit` });
await B.c.from('messages').insert({ project_id: pid, body: `La #${byTitle('Encuestar').seq} ya va por la mitad. ¿Alguien revisa la #${byTitle('Redactar').seq} cuando esté?` });
await A.c.rpc('create_project', { p_name: 'Ensayo de Comunicación', p_course: 'Comunicación II', p_due: '2026-12-10', p_tasks: [{ title: 'Elegir el tema del ensayo', hours: 1 }, { title: 'Buscar 5 fuentes', hours: 2 }] });
console.log('Datos de prueba listos.');

/* ------------------------------------------------------------------ navegador */
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--lang=es-PE'] });
const shot = async (page, name, full = false) => { await page.bringToFront(); await sleep(900); await page.screenshot({ path: path.join(OUT, `app_${name}.png`), fullPage: full }); console.log(`  captura app_${name}`); };
async function login(vp, theme = 'light') {
  const ctx = await browser.createIncognitoBrowserContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|WebSocket|favicon|functions/i.test(m.text())) errors.push(`consola: ${m.text()}`); });
  await page.setViewport(vp);
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
  await page.goto(`${BASE}#/entrar`, { waitUntil: 'networkidle0' });
  await page.type('#au-email', A.email); await page.type('#au-pass', PASS);
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Entrar')?.click());
  await page.waitForFunction(() => !document.querySelector('#au-email'), { timeout: 20000 });
  return page;
}
const goTab = async (page, tab) => { await page.goto(`${BASE}#/p/${pid}${tab ? `/${tab}` : ''}`, { waitUntil: 'networkidle0' }); await sleep(500); };
const drawerOpen = (page) => page.waitForFunction(() => { const d = document.querySelector('[aria-labelledby="dr-title"]'); return d && !d.hasAttribute('inert'); }, { timeout: 8000 }).then(() => true).catch(() => false);

try {
  console.log('\nComputadora');
  const P = await login({ width: 1440, height: 900 });
  await goTab(P, '');
  ok(await P.evaluate(() => /Qué te toca/.test(document.body.innerText) && /Qué está en riesgo/.test(document.body.innerText)), 'Resumen: objetivo, avance, siguiente paso y riesgos');
  ok(await P.evaluate(() => document.body.innerText.includes('Faltan los datos de la encuesta') || document.body.innerText.includes('está bloqueada')), 'Resumen explica el bloqueo con su motivo');
  await sleep(1500); await shot(P, 'resumen', true);
  await goTab(P, 'tareas'); await shot(P, 'tareas');
  await goTab(P, 'flujo');
  ok(await P.evaluate(() => document.querySelectorAll('.flow-node').length >= 6 && document.querySelectorAll('svg path[marker-end]').length === 2), 'Flujo: nodos reales y 2 flechas (las 2 dependencias definidas)');
  ok(await P.evaluate(() => !!document.querySelector('.flow-lista') && !!document.querySelector('.flow-en_curso') && !!document.querySelector('.flow-bloqueada')), 'Flujo: verde (aprobada), amarillo (en curso) y rojo (bloqueada) según estados reales');
  await shot(P, 'flujo');
  await P.click('button.flow-node.flow-bloqueada');
  ok(await drawerOpen(P), 'clic en un nodo del Flujo abre esa tarea');
  await shot(P, 'flujo_tarea');
  await goTab(P, 'consigna');
  await P.waitForSelector('iframe[title^="Consigna"]', { timeout: 15000 }).then(() => ok(true, 'Consigna: el PDF original se ve dentro de la app')).catch(() => ok(false, 'Consigna: el PDF original se ve dentro de la app'));
  await shot(P, 'consigna_original');
  await P.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Texto')?.click());
  await sleep(400);
  ok(await P.evaluate(() => [...document.querySelectorAll('button')].some((b) => /^#\d+$/.test(b.textContent.trim()))), 'Consigna: las líneas que generaron tareas están marcadas y enlazadas');
  await shot(P, 'consigna_texto');
  await goTab(P, 'archivos');
  ok(await P.evaluate(() => document.body.innerText.includes('Informe final (borrador)') && document.body.innerText.includes('Del chat')), 'Archivos: enlaces agregados y los compartidos en el chat');
  await shot(P, 'archivos');
  await goTab(P, 'chat');
  await sleep(600);
  ok(await P.evaluate(() => document.body.innerText.includes('1 fijado')), 'Chat: mensaje fijado visible');
  await P.evaluate(() => [...document.querySelectorAll('li[id^="m-"] button')].find((b) => /^#\d+$/.test(b.textContent.trim()))?.click());
  ok(await drawerOpen(P), 'Chat: tocar #n abre esa tarea');
  await shot(P, 'chat');
  await goTab(P, 'actividad'); await shot(P, 'actividad');
  await P.goto(`${BASE}#/`, { waitUntil: 'networkidle0' }); await sleep(500);
  ok(await P.evaluate(() => document.body.innerText.includes('Tus pendientes') && document.body.innerText.includes('Tus proyectos')), 'Hoy: pendientes por acción y proyectos con sus 4 tiempos');
  await shot(P, 'hoy', true);
  console.log('\nFiltro por proyecto en Mis tareas');
  await P.goto(`${BASE}#/mis-tareas`, { waitUntil: 'networkidle0' });
  await P.click('#dash-proj');
  await P.evaluate(() => [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent.includes('Ensayo de Comunicación'))?.click());
  await sleep(400);
  ok(await P.evaluate(() => location.hash.includes('proyectos=')), 'la selección queda en la URL');
  ok(await P.evaluate(() => !document.querySelector('main').innerText.includes('Investigar cuánta basura') && document.querySelector('main').innerText.includes('No hay tareas en los proyectos elegidos')), 'solo se ven tareas del proyecto elegido');
  await shot(P, 'mis_tareas_filtro');

  console.log('\nEnlace de correo sin sesión: lleva a la tarea después de entrar');
  {
    const ctx = await browser.createIncognitoBrowserContext();
    const D = await ctx.newPage();
    await D.setViewport({ width: 1280, height: 860 });
    const target = byTitle('Redactar');
    await D.goto(`${BASE}#/p/${pid}?tarea=${target.id}`, { waitUntil: 'networkidle0' });
    ok(await D.evaluate(() => document.body.innerText.includes('Entra para revisar la tarea que te asignaron')), 'sin sesión, el enlace pide entrar (no muestra la landing)');
    await D.type('#au-email', A.email); await D.type('#au-pass', PASS);
    await D.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Entrar')?.click());
    await D.waitForFunction(() => !document.querySelector('#au-email'), { timeout: 20000 });
    const opened = await drawerOpen(D) && await D.waitForFunction((t) => document.querySelector('#dr-title')?.textContent.includes(t), { timeout: 10000 }, target.title.slice(0, 20)).then(() => true).catch(() => false);
    ok(opened, 'al entrar, se abre justo esa tarea');
    await shot(D, 'enlace_tarea_tras_login');
    await ctx.close();
  }

  console.log('\nCelular y tablet');
  const M = await login({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await M.goto(`${BASE}#/`, { waitUntil: 'networkidle0' }); await sleep(400); await shot(M, 'movil_hoy');
  for (const t of ['', 'tareas', 'flujo', 'chat', 'archivos']) {
    await goTab(M, t);
    const over = await M.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    ok(!over, `celular, ${t || 'resumen'}: sin desplazamiento horizontal`);
    await shot(M, `movil_${t || 'resumen'}`);
  }
  const Tb = await login({ width: 820, height: 1180, isMobile: true, hasTouch: true }, 'dark');
  await goTab(Tb, ''); await shot(Tb, 'tablet_resumen_oscuro');
  await goTab(Tb, 'flujo'); await shot(Tb, 'tablet_flujo_oscuro');
} catch (e) {
  errors.push(`Interrumpido: ${e.message}`); console.log(`✗ ${e.message}`);
} finally { await browser.close(); }
console.log(errors.length ? `\nProblemas (${errors.length}):\n- ${errors.join('\n- ')}` : '\nSin errores.');
process.exit(errors.length ? 1 : 0);
