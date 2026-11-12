// Recorrido en CELULAR (390×844) con TOQUES REALES contra Supabase local + `vite preview`.
// A diferencia de ui-v2.mjs, aquí cada botón se toca en su posición en pantalla: si está tapado,
// cortado o fuera de la vista, la prueba falla (así se detectan botones que no se pueden presionar).
// Uso: node scripts/ui-mobile.mjs   (capturas en ../docs/capturas/v2/movil_*)
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.APP_URL || 'http://localhost:4173/';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOTS = path.join(here, '..', '..', 'docs', 'capturas', 'v2');
const FIXTURE = path.join(here, '..', '..', 'tests', 'fixtures', 'consigna.docx');
fs.mkdirSync(SHOTS, { recursive: true });
const run = Date.now().toString(36);
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (page, name) => { await sleep(600); await page.screenshot({ path: path.join(SHOTS, `movil_${name}.png`) }); console.log(`  captura movil_${name}`); };
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) errors.push(m); };
const toTab = (page, tab) => page.evaluate((t) => { location.hash = location.hash.replace(/(#\/p\/[^/?]+).*/, `$1/${t}`); }, tab);
const waitText = (page, text, timeout = 20000) => page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);

async function setValue(page, sel, value) {
  await page.waitForSelector(sel, { visible: true });
  await page.$eval(sel, (el, v) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

/** Toca un botón por su texto (o selector) en su lugar real de la pantalla. Falla si no se puede tocar. */
async function tap(page, text, { selector } = {}) {
  await page.waitForFunction((t, s) => {
    const els = s ? [...document.querySelectorAll(s)] : [...document.querySelectorAll('button, a')].filter((e) => e.textContent.trim().includes(t));
    return els.some((e) => e.offsetParent !== null && !e.disabled);
  }, { timeout: 20000 }, text, selector || null);
  // Reintenta hasta ~3 s: los paneles y ventanas entran con animación.
  let info;
  for (let i = 0; i < 10; i++) {
    info = await locate(page, text, selector);
    if (info.reachable) break;
    await sleep(300);
  }
  if (!info.reachable) throw new Error(`No se puede tocar «${text}» (${info.inView ? 'tapado por otro elemento' : `fuera de la pantalla: borde derecho ${Math.round(info.right)} px de ${info.vw}`})`);
  await page.touchscreen.tap(info.x, info.y);
}

function locate(page, text, selector) {
  return page.evaluate((t, s) => {
    const els = s ? [...document.querySelectorAll(s)] : [...document.querySelectorAll('button, a')].filter((e) => e.textContent.trim().includes(t));
    const usable = els.filter((e) => e.offsetParent !== null && !e.disabled);
    // Si hay varios (p. ej. el del menú lateral escondido y el de la barra), se elige el que está a la vista.
    const onScreen = (e) => { const r = e.getBoundingClientRect(); return r.right > 0 && r.left < innerWidth; };
    const el = usable.find(onScreen) || usable[0];
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2; const y = r.top + r.height / 2;
    const inView = r.width > 0 && r.height > 0 && x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight;
    const top = document.elementFromPoint(x, y);
    const reachable = inView && !!top && (top === el || el.contains(top));
    return { x, y, inView, reachable, w: r.width, right: r.right, vw: innerWidth };
  }, text, selector || null);
}

async function person(browser, label) {
  const ctx = await browser.createIncognitoBrowserContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|WebSocket|favicon|clipboard|functions/i.test(m.text())) errors.push(`${label} consola: ${m.text()}`); });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  return page;
}
async function register(page, name) {
  await page.goto(BASE + '#/entrar', { waitUntil: 'networkidle0' });
  await tap(page, 'Créala');
  await setValue(page, '#au-name', name);
  await setValue(page, '#au-email', `${name.split(' ')[0].toLowerCase()}-m${run}@test.local`);
  await setValue(page, '#au-pass', 'clave-de-prueba-123');
  await setValue(page, '#au-birth', '2004-05-01');
  await tap(page, '', { selector: '#au-terms' });
  await tap(page, 'Crear cuenta');
  await page.waitForFunction(() => !document.querySelector('#au-email'), { timeout: 20000 });
}
async function join(page, link) {
  await page.goto(link, { waitUntil: 'networkidle0' });
  await tap(page, 'Unirme al grupo');
  await page.waitForFunction(() => location.hash.includes('/p/'), { timeout: 20000 });
  await page.reload({ waitUntil: 'networkidle0' });
  await toTab(page, 'tareas');
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--lang=es-PE'] });
try {
  console.log('\nAna crea y reparte TODO desde el celular (3 esperados)');
  const A = await person(browser, 'Ana');
  await register(A, 'Ana Torres');
  await tap(A, '', { selector: 'button[aria-label="Nuevo proyecto"]' });
  await setValue(A, '#wz-name', 'Informe de campo');
  await setValue(A, '#wz-due', '2026-12-04');
  await tap(A, '', { selector: '[role="radio"][aria-checked="false"]:nth-child(2)' });
  await tap(A, 'Crear grupo e invitar');
  await A.waitForFunction(() => document.querySelector('#lb-link')?.value.includes('/unirse/'), { timeout: 20000 });
  const link = await A.$eval('#lb-link', (el) => el.value);
  await shot(A, 'w1_sala');
  await tap(A, 'Continuar: la consigna');
  const input = await A.waitForSelector('#wz-file');
  await input.uploadFile(FIXTURE);
  await tap(A, '', { selector: '#wz-ai-run' });
  await A.waitForFunction(() => /tareas propuestas|Usar detección rápida/.test(document.body.innerText), { timeout: 120000 });
  if (await A.evaluate(() => document.body.innerText.includes('Usar detección rápida'))) await tap(A, 'Usar detección rápida');
  await waitText(A, 'tareas propuestas');
  await shot(A, 'w2_plan');
  await tap(A, 'Repartir');
  await waitText(A, 'Reparto en partes iguales');
  await shot(A, 'w3_reparto');
  // Caso real: mientras la coordinadora está en el reparto, entra alguien y le llega un aviso emergente.
  const B = await person(browser, 'Beto');
  await register(B, 'Beto Ramos');
  await join(B, link);
  await waitText(A, 'Beto Ramos');   // la novedad llega en tiempo real al reparto abierto
  await sleep(1500);
  ok(!(await A.$('.toast')), 'con el reparto abierto, el aviso «se unió» va a la campana y no tapa nada');
  await shot(A, 'w3_reparto_llega_beto');
  await tap(A, 'Confirmar y repartir');
  await A.waitForFunction(() => location.hash.includes('/p/') && !document.querySelector('[aria-labelledby="wz-title"]'), { timeout: 20000 });
  await toTab(A, 'tareas');
  ok(true, 'en el celular se puede tocar «Confirmar y repartir» aunque llegue un aviso en ese momento');

  console.log('\nBeto acepta la lista completa de un toque');
  await B.reload({ waitUntil: 'networkidle0' });
  await waitText(B, 'Aceptar');
  await shot(B, 'aceptar_lista');
  await tap(B, '', { selector: '#accept-all' });
  await B.waitForFunction(() => !document.querySelector('#accept-all'), { timeout: 20000 });
  ok(true, 'Beto acepta todas sus tareas con «Aceptar todas»');
  await shot(B, 'aceptadas');

  console.log('\nCaro entra, recibe su parte, rechaza una con motivo y acepta el resto');
  const C = await person(browser, 'Caro');
  await register(C, 'Caro Díaz');
  await join(C, link);
  await waitText(C, 'Te tocaron');
  const first = await C.$eval('section[aria-label="Tareas por aceptar"] li button', (b) => b.textContent);
  await tap(C, '', { selector: 'section[aria-label="Tareas por aceptar"] li button' });
  await tap(C, 'No puedo');
  await setValue(C, '#prompt-input', 'Esa semana tengo parciales; puedo tomar otra más corta.');
  await shot(C, 'no_puedo');
  await tap(C, 'Enviar respuesta');
  await waitText(C, 'Avisaste a la coordinación');
  ok(true, `Caro rechaza «${first.slice(0, 30)}…» con motivo desde el celular`);
  await C.keyboard.press('Escape');
  await C.goto(C.url().split('?')[0], { waitUntil: 'networkidle0' });
  await toTab(C, 'tareas');

  console.log('\nAna abre «Repartir» y, mientras tanto, le llegan avisos (Caro acepta su lista)');
  await A.reload({ waitUntil: 'networkidle0' });
  await tap(A, 'Repartir 1');
  await waitText(A, 'Repartir tareas sin responsable');
  if (await C.$('#accept-all')) { await tap(C, '', { selector: '#accept-all' }); await C.waitForFunction(() => !document.querySelector('#accept-all'), { timeout: 20000 }); }
  ok(true, 'Caro acepta el resto de su lista');
  await sleep(2500);
  await shot(A, 'modal_repartir');
  await tap(A, 'Asignar 1 tarea');
  await waitText(A, 'Repartiste');
  ok(true, 'en el celular se puede tocar «Asignar» en la ventana Repartir, con avisos llegando');
  const overflow = await A.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok(!overflow, 'sin desplazamiento horizontal');
  await shot(A, 'proyecto_final');
} catch (e) {
  errors.push(`Interrumpido: ${e.message}`);
  console.log(`✗ ${e.message}`);
} finally {
  await browser.close();
}
console.log(errors.length ? `\nProblemas (${errors.length}):\n- ${errors.join('\n- ')}` : '\nSin errores.');
process.exit(errors.length ? 1 : 0);
