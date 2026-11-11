// Detección de tareas POR FORMATO (no es IA): líneas con viñeta o numeración, o con verbos de
// obligación, se proponen como posibles tareas para que el grupo decida. Portado de app/js/domain.js.

const MONTHS = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const isISO = (s) => { const d = new Date(s + 'T00:00:00Z'); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; };

export function findDates(line, defaultYear) {
  const out = [];
  const re1 = /\b(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?\b/g;
  let m;
  while ((m = re1.exec(line))) {
    let y = m[3] ? +m[3] : defaultYear;
    if (m[3] && m[3].length === 2) y = 2000 + y;
    const iso = `${y}-${String(+m[2]).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`;
    if (isISO(iso)) out.push({ iso, text: m[0], yearInferred: !m[3] });
  }
  const re2 = /\b(\d{1,2})\s+de\s+([a-záéíóú]+)(?:\s+(?:de|del)\s+(\d{4}))?/gi;
  while ((m = re2.exec(line))) {
    const mo = MONTHS[m[2].toLowerCase()];
    if (!mo) continue;
    const y = m[3] ? +m[3] : defaultYear;
    const iso = `${y}-${String(mo).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`;
    if (isISO(iso)) out.push({ iso, text: m[0], yearInferred: !m[3] });
  }
  return out;
}

const HEAVY = /\b(investigar|investigación|desarrollar|redactar|elaborar|analizar|diseñar|programar|grabar|informe|marco teórico)\b/i;
const LIGHT = /\b(revisar|subir|adjuntar|enviar|formato|portada|citas?|bibliografía|índice)\b/i;
export const estimateHours = (text) => (HEAVY.test(text) ? 3 : LIGHT.test(text) ? 1 : 2);

export function analyzeBrief(text, defaultYear = new Date().getFullYear()) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const bullet = /^\s*(?:[-•*·▪●◦]|\(?\d{1,2}[.)]|\(?[a-z][.)])\s+/i;
  const verbs = /\b(deber[áa]n?|debe[ns]?|incluir|incluye|entregar|presentar|subir|elaborar|redactar|realizar|preparar|grabar|adjuntar|exponer|sustentar|obligatorio|requisito)\b/i;
  const out = [];
  const seen = new Set();
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (line.length < 6) return;
    const isBullet = bullet.test(raw);
    if (!isBullet && !verbs.test(line)) return;
    const clean = line.replace(bullet, '').replace(/\s+/g, ' ').trim();
    if (clean.length < 4) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const dates = findDates(line, defaultYear);
    out.push({ line: i + 1, title: clean.slice(0, 140), hours: estimateHours(clean), due: dates[0] && !dates[0].yearInferred ? dates[0].iso : dates[0]?.iso || '', why: isBullet ? 'viñeta o numeración' : 'verbo de obligación' });
  });
  return out.slice(0, 60);
}

/**
 * Propone responsables: primero las tareas más largas, a quien tenga menos horas.
 * Los empates rotan para no favorecer siempre a la primera persona.
 */
export function proposeDistribution(tasks, people, round = 0) {
  if (!people.length) return {};
  const load = Object.fromEntries(people.map((p) => [p, 0]));
  tasks.forEach((t) => { if (t.assignee && load[t.assignee] != null && t.status !== 'lista') load[t.assignee] += Number(t.hours) || 2; });
  const shift = round % people.length;
  const order = people.slice(shift).concat(people.slice(0, shift));
  const mapping = {};
  tasks.filter((t) => !t.assignee && t.status !== 'lista')
    .sort((a, b) => (Number(b.hours) || 2) - (Number(a.hours) || 2) || a.seq - b.seq)
    .forEach((t) => {
      let best = order[0];
      order.forEach((p) => { if (load[p] < load[best] - 1e-9) best = p; });
      mapping[t.id] = best;
      load[best] += Number(t.hours) || 2;
    });
  return mapping;
}
