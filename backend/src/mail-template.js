// HTML levélsablon az oldal arculatához (sötét alap, rózsa akcentus, serif + script).
// Táblázatos, inline stílusos felépítés: Gmail, Apple Mail és Outlook is helyesen jeleníti meg.
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const C = { night: '#0c0809', card: '#171014', line: '#2c1d24', rose: '#d7a2aa', text: '#e6dcdd', muted: '#9e8c91' }
const SERIF = "'Cormorant Garamond',Georgia,'Times New Roman',serif"
const SANS = "'Jost',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif"
const SCRIPT = "'Pinyon Script','Snell Roundhand','Brush Script MT',cursive"
const GALLERY = ['pink-nude', 'ombre-pearls', 'mocha-crystals']

/**
 * @param {object} o
 * @param {string} o.publicUrl  a frontend címe (képek: <publicUrl>/email/…)
 * @param {string} o.title      fő cím (serif)
 * @param {string[]} o.paragraphs  bekezdések (sima szöveg, escape-elve kerül be)
 * @param {[string,string][]} [o.details]  címke–érték sorok
 * @param {{label:string,url:string}} [o.button]
 * @param {boolean} [o.cover]    borítókép
 * @param {boolean} [o.gallery]  referenciaképek
 * @param {{label:string,url:string}} [o.textLink]  szöveges hivatkozás a gomb alatt (pl. lemondás)
 * @param {string} [o.footnote]  apró szürke záró sor
 * @param {string} [o.preheader]  az előnézeti sor a levelezőben
 */
export function renderMail({ publicUrl, title, paragraphs = [], details = [], button, cover = false, gallery = false, footnote = '', textLink, preheader = '' }) {
  const img = (file) => `${publicUrl}/email/${file}`
  const p = (text) => `<p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.7;color:${C.text};">${esc(text)}</p>`
  const detailRows = details.map(([label, value]) => `
        <tr><td style="padding:10px 0;border-top:1px solid ${C.line};font-family:${SANS};font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:${C.muted};width:38%;vertical-align:top;">${esc(label)}</td>
        <td style="padding:10px 0;border-top:1px solid ${C.line};font-family:${SERIF};font-size:19px;color:${C.text};vertical-align:top;">${esc(value)}</td></tr>`).join('')
  const photos = GALLERY.map((name) => `<td width="33.33%" style="padding:0 4px;"><img src="${img(`${name}.jpg`)}" width="176" alt="" style="display:block;width:100%;height:auto;border:0;border-radius:2px;"></td>`).join('')

  return `<!doctype html>
<html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${C.night};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.night};">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.night};"><tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${C.card};border:1px solid ${C.line};border-radius:4px;overflow:hidden;">
    <tr><td align="center" style="padding:32px 24px 8px;">
      <img src="${img('logo.png')}" width="96" height="96" alt="Nails by Evelin" style="display:block;border:0;border-radius:50%;">
    </td></tr>
    ${cover ? `<tr><td style="padding:16px 0 0;"><img src="${img('cover.jpg')}" width="600" alt="" style="display:block;width:100%;height:auto;border:0;"></td></tr>` : ''}
    <tr><td style="padding:${cover ? '32px' : '16px'} 32px 8px;">
      <h1 style="margin:0 0 20px;font-family:${SERIF};font-weight:400;font-size:32px;line-height:1.15;color:${C.rose};text-align:center;">${esc(title)}</h1>
      ${paragraphs.map(p).join('')}
      ${detailRows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;border-bottom:1px solid ${C.line};">${detailRows}</table>` : ''}
      ${button ? `<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:8px auto 8px;"><tr><td align="center" bgcolor="${C.rose}" style="border-radius:2px;"><a href="${esc(button.url)}" style="display:inline-block;padding:14px 32px;font-family:${SANS};font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:${C.night};text-decoration:none;">${esc(button.label)}</a></td></tr></table>
      <p style="margin:12px 0 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.muted};text-align:center;word-break:break-all;">Ha a gomb nem működik: <a href="${esc(button.url)}" style="color:${C.rose};">${esc(button.url)}</a></p>` : ''}
      ${textLink ? `<p style="margin:20px 0 0;font-family:${SANS};font-size:14px;line-height:1.6;text-align:center;"><a href="${esc(textLink.url)}" style="color:${C.rose};text-decoration:underline;">${esc(textLink.label)}</a></p>` : ''}
    </td></tr>
    ${gallery ? `<tr><td style="padding:24px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${photos}</tr></table></td></tr>` : ''}
    ${footnote ? `<tr><td style="padding:24px 32px 0;font-family:${SANS};font-size:13px;line-height:1.7;color:${C.muted};text-align:center;">${esc(footnote)}</td></tr>` : ''}
    <tr><td align="center" style="padding:32px 24px 36px;">
      <div style="font-family:${SCRIPT};font-size:30px;line-height:1.2;color:${C.rose};">Nails by Evelin</div>
      <div style="margin-top:6px;font-family:${SANS};font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:${C.muted};">Szeretettel</div>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`
}
