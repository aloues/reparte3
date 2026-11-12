// Capturas de la landing (sin sesión) en computadora, tablet y celular, tema claro y oscuro.
// Uso: node scripts/shots-landing.mjs [prefijo]   (capturas en ../docs/capturas/v3/)
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.APP_URL || 'http://localhost:4173/';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(here, '..', '..', 'docs', 'capturas', 'v3');
fs.mkdirSync(OUT, { recursive: true });
const pre = process.argv[2] || 'landing';
const errors = [];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--lang=es-PE'] });
const sizes = [['desktop', { width: 1440, height: 900 }], ['tablet', { width: 820, height: 1180, isMobile: true, hasTouch: true }], ['movil', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]];
try {
  for (const [name, vp] of sizes) {
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark' && name === 'tablet') continue;
      const ctx = await browser.createIncognitoBrowserContext();
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load/i.test(m.text())) errors.push(`${name} consola: ${m.text()}`); });
      await page.setViewport(vp);
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
      await page.goto(BASE, { waitUntil: 'networkidle0' });
      await new Promise((r) => setTimeout(r, 900));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (overflow) errors.push(`${name}: desplazamiento horizontal`);
      await page.screenshot({ path: path.join(OUT, `${pre}_${name}_${theme}_hero.png`) });
      if (theme === 'light') {
        await new Promise((r) => setTimeout(r, 9000));   // la demo avanza sola hasta «Flujo»
        await page.screenshot({ path: path.join(OUT, `${pre}_${name}_demo_final.png`) });
        await page.screenshot({ path: path.join(OUT, `${pre}_${name}_completa.png`), fullPage: true });
      }
      await ctx.close();
      console.log(`  ${name} ${theme}`);
    }
  }
} finally { await browser.close(); }
console.log(errors.length ? `Problemas:\n- ${errors.join('\n- ')}` : 'Sin errores.');
process.exit(errors.length ? 1 : 0);
