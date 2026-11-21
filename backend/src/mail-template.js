// HTML levélsablon az oldal arculatához (sötét alap, rózsa akcentus, serif + script).
// Táblázatos, inline stílusos felépítés (Gmail, Apple Mail, Outlook); a keskeny képernyőre egy kis @media egészíti ki.
// Az adatsorok címkéje az érték fölött áll, így hosszú szolgáltatásnév és dátum sem préselődik össze.
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
 * @param {string} [o.footnote]  apró szürke záró sor
 * @param {string} [o.preheader]  az előnézeti sor a levelezőben
 */
export function renderMail({ publicUrl, title, paragraphs = [], details = [], button, cover = false, gallery = false, footnote = '', preheader = '' }) {
  const img = (file) => `${publicUrl}/email/${file}`
  const p = (text) => `<p style="margin:0 0 14px;font-family:${SANS};font-size:15px;line-height:1.65;color:${C.text};">${esc(text)}</p>`
  const detailRows = details.map(([label, value], index) => `
        <tr><td style="padding:12px 0;${index ? `border-top:1px solid ${C.line};` : ''}">
          <div style="font-family:${SANS};font-size:11px;line-height:1.4;letter-spacing:.14em;text-transform:uppercase;color:${C.muted};">${esc(label)}</div>
          <div style="margin-top:3px;font-family:${SERIF};font-size:20px;line-height:1.3;color:${C.text};">${esc(value)}</div>
        </td></tr>`).join('')
  const photos = GALLERY.map((name) => `<td width="33.33%" style="padding:0 3px;"><img src="${img(`${name}.jpg`)}" width="176" alt="" style="display:block;width:100%;height:auto;border:0;border-radius:2px;"></td>`).join('')

  return `<!doctype html>
<html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>${esc(title)}</title>
<style>
  @media only screen and (max-width:480px) {
    .outer { padding:0 !important; }
    .card { border-left:0 !important; border-right:0 !important; border-radius:0 !important; }
    .px { padding-left:20px !important; padding-right:20px !important; }
    .ttl { font-size:27px !important; }
  }
</style></head>
<body style="margin:0;padding:0;background:${C.night};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.night};">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.night};"><tr><td class="outer" align="center" style="padding:20px 12px;">
  <table role="presentation" class="card" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${C.card};border:1px solid ${C.line};border-radius:4px;overflow:hidden;">
    <tr><td align="center" style="padding:28px 24px 4px;">
      <img src="${img('logo.png')}" width="88" height="88" alt="Nails by Evelin" style="display:block;width:88px;height:88px;border:0;border-radius:50%;">
    </td></tr>
    ${cover ? `<tr><td style="padding:16px 0 0;"><img src="${img('cover.jpg')}" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></td></tr>` : ''}
    <tr><td class="px" style="padding:${cover ? '28px' : '16px'} 32px 8px;">
      <h1 class="ttl" style="margin:0 0 18px;font-family:${SERIF};font-weight:400;font-size:30px;line-height:1.15;color:${C.rose};text-align:center;">${esc(title)}</h1>
      ${paragraphs.map(p).join('')}
      ${detailRows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 22px;border-top:1px solid ${C.line};border-bottom:1px solid ${C.line};">${detailRows}</table>` : ''}
      ${button ? `<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:6px auto 8px;"><tr><td align="center" bgcolor="${C.rose}" style="border-radius:2px;"><a href="${esc(button.url)}" style="display:inline-block;padding:14px 30px;font-family:${SANS};font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:${C.night};text-decoration:none;">${esc(button.label)}</a></td></tr></table>` : ''}
    </td></tr>
    ${gallery ? `<tr><td class="px" style="padding:20px 29px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${photos}</tr></table></td></tr>` : ''}
    ${footnote ? `<tr><td class="px" style="padding:22px 32px 0;font-family:${SANS};font-size:13px;line-height:1.65;color:${C.muted};text-align:center;">${esc(footnote)}</td></tr>` : ''}
    <tr><td align="center" style="padding:28px 24px 34px;">
      <div style="font-family:${SCRIPT};font-size:30px;line-height:1.2;color:${C.rose};">Nails by Evelin</div>
      <div style="margin-top:6px;font-family:${SANS};font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:${C.muted};">Szeretettel</div>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`
}
