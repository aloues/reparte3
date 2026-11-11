// Genera los íconos PNG de la PWA (cuadro azul con un 3 blanco) sin dependencias externas.
// Uso: node scripts/make-icons.cjs
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const table = [];
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = table[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};

function png(size, maskable) {
  const radius = maskable ? 0 : (size * 14) / 64;
  const pad = maskable ? size * 0.14 : 0;
  const k = (size - 2 * pad) / 64;
  const bars = [[21, 16, 20, 8], [27, 28, 14, 8], [21, 40, 20, 8], [35, 16, 8, 32]];
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      const o = 1 + x * 4;
      if (radius) {
        const cx = Math.min(Math.max(x + 0.5, radius), size - radius);
        const cy = Math.min(Math.max(y + 0.5, radius), size - radius);
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > radius * radius) continue; // transparente
      }
      const u = (x + 0.5 - pad) / k, v = (y + 0.5 - pad) / k;
      const white = bars.some(([bx, by, bw, bh]) => u >= bx && u < bx + bw && v >= by && v < by + bh);
      row[o] = white ? 255 : 0x2b; row[o + 1] = white ? 255 : 0x59; row[o + 2] = 255; row[o + 3] = 255;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = path.join(__dirname, '..', 'public');
fs.writeFileSync(path.join(out, 'icon-192.png'), png(192));
fs.writeFileSync(path.join(out, 'icon-512.png'), png(512));
fs.writeFileSync(path.join(out, 'icon-maskable-512.png'), png(512, true));
console.log('Íconos generados en public/');
