// Recorrido visual con dos personas reales contra Supabase local + `vite preview`.
// Requiere: `supabase start`, `npm run build` con .env.local, y `npx vite preview --port 4173`.
// Uso: node scripts/ui-smoke.mjs   (capturas en ../docs/capturas/v1/)
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.APP_URL || 'http://localhost:4173/';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOTS = path.join(here, '..', '..', 'docs', 'capturas', 'v1');
const FIXTURE = path.join(here, '..', '..', 'tests', 'fixtures', 'consigna.docx');
fs.mkdirSync(SHOTS, { recursive: true });
const run = Date.now().toString(36);
const errors = [];
let step = 0;
const shot = async (page, name) => { await new Promise((r) => setTimeout(r, 450)); await page.screenshot({ path: path.join(SHOTS, `${String(++step).padStart(2, '0')}_${name}.png`) }); console.log(`  captura ${name}`); };
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) errors.push(m); };

async function setValue(page, sel, value) {
  await page.waitForSelector(sel, { visible: true });
  await page.$eval(sel, (el, v) => {
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    if (el.tagName === 'SELECT') el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}
async function clickText(page, text, tag = 'button') {
  const ok2 = await page.evaluate((t, tg) => {
    const el = [...document.querySelectorAll(tg)].find((e) => e.textContent.trim().includes(t) && e.offsetParent !== null && !e.disabled);
    if (el) { el.click(); return true; } return false;
  }, text, tag);
  if (!ok2) throw new Error(`No encontré «${text}»`);
}
const waitText = (page, text, timeout = 15000) => page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);

async function register(page, name, email) {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await clickText(page, 'Créala');
  await setValue(page, '#au-name', name);
  await setValue(page, '#au-email', email);
  await setValue(page, '#au-pass', 'clave-de-prueba-123');
  await setValue(page, '#au-birth', '2004-05-01');
  await page.click('#au-terms');
  await clickText(page, 'Crear cuenta');
}

const pages = [];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--lang=es-PE'] });
try {
  const ctxA = await browser.createIncognitoBrowserContext();
  const A = await ctxA.newPage(); pages.push(A);
  A.on('pageerror', (e) => errors.push(`Ana: ${e.message}`));
  A.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|WebSocket|favicon/i.test(m.text())) errors.push(`Ana consola: ${m.text()}`); });
  await A.setViewport({ width: 1366, height: 860 });
  await A.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);

  console.log('\nAna se registra y crea un proyecto');
  await A.goto(BASE, { waitUntil: 'networkidle0' });
  await shot(A, 'acceso');
  await register(A, 'Ana Torres', `ana-${run}@test.local`);
  await waitText(A, 'Empecemos tu primer trabajo');
  ok(true, 'Ana entra y ve la bienvenida');
  await shot(A, 'bienvenida');

  await clickText(A, 'Nuevo proyecto');
  await setValue(A, '#wz-name', 'Informe de gestión ambiental');
  await setValue(A, '#wz-course', 'Comunicación II');
  await setValue(A, '#wz-due', '2026-12-04');
  await clickText(A, 'Continuar');
  const input = await A.waitForSelector('#wz-file');
  await input.uploadFile(FIXTURE);
  await waitText(A, 'tareas propuestas', 20000);
  const nTasks = await A.$$eval('[id^="wz-t-"]', (els) => els.length);
  ok(nTasks > 0, `la consigna .docx propone ${nTasks} tareas`);
  await shot(A, 'asistente_tareas');
  await clickText(A, 'Crear con');
  await waitText(A, 'Proyecto creado');
  await A.waitForFunction(() => document.querySelector('#wz-link')?.value.includes('/unirse/'), { timeout: 10000 });
  const invite = await A.$eval('#wz-link', (e) => e.value);
  ok(invite.includes('#/unirse/'), 'se genera el enlace de invitación');
  await shot(A, 'asistente_invitar');
  await clickText(A, 'Ir al proyecto');
  await A.waitForFunction(() => location.hash.startsWith('#/p/'));
  const pid = await A.evaluate(() => location.hash.split('/')[2]);
  await waitText(A, 'Tareas');
  await shot(A, 'proyecto_lista');

  console.log('\nBeto entra con el enlace');
  const ctxB = await browser.createIncognitoBrowserContext();
  const B = await ctxB.newPage(); pages.push(B);
  B.on('pageerror', (e) => errors.push(`Beto: ${e.message}`));
  await B.setViewport({ width: 1366, height: 860 });
  await B.goto(invite, { waitUntil: 'networkidle0' });
  await waitText(B, 'Te invitaron a un grupo');
  await clickText(B, 'Créala');
  await setValue(B, '#au-name', 'Beto Ríos');
  await setValue(B, '#au-email', `beto-${run}@test.local`);
  await setValue(B, '#au-pass', 'clave-de-prueba-123');
  await setValue(B, '#au-birth', '2005-03-10');
  await B.click('#au-terms');
  await clickText(B, 'Crear cuenta');
  await waitText(B, 'Unirme al grupo');
  await shot(B, 'unirse');
  await clickText(B, 'Unirme al grupo');
  await B.waitForFunction((p) => location.hash.startsWith(`#/p/${p}`), {}, pid);
  ok(true, 'Beto se une al grupo');
  await waitText(A, 'se unió', 15000).then(() => ok(true, 'Ana recibe el aviso en tiempo real de que Beto se unió')).catch(() => ok(false, 'aviso en tiempo real de nuevo integrante'));

  console.log('\nAna asigna una tarea a Beto');
  await A.goto(`${BASE}#/p/${pid}`, { waitUntil: 'networkidle0' });
  await A.waitForSelector('button[aria-haspopup="dialog"]');
  await A.click('button[aria-haspopup="dialog"]');
  await A.waitForSelector('#dr-who', { visible: true });
  // El nuevo integrante llega por tiempo real; se espera a que aparezca en el selector.
  await A.waitForFunction(() => [...document.querySelectorAll('#dr-who option')].some((o) => o.textContent.includes('Beto')), { timeout: 10000 });
  const betoId = await A.$$eval('#dr-who option', (os) => os.find((o) => o.textContent.includes('Beto'))?.value);
  await setValue(A, '#dr-who', betoId);
  await waitText(A, 'Asignaste la tarea a Beto');
  await shot(A, 'tarea_panel');
  await A.keyboard.press('Escape');

  await waitText(B, 'te asignó', 15000).then(() => ok(true, 'a Beto le llega «te asignó…» al instante')).catch(() => ok(false, 'aviso de asignación en tiempo real'));
  await shot(B, 'beto_aviso');
  await B.click('button[aria-label^="Notificaciones"]');
  await waitText(B, 'Nuevas');
  await shot(B, 'beto_notificaciones');
  await clickText(B, 'te asignó');
  await waitText(B, 'Aceptar tarea');
  await clickText(B, 'Aceptar tarea');
  await waitText(B, 'Aceptaste la tarea');
  ok(true, 'Beto acepta la tarea desde el panel');
  await B.keyboard.press('Escape');

  console.log('\nChat del grupo');
  await B.goto(`${BASE}#/p/${pid}/chat`, { waitUntil: 'networkidle0' });
  await setValue(B, `#msg-${pid}`, 'Hola Ana, ya acepté mi parte. Mañana subo el avance.');
  await B.focus(`#msg-${pid}`); await B.keyboard.press('Enter');
  await waitText(B, 'Mañana subo el avance');
  await A.goto(`${BASE}#/p/${pid}/chat`, { waitUntil: 'networkidle0' });
  await waitText(A, 'Mañana subo el avance');
  ok(true, 'Ana lee el mensaje de Beto en el chat');
  await setValue(A, `#msg-${pid}`, '¡Genial! Yo reviso la introducción.');
  await A.focus(`#msg-${pid}`); await A.keyboard.press('Enter');
  await waitText(B, 'Yo reviso la introducción', 15000).then(() => ok(true, 'Beto recibe la respuesta en tiempo real')).catch(() => ok(false, 'chat en tiempo real'));
  await shot(A, 'chat');

  console.log('\nVistas, tema oscuro y móvil');
  await A.goto(`${BASE}#/`, { waitUntil: 'networkidle0' });
  await clickText(A, 'Tablero');
  await shot(A, 'inicio_tablero');
  await clickText(A, 'Resumen');
  await shot(A, 'inicio_resumen');
  await A.goto(`${BASE}#/p/${pid}/equipo`, { waitUntil: 'networkidle0' });
  await waitText(A, 'Qué puede hacer cada rol');
  await shot(A, 'equipo_roles');
  await A.evaluate(() => { localStorage.setItem('r3-theme', '"dark"'); location.hash = '#/'; });
  await A.reload({ waitUntil: 'networkidle0' });
  await clickText(A, 'Lista');
  await shot(A, 'inicio_oscuro');
  await A.goto(`${BASE}#/ajustes`, { waitUntil: 'networkidle0' });
  await waitText(A, 'Avisos en este dispositivo');
  await shot(A, 'ajustes_oscuro');
  await B.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await B.goto(`${BASE}#/`, { waitUntil: 'networkidle0' });
  await shot(B, 'movil_inicio');
  const overflow = await B.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok(!overflow, 'en móvil (390 px) no hay desplazamiento horizontal');
  await B.goto(`${BASE}#/p/${pid}/chat`, { waitUntil: 'networkidle0' });
  await shot(B, 'movil_chat');
} catch (e) {
  errors.push(e.message);
  console.log(`✗ ${e.message}`);
  for (const [i, p] of pages.entries()) { try { await p.screenshot({ path: path.join(SHOTS, `FALLO_${i}.png`) }); console.log(`  FALLO_${i}: ${await p.evaluate(() => location.hash)}`); } catch (x) { /* nada */ } }
} finally {
  await browser.close();
}
console.log(errors.length ? `\nProblemas:\n- ${errors.join('\n- ')}` : '\nSin errores.');
process.exit(errors.length ? 1 : 0);
