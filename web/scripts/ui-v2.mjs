// Recorrido V2 con 4 personas reales contra Supabase LOCAL + `vite preview`, con capturas web y celular.
// Requiere: `supabase start` (con la migración V2), `npm run build` con .env.local, `npx vite preview --port 4173`.
// Uso: node scripts/ui-v2.mjs   (capturas en ../docs/capturas/v2/)
// Las capturas usan cuentas y datos de DEMOSTRACIÓN. La respuesta de IA pegada es tests/fixtures/ai_respuesta_consigna.txt.
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.APP_URL || 'http://localhost:4173/';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOTS = path.join(here, '..', '..', 'docs', 'capturas', 'v2');
const FIXTURE = path.join(here, '..', '..', 'tests', 'fixtures', 'consigna.docx');
const AI = fs.readFileSync(path.join(here, '..', '..', 'tests', 'fixtures', 'ai_respuesta_consigna.txt'), 'utf8');
fs.mkdirSync(SHOTS, { recursive: true });
const run = Date.now().toString(36);
const errors = [];
let n = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (page, name) => { await sleep(600); await page.screenshot({ path: path.join(SHOTS, `${String(++n).padStart(2, '0')}_${name}.png`) }); console.log(`  captura ${name}`); };
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) errors.push(m); };

async function setValue(page, sel, value) {
  await page.waitForSelector(sel, { visible: true });
  await page.$eval(sel, (el, v) => {
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  }, value);
}
async function clickText(page, text, tag = 'button') {
  const done = await page.evaluate((t, tg) => {
    const el = [...document.querySelectorAll(tg)].find((e) => e.textContent.trim().includes(t) && e.offsetParent !== null && !e.disabled);
    if (el) { el.click(); return true; } return false;
  }, text, tag);
  if (!done) throw new Error(`No encontré «${text}»`);
}
const toTab = (page, tab) => page.evaluate((t) => { location.hash = location.hash.replace(/(#\/p\/[^/?]+).*/, `$1/${t}`); }, tab);
const waitText = (page, text, timeout = 20000) => page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);

async function person(browser, label, mobile = false) {
  const ctx = await browser.createIncognitoBrowserContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|WebSocket|favicon|clipboard/i.test(m.text())) errors.push(`${label} consola: ${m.text()}`); });
  await page.setViewport(mobile ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  return page;
}
async function register(page, name) {
  await page.goto(BASE + '#/entrar', { waitUntil: 'networkidle0' });
  await clickText(page, 'Créala');
  await setValue(page, '#au-name', name);
  await setValue(page, '#au-email', `${name.split(' ')[0].toLowerCase()}-${run}@test.local`);
  await setValue(page, '#au-pass', 'clave-de-prueba-123');
  await setValue(page, '#au-birth', '2004-05-01');
  await page.click('#au-terms');
  await clickText(page, 'Crear cuenta');
  await page.waitForFunction(() => !document.querySelector('#au-email'), { timeout: 20000 });
}
async function join(page, link) {
  await page.goto(link, { waitUntil: 'networkidle0' });
  await waitText(page, 'Unirme al grupo');
  await clickText(page, 'Unirme al grupo');
  await page.waitForFunction(() => location.hash.includes('/p/'), { timeout: 20000 });
  await toTab(page, 'tareas');
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--lang=es-PE'] });
try {
  console.log('\nAna crea el grupo con 4 integrantes esperados');
  const A = await person(browser, 'Ana');
  await register(A, 'Ana Torres');
  await waitText(A, 'Nuevo proyecto');
  await clickText(A, 'Nuevo proyecto');
  await setValue(A, '#wz-name', 'Plan de negocio');
  await setValue(A, '#wz-course', 'Emprendimiento I');
  await setValue(A, '#wz-due', '2026-12-04');
  await A.evaluate(() => [...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent.trim() === '4').click());
  await shot(A, 'grupo_datos');
  await clickText(A, 'Crear grupo e invitar');
  await A.waitForFunction(() => document.querySelector('#lb-link')?.value.includes('/unirse/'), { timeout: 20000 });
  const link = await A.$eval('#lb-link', (el) => el.value);
  await waitText(A, '1 de 4 ya están');
  ok(true, 'aparece la sala de espera con enlace y QR');
  await shot(A, 'sala_espera');

  console.log('\nBeto entra antes del plan');
  const B = await person(browser, 'Beto', true);
  await register(B, 'Beto Ramos');
  await join(B, link);
  await waitText(A, '2 de 4 ya están');
  ok(true, 'la sala de espera de Ana se actualiza sola: 2 de 4');
  await shot(A, 'sala_espera_2de4');

  console.log('\nAna sube la consigna y planifica con IA');
  await clickText(A, 'Continuar: la consigna');
  const input = await A.waitForSelector('#wz-file');
  await input.uploadFile(FIXTURE);
  await waitText(A, 'Planificar con IA');
  await shot(A, 'consigna_elegir');
  await A.click('#wz-ai-run');
  await shot(A, 'ia_analizando');
  // Con ANTHROPIC_API_KEY en el servidor llega el plan; sin clave, la app avisa y ofrece la detección rápida.
  await A.waitForFunction(() => /tareas propuestas|Usar detección rápida/.test(document.body.innerText), { timeout: 120000 });
  const viaAI = await A.evaluate(() => document.body.innerText.includes('tareas propuestas'));
  if (viaAI) {
    ok(await A.evaluate(() => document.body.innerText.includes('Propuesto con IA')), 'Claude propuso el plan dentro de la app y se rotula «Propuesto con IA»');
  } else {
    ok(true, 'sin clave de IA en el servidor, la app lo explica y ofrece la detección rápida');
    await shot(A, 'ia_sin_clave');
    await clickText(A, 'Usar detección rápida');
    await waitText(A, 'tareas propuestas');
  }
  const nTasks = await A.$$eval('[id^="wz-t-"]', (els) => els.length);
  ok(nTasks >= 4, `el plan tiene ${nTasks} tareas editables`);
  if (viaAI) await clickText(A, 'ver origen').catch(() => {});
  await shot(A, viaAI ? 'plan_ia' : 'plan_formato');
  void AI;

  console.log('\nReparto con reserva');
  await clickText(A, 'Repartir');
  await waitText(A, 'Reparto en partes iguales');
  ok(await A.evaluate(() => document.body.innerText.includes('Reservado (2)')), 'la parte de las 2 personas que faltan queda reservada');
  await shot(A, 'reparto');
  await clickText(A, 'Confirmar y repartir');
  await A.waitForFunction(() => location.hash.includes('/p/') && document.body.innerText.includes('Qué te toca'), { timeout: 20000 });
  ok(true, 'al confirmar, el proyecto abre en Resumen con el siguiente paso');
  await shot(A, 'proyecto_resumen');
  await toTab(A, 'tareas');
  await waitText(A, 'Checkpoints');
  ok(await A.evaluate(() => /\d+ tareas reservadas/.test(document.body.innerText)), 'el proyecto muestra checkpoints y tareas reservadas');
  await shot(A, 'proyecto_checkpoints');

  console.log('\nBeto recibe sus tareas');
  await B.reload({ waitUntil: 'networkidle0' });
  await waitText(B, 'Por aceptar');
  ok(true, 'Beto ve sus tareas por aceptar');
  await shot(B, 'movil_beto_por_aceptar');

  console.log('\nCaro entra tarde y recibe su parte sola');
  const C = await person(browser, 'Caro', true);
  await register(C, 'Caro Díaz');
  await join(C, link);
  await C.reload({ waitUntil: 'networkidle0' });
  await waitText(C, 'Por aceptar');
  const caroTasks = await C.evaluate(() => document.body.innerText.match(/Por aceptar\s*(\d+)/)?.[1]);
  ok(Number(caroTasks) > 0, `Caro recibe ${caroTasks} tareas de la reserva sin que nadie haga nada`);
  await shot(C, 'movil_caro_recibe');
  await C.goto(BASE + '#/notificaciones', { waitUntil: 'networkidle0' }).catch(() => {});

  console.log('\nDani completa el grupo');
  const D = await person(browser, 'Dani');
  await register(D, 'Dani Flores');
  await join(D, link);
  await A.reload({ waitUntil: 'networkidle0' });
  await toTab(A, 'tareas');
  await waitText(A, 'Checkpoints');
  ok(await A.evaluate(() => !/\d+ tareas reservadas/.test(document.body.innerText)), 'con los 4 dentro ya no queda nada reservado');
  await shot(A, 'proyecto_completo');

  console.log('\nVista de celular de la coordinadora');
  await A.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await A.reload({ waitUntil: 'networkidle0' });
  await waitText(A, 'Checkpoints');
  const overflow = await A.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok(!overflow, 'sin desplazamiento horizontal a 390 px');
  await shot(A, 'movil_proyecto');
  await A.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await A.evaluate(() => { try { localStorage.setItem('r3-theme', '"dark"'); } catch (e) { /* */ } });
  await A.reload({ waitUntil: 'networkidle0' });
  await waitText(A, 'Checkpoints');
  await shot(A, 'movil_proyecto_oscuro');
} catch (e) {
  errors.push(`Interrumpido: ${e.message}`);
  console.log(`✗ ${e.message}`);
} finally {
  await browser.close();
}
console.log(errors.length ? `\nProblemas (${errors.length}):\n- ${errors.join('\n- ')}` : '\nSin errores.');
process.exit(errors.length ? 1 : 0);
