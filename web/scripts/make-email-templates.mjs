// Genera las plantillas de correo de Supabase Auth con la marca de Reparte3 (supabase/templates/*.html).
// Uso: node web/scripts/make-email-templates.mjs
// En producción, cada archivo se pega en Supabase → Authentication → Email Templates (asunto + cuerpo).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', '..', 'supabase', 'templates');
const LOGO = 'https://aloues.github.io/reparte3/icon-192.png';
const SITE = 'https://aloues.github.io/reparte3/';
fs.mkdirSync(OUT, { recursive: true });

const layout = ({ preheader, title, intro, button, after, footnote }) => `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181B;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F5;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;border:1px solid #E4E4E7;">
      <tr><td style="padding:28px 32px 0 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td><img src="${LOGO}" width="36" height="36" alt="" style="display:block;border-radius:9px;"></td>
          <td style="padding-left:10px;font-size:17px;font-weight:600;letter-spacing:-0.01em;color:#18181B;">Reparte3</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:24px 32px 8px 32px;">
        <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;font-weight:600;letter-spacing:-0.02em;color:#18181B;">${title}</h1>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#3F3F46;">${intro}</p>
      </td></tr>
      <tr><td style="padding:24px 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:#2B59FF;">
          <a href="${button.href}" style="display:inline-block;padding:13px 24px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;">${button.label}</a>
        </td></tr></table>
      </td></tr>
      <tr><td style="padding:0 32px 8px 32px;">
        <p style="margin:0;font-size:13px;line-height:1.6;color:#71717A;">${after}</p>
      </td></tr>
      <tr><td style="padding:20px 32px 28px 32px;border-top:1px solid #F4F4F5;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:#A1A1AA;">${footnote}</p>
      </td></tr>
    </table>
    <p style="margin:16px 0 0 0;font-size:12px;color:#A1A1AA;">Reparte3 · Trabajo en grupo, en partes iguales · <a href="${SITE}" style="color:#A1A1AA;">${SITE.replace('https://', '')}</a></p>
  </td></tr>
</table>
</body>
</html>
`;

const ignore = 'Si no fuiste tú, ignora este correo: no pasará nada.';
const fallback = (u) => `Si el botón no funciona, copia este enlace en tu navegador:<br><span style="word-break:break-all;color:#52525B;">${u}</span>`;
const T = {
  confirmacion: {
    subject: 'Confirma tu correo para entrar a Reparte3',
    html: layout({
      preheader: 'Un toque y tu cuenta queda lista.',
      title: 'Confirma tu correo',
      intro: 'Ya casi. Confirma que este correo es tuyo para entrar a Reparte3, donde tu grupo reparte el trabajo en partes iguales y sigue el avance sin perseguir a nadie por WhatsApp.',
      button: { href: '{{ .ConfirmationURL }}', label: 'Confirmar mi correo' },
      after: fallback('{{ .ConfirmationURL }}'),
      footnote: `Recibiste este correo porque alguien creó una cuenta en Reparte3 con {{ .Email }}. ${ignore}`,
    }),
  },
  invitacion: {
    subject: 'Te invitaron a Reparte3',
    html: layout({
      preheader: 'Tu grupo te espera en Reparte3.',
      title: 'Te invitaron a Reparte3',
      intro: 'Acepta la invitación para crear tu cuenta y unirte a tu grupo. Ahí verás tus tareas, los checkpoints y el chat del trabajo.',
      button: { href: '{{ .ConfirmationURL }}', label: 'Aceptar invitación' },
      after: fallback('{{ .ConfirmationURL }}'),
      footnote: `Esta invitación es para {{ .Email }}. ${ignore}`,
    }),
  },
  enlace_magico: {
    subject: 'Tu enlace para entrar a Reparte3',
    html: layout({
      preheader: 'Entra sin contraseña.',
      title: 'Entra a Reparte3',
      intro: 'Usa este botón para entrar a tu cuenta. El enlace funciona una sola vez y vence pronto.',
      button: { href: '{{ .ConfirmationURL }}', label: 'Entrar a Reparte3' },
      after: fallback('{{ .ConfirmationURL }}'),
      footnote: `Alguien pidió entrar a Reparte3 con {{ .Email }}. ${ignore}`,
    }),
  },
  recuperar: {
    subject: 'Cambia tu contraseña de Reparte3',
    html: layout({
      preheader: 'Elige una contraseña nueva.',
      title: 'Cambia tu contraseña',
      intro: 'Recibimos un pedido para cambiar la contraseña de tu cuenta. Pulsa el botón y elige una nueva.',
      button: { href: '{{ .ConfirmationURL }}', label: 'Elegir contraseña nueva' },
      after: fallback('{{ .ConfirmationURL }}'),
      footnote: `Pedido para {{ .Email }}. Si no lo pediste, tu contraseña actual sigue funcionando. ${ignore}`,
    }),
  },
  cambio_correo: {
    subject: 'Confirma tu nuevo correo en Reparte3',
    html: layout({
      preheader: 'Confirma el cambio de correo.',
      title: 'Confirma tu nuevo correo',
      intro: 'Pediste cambiar el correo de tu cuenta de {{ .Email }} a {{ .NewEmail }}. Confírmalo para terminar.',
      button: { href: '{{ .ConfirmationURL }}', label: 'Confirmar el cambio' },
      after: fallback('{{ .ConfirmationURL }}'),
      footnote: ignore,
    }),
  },
};

const index = [];
for (const [name, t] of Object.entries(T)) {
  fs.writeFileSync(path.join(OUT, `${name}.html`), t.html);
  index.push(`${name}.html\t${t.subject}`);
}
fs.writeFileSync(path.join(OUT, 'ASUNTOS.txt'), `Asunto de cada plantilla (pegar en Supabase → Authentication → Email Templates)\n\n${index.join('\n')}\n`);
console.log(`Plantillas en ${OUT}:\n${index.join('\n')}`);
