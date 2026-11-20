// Fizetési szolgáltatók. Mindegyik ugyanazt a felületet adja:
//   createCheckout({ payment, customer, returnUrl }) -> { providerRef, url }
//   parseWebhook({ rawBody, headers, query }) -> { paymentId, status: 'paid' | 'failed' | 'ignored', amountHuf? }
// A `payment` rekord a mi tárolónkból jön (id, amountHuf, description). A szolgáltatóknak mindig a payment.id-t adjuk át,
// így a visszahívásnál egyértelmű, melyik foglalásról/utalványról van szó.
// Stripe és Barion a dokumentáció szerint van bekötve; a SimplePay váz éles/sandbox kulccsal tesztelendő.
import { createHmac, timingSafeEqual } from 'node:crypto'

const safeEqual = (a, b) => {
  const left = Buffer.from(String(a)); const right = Buffer.from(String(b))
  return left.length === right.length && timingSafeEqual(left, right)
}
const providerError = (message, detail) => Object.assign(new Error(message), { providerDetail: detail })

function stripeProvider({ config, fetchImpl }) {
  const { secretKey, webhookSecret } = config.stripe
  return {
    label: 'Bankkártya (Stripe)',
    ready: Boolean(secretKey),
    async createCheckout({ payment, customer, returnUrl }) {
      const form = new URLSearchParams({
        mode: 'payment',
        success_url: returnUrl,
        cancel_url: `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}cancelled=1`,
        client_reference_id: payment.id,
        'metadata[paymentId]': payment.id,
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'huf',
        'line_items[0][price_data][unit_amount]': String(payment.amountHuf * 100), // a HUF a Stripe-nál kétjegyű pénznem
        'line_items[0][price_data][product_data][name]': payment.description,
        locale: 'hu',
      })
      if (customer.email) form.set('customer_email', customer.email)
      const response = await fetchImpl('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST', body: form, signal: AbortSignal.timeout(10_000),
        headers: { authorization: `Bearer ${secretKey}`, 'content-type': 'application/x-www-form-urlencoded' },
      })
      const data = await response.json()
      if (!response.ok || !data.url) throw providerError('stripe_checkout_failed', data.error?.message)
      return { providerRef: data.id, url: data.url }
    },
    async parseWebhook({ rawBody, headers }) {
      const header = String(headers['stripe-signature'] || '')
      const fields = Object.fromEntries(header.split(',').map((item) => item.split('=')))
      const signatures = header.split(',').filter((item) => item.startsWith('v1=')).map((item) => item.slice(3))
      if (!webhookSecret || !fields.t || !signatures.length) return { status: 'invalid' }
      const expected = createHmac('sha256', webhookSecret).update(`${fields.t}.${rawBody}`).digest('hex')
      const fresh = Math.abs(Date.now() / 1000 - Number(fields.t)) < 300
      if (!fresh || !signatures.some((signature) => safeEqual(signature, expected))) return { status: 'invalid' }
      const event = JSON.parse(rawBody)
      const object = event.data?.object || {}
      const paymentId = object.client_reference_id || object.metadata?.paymentId
      if (!paymentId) return { status: 'ignored' }
      if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type) && object.payment_status === 'paid') {
        return { paymentId, status: 'paid', amountHuf: Math.round(object.amount_total / 100) }
      }
      if (['checkout.session.expired', 'checkout.session.async_payment_failed'].includes(event.type)) return { paymentId, status: 'failed' }
      return { status: 'ignored' }
    },
  }
}

function barionProvider({ config, fetchImpl }) {
  const { posKey, payee, baseUrl, gatewayUrl } = config.barion
  return {
    label: 'Bankkártya (Barion)',
    ready: Boolean(posKey && payee),
    async createCheckout({ payment, customer, returnUrl }) {
      const response = await fetchImpl(`${baseUrl}/v2/Payment/Start`, {
        method: 'POST', signal: AbortSignal.timeout(10_000), headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          POSKey: posKey, PaymentType: 'Immediate', GuestCheckOut: true, FundingSources: ['All'],
          PaymentRequestId: payment.id, OrderNumber: payment.id, Currency: 'HUF', Locale: 'hu-HU',
          PayerHint: customer.email || undefined,
          RedirectUrl: returnUrl, CallbackUrl: `${config.apiUrl}/api/payments/webhook/barion`,
          Transactions: [{
            POSTransactionId: payment.id, Payee: payee, Total: payment.amountHuf, Comment: payment.description,
            Items: [{ Name: payment.description, Description: payment.description, Quantity: 1, Unit: 'db', UnitPrice: payment.amountHuf, ItemTotal: payment.amountHuf }],
          }],
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.PaymentId) throw providerError('barion_start_failed', data.Errors?.[0]?.Description)
      return { providerRef: data.PaymentId, url: data.GatewayUrl || `${gatewayUrl}?Id=${data.PaymentId}` }
    },
    // A Barion visszahívása csak a PaymentId-t tartalmazza; az állapotot mindig lekérdezzük a Barion API-tól.
    async parseWebhook({ rawBody, query }) {
      let barionId = query.get('paymentId') || query.get('PaymentId')
      if (!barionId && rawBody) {
        const form = new URLSearchParams(rawBody)
        barionId = form.get('paymentId') || form.get('PaymentId')
        if (!barionId) try { barionId = JSON.parse(rawBody).PaymentId } catch { /* nem JSON */ }
      }
      if (!barionId) return { status: 'ignored' }
      const response = await fetchImpl(`${baseUrl}/v2/Payment/GetPaymentState?${new URLSearchParams({ POSKey: posKey, PaymentId: barionId })}`, { signal: AbortSignal.timeout(10_000) })
      const data = await response.json()
      if (!response.ok || !data.PaymentRequestId) return { status: 'ignored' }
      if (data.Status === 'Succeeded') return { paymentId: data.PaymentRequestId, status: 'paid', amountHuf: Math.round(Number(data.Total)) }
      if (['Canceled', 'Failed', 'Expired'].includes(data.Status)) return { paymentId: data.PaymentRequestId, status: 'failed' }
      return { status: 'ignored' }
    },
  }
}

function simplepayProvider({ config, fetchImpl, now }) {
  const { merchant, secretKey, baseUrl } = config.simplepay
  const sign = (body) => createHmac('sha384', secretKey).update(body).digest('base64')
  return {
    label: 'Bankkártya (SimplePay)',
    ready: Boolean(merchant && secretKey),
    async createCheckout({ payment, customer, returnUrl }) {
      const orderRef = payment.id.replaceAll('-', '') // csak betű/szám lehet
      const body = JSON.stringify({
        salt: crypto.randomUUID().replaceAll('-', ''), merchant, orderRef, currency: 'HUF', customerEmail: customer.email || '',
        language: 'HU', sdkVersion: 'NailsByEvelin_1.0', methods: ['CARD'], total: String(payment.amountHuf),
        timeout: new Date(now().getTime() + 30 * 60_000).toISOString().replace(/\.\d+Z$/, '+00:00'),
        url: returnUrl,
      })
      const response = await fetchImpl(`${baseUrl}/payment/v2/start`, {
        method: 'POST', body, signal: AbortSignal.timeout(10_000), headers: { 'content-type': 'application/json', signature: sign(body) },
      })
      const data = await response.json()
      if (!response.ok || !data.paymentUrl) throw providerError('simplepay_start_failed', JSON.stringify(data.errorCodes || []))
      return { providerRef: String(data.transactionId), url: data.paymentUrl, orderRef }
    },
    async parseWebhook({ rawBody, headers }) {
      if (!secretKey || !safeEqual(headers.signature || '', sign(rawBody))) return { status: 'invalid' }
      const event = JSON.parse(rawBody)
      if (!event.orderRef) return { status: 'ignored' }
      // A tárolóban a payment.id kötőjelekkel szerepel; a keresést az app végzi az orderRef alapján
      if (event.status === 'FINISHED') return { orderRef: event.orderRef, status: 'paid' }
      if (['NOTAUTHORIZED', 'CANCELLED', 'TIMEOUT'].includes(event.status)) return { orderRef: event.orderRef, status: 'failed' }
      return { status: 'ignored' }
    },
    // A SimplePay az IPN-re aláírt, `receiveDate` mezővel bővített választ vár
    webhookReply(rawBody) {
      const body = JSON.stringify({ ...JSON.parse(rawBody), receiveDate: new Date().toISOString().replace(/\.\d+Z$/, '+00:00') })
      return { body, headers: { signature: sign(body) } }
    },
  }
}

// Demó fizetés: a saját /demo-pay oldalunk, kamu kártyaadatokkal (csak DEMO_PAYMENTS=1 mellett).
const demoProvider = ({ config }) => ({
  label: 'Bankkártya (demó)',
  ready: Boolean(config.demoPayments),
  async createCheckout({ payment, returnUrl }) {
    return { providerRef: null, url: `${config.apiUrl}/demo-pay/${payment.id}?${new URLSearchParams({ return: returnUrl })}` }
  },
  async parseWebhook() { return { status: 'ignored' } },
})

// Kézi fizetés: átutalás vagy egyeztetés Evelinnel; az admin igazolja vissza.
const manualProvider = ({ config }) => ({
  label: 'Átutalás / egyeztetés Evelinnel',
  ready: true,
  async createCheckout({ payment }) {
    const instructions = config.bankTransferInfo
      ? `${config.bankTransferInfo} Közlemény: ${payment.id.slice(0, 8).toUpperCase()}`
      : 'Evelin felveszi veled a kapcsolatot a fizetés részleteivel.'
    return { providerRef: null, url: null, instructions }
  },
  async parseWebhook() { return { status: 'ignored' } },
})

export function createPayments(context) {
  const all = { stripe: stripeProvider(context), barion: barionProvider(context), simplepay: simplepayProvider(context), demo: demoProvider(context), manual: manualProvider(context) }
  const enabled = context.config.paymentProviders.filter((id) => all[id]?.ready && id !== 'manual')
  const order = [...enabled, 'manual']
  return {
    order,
    defaultProvider: order[0],
    list: () => order.map((id) => ({ id, label: all[id].label })),
    get: (id) => (order.includes(id) ? all[id] : null),
  }
}
