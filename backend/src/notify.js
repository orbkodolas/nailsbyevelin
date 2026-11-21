// Értesítések: Evelinnek FormSubmit (regisztráció nélkül), vendégeknek Resend (ha van API-kulcs).
// Kulcs nélkül a vendégleveleket csak naplózzuk, a foglalás ettől még működik.
import { renderMail } from './mail-template.js'

const forint = (value) => `${new Intl.NumberFormat('hu-HU').format(value)} Ft`

export function formatDateTime(iso, timeZone) {
  return new Intl.DateTimeFormat('hu-HU', { timeZone, dateStyle: 'full', timeStyle: 'short' }).format(new Date(iso))
}

export function createNotifier({ config, fetchImpl, log = console }) {
  const mailEnabled = Boolean((config.brevoApiKey || config.resendApiKey) && config.mailFrom)
  // 'Név <cím>' vagy sima cím → { name, email } (Brevo)
  const sender = (() => {
    const match = /^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/.exec(config.mailFrom || '')
    return match ? { name: match[1] || undefined, email: match[2] } : { email: String(config.mailFrom || '').trim() }
  })()

  async function sendMail({ to, subject, text, html }) {
    if (!mailEnabled || !to) {
      // Személyes adat (e-mail cím) nem kerül a naplóba, csak a domain
      log.info?.(`[levél – nincs küldő beállítva] ${to ? `***@${String(to).split('@')[1] ?? '?'}` : '(nincs cím)'} | ${subject.replace(/–.*$/, '–…')}`)
      return 'not_configured'
    }
    try {
      const response = config.brevoApiKey
        ? await fetchImpl('https://api.brevo.com/v3/smtp/email', {
          method: 'POST', signal: AbortSignal.timeout(10_000),
          headers: { 'api-key': config.brevoApiKey, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ sender, to: [{ email: to }], subject, textContent: text, ...(html ? { htmlContent: html } : {}) }),
        })
        : await fetchImpl('https://api.resend.com/emails', {
          method: 'POST', signal: AbortSignal.timeout(10_000),
          headers: { authorization: `Bearer ${config.resendApiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ from: config.mailFrom, to, subject, text, ...(html ? { html } : {}) }),
        })
      if (!response.ok) log.error?.(`[levél] a szolgáltató HTTP ${response.status} választ adott`)
      return response.ok ? 'sent' : 'failed'
    } catch { return 'failed' }
  }

  async function notifyOwner(subject, fields) {
    if (!config.formSubmitEmail) return 'not_configured'
    try {
      const response = await fetchImpl(`https://formsubmit.co/ajax/${encodeURIComponent(config.formSubmitEmail)}`, {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ _subject: subject, ...fields }), signal: AbortSignal.timeout(8000),
      })
      return response.ok ? 'sent' : 'failed'
    } catch { return 'failed' }
  }

  const manageUrl = (booking) => `${config.publicUrl}/#/foglalas/${booking.id}/${booking.manageToken}`
  const when = (booking) => formatDateTime(booking.startsAt, config.timezone)
  const signoff = '\nSzeretettel,\nNails by Evelin'

  return {
    sendMail, notifyOwner, manageUrl, mailEnabled,

    ownerBookingEvent(booking, event, extra = {}) {
      const labels = { created: 'Új időpontkérés', paid: 'Befizetve', cancelled: 'Lemondva', late_cancelled: 'Késői lemondás (24 órán belül)', rescheduled: 'Időpont módosítva' }
      return notifyOwner(`${labels[event] || event} – ${booking.name}`, {
        name: booking.name, phone: booking.phone, email: booking.email || 'Nincs megadva',
        service: booking.serviceName, when: when(booking), status: booking.status, payment: booking.paymentStatus,
        amountDue: forint(booking.amountDueHuf), note: booking.customerNote || 'Nincs megjegyzés', ...extra,
      })
    },

    guestBookingMail(booking) {
      const first = booking.name.split(' ')[0]
      const note = 'Kérlek, pontosan érkezz, és kísérő nélkül gyere. Egy szett legalább 2 órát vesz igénybe.'
      const paid = booking.amountPaidHuf > 0 ? forint(booking.amountPaidHuf) : null
      const text = [
        `Szia ${first}!`, '', 'Az időpontod rögzítve van.', '',
        `${booking.serviceName}`, when(booking), '',
        'Itt tudod megerősíteni, módosítani vagy lemondani (egy üzenet is elég, ha nem tudsz jönni):', manageUrl(booking), '', note, signoff,
      ].join('\n')
      const html = renderMail({
        publicUrl: config.publicUrl, cover: true, gallery: true, preheader: `${booking.serviceName} – ${when(booking)}`,
        title: 'Az időpontod rögzítve van',
        paragraphs: [`Szia ${first}!`, 'Köszönöm a foglalást, már várlak. Megerősíteni, módosítani vagy lemondani az alábbi gombbal tudod (egy üzenet is elég, ha nem tudsz jönni).'],
        details: [['Szolgáltatás', booking.serviceName], ['Időpont', when(booking)], ...(paid ? [['Kifizetve', paid]] : [])],
        button: { label: 'Időpont kezelése', url: manageUrl(booking) }, footnote: note,
      })
      return sendMail({ to: booking.email, subject: 'Időpontod rögzítve', text, html })
    },

    guestRescheduleMail(booking, previousStartsAt) {
      const first = booking.name.split(' ')[0]
      const before = formatDateTime(previousStartsAt, config.timezone)
      const text = [
        `Szia ${first}!`, '', 'Az időpontodat módosítottad, az új időpont rögzítve van.', '',
        `${booking.serviceName}`, `Új időpont: ${when(booking)}`, `Korábbi időpont (felszabadult): ${before}`, '',
        'Itt tudod megerősíteni, módosítani vagy lemondani:', manageUrl(booking), '', signoff,
      ].join('\n')
      const html = renderMail({
        publicUrl: config.publicUrl, preheader: `Új időpont: ${when(booking)}`,
        title: 'Az időpontod módosítva',
        paragraphs: [`Szia ${first}!`, 'Az új időpontod rögzítve van, a korábbi felszabadult.'],
        details: [['Szolgáltatás', booking.serviceName], ['Új időpont', when(booking)], ['Korábbi időpont', before]],
        button: { label: 'Időpont kezelése', url: manageUrl(booking) },
      })
      return sendMail({ to: booking.email, subject: 'Időpontod módosítva', text, html })
    },

    guestReminderMail(booking, kind) {
      const early = kind === 'day_before'
      const first = booking.name.split(' ')[0]
      const lead = early ? `Holnapra szól az időpontod: ${when(booking)}.` : `Hamarosan várlak: ${when(booking)}.`
      const ask = early
        ? (booking.confirmationStatus === 'confirmed' ? 'Ha mégsem tudsz jönni, kérlek, mondd le minél előbb, így másnak tovább tudom adni az időt.' : 'Kérlek, erősítsd meg, hogy jössz, vagy mondd le, ha nem tudsz. Így másnak tovább tudom adni az időt.')
        : 'Ha mégsem tudsz eljönni, kérlek, szólj még most.'
      const text = [`Szia ${first}!`, '', lead, '', ask, manageUrl(booking), signoff].join('\n')
      const html = renderMail({
        publicUrl: config.publicUrl, preheader: lead,
        title: early ? 'Holnapi időpontod' : 'Ma várlak!',
        paragraphs: [`Szia ${first}!`, lead, ask],
        details: [['Szolgáltatás', booking.serviceName], ['Időpont', when(booking)]],
        button: { label: early && booking.confirmationStatus !== 'confirmed' ? 'Megerősítem / lemondom' : 'Időpont kezelése', url: manageUrl(booking) },
      })
      return sendMail({ to: booking.email, subject: early ? 'Holnapi időpontod – megerősítés' : 'Ma várlak!', text, html })
    },

    voucherMail(voucher) {
      const text = [
        `Szia ${voucher.buyerName.split(' ')[0]}!`, '', 'Köszönöm a rendelésedet, az ajándékutalvány aktív.', '',
        `Kód: ${voucher.code}`, `Érték: ${forint(voucher.amountHuf)}`,
        voucher.recipientName ? `Ajándékozott: ${voucher.recipientName}` : '', `Érvényes: ${voucher.expiresAt.slice(0, 10)}-ig`, '',
        'Beváltáskor kérlek, mutasd meg a kódot.', signoff,
      ].filter((line, index, all) => line !== '' || all[index - 1] !== '').join('\n')
      const html = renderMail({
        publicUrl: config.publicUrl, cover: true, gallery: true, preheader: `Kód: ${voucher.code}`,
        title: 'Az ajándékutalvány aktív',
        paragraphs: [`Szia ${voucher.buyerName.split(' ')[0]}!`, 'Köszönöm a rendelésedet, az ajándékutalvány aktív. Beváltáskor kérlek, mutasd meg a kódot.'],
        details: [['Kód', voucher.code], ['Érték', forint(voucher.amountHuf)], ...(voucher.recipientName ? [['Ajándékozott', voucher.recipientName]] : []), ['Érvényes', `${voucher.expiresAt.slice(0, 10)}-ig`]],
      })
      return sendMail({ to: voucher.buyerEmail, subject: 'Ajándékutalvány – Nails by Evelin', text, html })
    },
  }
}
