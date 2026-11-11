// Genera las claves VAPID (notificaciones push) y el secreto del cron.
// Escribe supabase/.secrets.local (NO se sube al repositorio) y muestra solo la clave PÚBLICA.
// Uso: node web/scripts/gen-secrets.cjs [https://usuario.github.io/repo/]
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const out = path.join(__dirname, '..', '..', 'supabase', '.secrets.local');
if (fs.existsSync(out)) {
  const pub = (fs.readFileSync(out, 'utf8').match(/^VAPID_PUBLIC_KEY=(.+)$/m) || [])[1];
  console.log('Ya existe supabase/.secrets.local; no se regenera (las suscripciones push dependen de esas claves).');
  if (pub) console.log(`VITE_VAPID_PUBLIC_KEY=${pub}`);
  process.exit(0);
}
const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pub = publicKey.export({ format: 'jwk' });
const priv = privateKey.export({ format: 'jwk' });
const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]);
const appUrl = process.argv[2] || '';
const lines = [
  '# Secretos de la Edge Function send-push. NO subir al repositorio.',
  `VAPID_PUBLIC_KEY=${raw.toString('base64url')}`,
  `VAPID_PRIVATE_KEY=${priv.d}`,
  // Contacto para los servicios push: la URL pública de la app (o un mailto: tuyo).
  `VAPID_SUBJECT=${appUrl.startsWith('https://') ? appUrl : 'https://localhost'}`,
  `PUSH_CRON_SECRET=${crypto.randomBytes(32).toString('hex')}`,
  `APP_URL=${appUrl}`,
];
fs.writeFileSync(out, `${lines.join('\n')}\n`, { mode: 0o600 });
console.log('Creado supabase/.secrets.local');
console.log(`VITE_VAPID_PUBLIC_KEY=${raw.toString('base64url')}`);
