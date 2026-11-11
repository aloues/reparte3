// Lectura de PDF y Word EN EL NAVEGADOR (el archivo no se sube a ningún servidor).
// pdf.js 3.11.174 (Apache-2.0) y mammoth 1.6.0 (BSD-2), servidos desde public/vendor/.
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PAGES = 40;
const BASE = new URL('vendor/', document.baseURI).href;

function load(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-r3="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = BASE + src; s.async = true; s.dataset.r3 = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('No se pudo cargar el lector de documentos. Revisa tu conexión.'));
    document.head.appendChild(s);
  });
}
async function pdfLib() {
  if (!window.pdfjsLib) { await load('pdf.min.js'); }
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = BASE + 'pdf.worker.min.js';
  return window.pdfjsLib;
}
async function docxLib() { if (!window.mammoth) await load('mammoth.browser.min.js'); return window.mammoth; }

function kindOf(file, head) {
  const name = (file.name || '').toLowerCase();
  if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) return 'pdf';
  if (head[0] === 0x50 && head[1] === 0x4b && name.endsWith('.docx')) return 'docx';
  if (name.endsWith('.doc')) return 'doc';
  if (/\.(txt|md)$/.test(name) || (file.type || '').startsWith('text/')) return 'txt';
  return 'otro';
}

async function readPdf(buf) {
  const lib = await pdfLib();
  const doc = await lib.getDocument({ data: buf, isEvalSupported: false }).promise;
  const pages = Math.min(doc.numPages, MAX_PAGES);
  const parts = [];
  let chars = 0;
  for (let i = 1; i <= pages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    let s = '';
    tc.items.forEach((it) => { s += it.str; if (it.hasEOL) s += '\n'; });
    chars += s.replace(/\s/g, '').length;
    parts.push(s.trim());
  }
  const warnings = [];
  if (doc.numPages > MAX_PAGES) warnings.push(`Se leyeron las primeras ${MAX_PAGES} de ${doc.numPages} páginas.`);
  if (chars < pages * 25) warnings.push('Este PDF casi no tiene texto seleccionable (¿es escaneado?).');
  return { text: parts.join('\n\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(), warnings };
}

async function readDocx(buf) {
  const lib = await docxLib();
  const res = await lib.convertToHtml({ arrayBuffer: buf });
  const dom = new DOMParser().parseFromString(`<body>${res.value}</body>`, 'text/html');
  const lines = [];
  const walk = (el) => {
    [...el.children].forEach((c) => {
      const tag = c.tagName.toLowerCase();
      if (tag === 'ul' || tag === 'ol') {
        [...c.children].forEach((li, i) => {
          const own = [...li.childNodes].filter((n) => !(n.nodeType === 1 && /^(ul|ol)$/i.test(n.tagName))).map((n) => n.textContent).join(' ').trim();
          if (own) lines.push((tag === 'ol' ? `${i + 1}. ` : '- ') + own);
          walk(li);
        });
      } else if (tag === 'table') {
        c.querySelectorAll('tr').forEach((tr) => lines.push([...tr.children].map((td) => td.textContent.trim()).filter(Boolean).join(' | ')));
      } else if (/^(p|h[1-6])$/.test(tag)) {
        const t = c.textContent.trim(); if (t) lines.push(t);
      } else walk(c);
    });
  };
  walk(dom.body);
  return { text: lines.join('\n').trim(), warnings: res.messages?.length ? ['Algunas imágenes u objetos del Word no se pudieron leer.'] : [] };
}

export async function extractText(file) {
  if (!file) throw new Error('No se eligió ningún archivo.');
  if (file.size > MAX_BYTES) throw new Error('El archivo pesa más de 5 MB. Sube una versión más liviana.');
  const buf = await file.arrayBuffer();
  const kind = kindOf(file, new Uint8Array(buf.slice(0, 4)));
  let out;
  if (kind === 'pdf') out = await readPdf(buf);
  else if (kind === 'docx') out = await readDocx(buf);
  else if (kind === 'txt') out = { text: new TextDecoder('utf-8').decode(buf).trim(), warnings: [] };
  else if (kind === 'doc') throw new Error('Los Word antiguos (.doc) no se pueden leer. Guárdalo como .docx o PDF.');
  else throw new Error('Formato no admitido. Usa PDF, Word (.docx) o texto (.txt).');
  if (!out.text || out.text.length < 10) throw new Error(kind === 'pdf' ? 'No se encontró texto en el PDF (parece escaneado).' : 'El archivo no tiene texto legible.');
  return { ...out, kind, fileName: file.name };
}
