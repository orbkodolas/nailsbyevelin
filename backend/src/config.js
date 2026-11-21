// Környezeti változók egy helyen. Tesztben/felülírásként a `overrides` paraméter használható.
const DEFAULT_HOURS = {
  // 0 = vasárnap … 6 = szombat; [kezdés, zárás] ablakok helyi időben
  1: [['09:00', '18:00']], 2: [['09:00', '18:00']], 3: [['09:00', '18:00']],
  4: [['09:00', '18:00']], 5: [['09:00', '18:00']], 6: [['09:00', '14:00']],
}

function parseJson(value, fallback) {
  if (!value) return fallback
  try { return JSON.parse(value) } catch { return fallback }
}
const num = (value, fallback) => (value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : fallback)

export function loadConfig(env = process.env, overrides = {}) {
  const config = {
    adminToken: env.ADMIN_TOKEN || 'dev-admin-token',
    // Ha meg van adva, a szerver csak ezt a SHA-256 hash-t ismeri (hex), a nyers kulcsot nem
    adminTokenSha256: /^[0-9a-f]{64}$/i.test(env.ADMIN_TOKEN_SHA256 || '') ? env.ADMIN_TOKEN_SHA256.toLowerCase() : '',
    // Védelem: IP-nkénti létrehozási keret, fizetetlen foglalások felső korlátja, űrlap-időcsapda, admin kizárás
    createPerHour: num(env.CREATE_PER_HOUR, 8),
    createPerDay: num(env.CREATE_PER_DAY, 20),
    maxPendingHolds: num(env.MAX_PENDING_HOLDS, 20),
    minFormMs: num(env.MIN_FORM_MS, 2500),
    adminMaxFailures: num(env.ADMIN_MAX_FAILURES, 10),
    timezone: env.TIMEZONE || 'Europe/Budapest',
    publicUrl: (env.PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, ''),
    apiUrl: (env.API_URL || `http://localhost:${env.PORT || 3001}`).replace(/\/$/, ''),
    corsOrigin: env.CORS_ORIGIN || '*',
    trustProxy: env.TRUST_PROXY === '1',

    // Naptár
    workingHours: parseJson(env.WORKING_HOURS, DEFAULT_HOURS),
    slotStepMinutes: num(env.SLOT_STEP_MINUTES, 30),
    bufferMinutes: num(env.BUFFER_MINUTES, 15),
    minLeadMinutes: num(env.MIN_LEAD_MINUTES, 60),
    maxDaysAhead: num(env.MAX_DAYS_AHEAD, 14),
    // Évente ismétlődő szünnapok HH-NN formában (karácsony, szilveszter, újév); CLOSED_DAYS=12-24,12-25 felülírja
    closedDays: env.CLOSED_DAYS !== undefined ? env.CLOSED_DAYS.split(',').map((item) => item.trim()).filter(Boolean) : ['12-24', '12-25', '12-26', '12-31', '01-01'],
    // Munkaszüneti ünnepnapokon zárva (CLOSE_HOLIDAYS=0 kikapcsolja); az admin appban napra szólóan megnyitható
    closeHolidays: env.CLOSE_HOLIDAYS !== '0',
    maxActiveBookingsPerGuest: num(env.MAX_ACTIVE_BOOKINGS_PER_GUEST, 2),

    // Foglalási szabályok
    depositPercent: num(env.DEPOSIT_PERCENT, 0), // 0 = nincs előleg mindenkinek; meg nem jelenés után mindig teljes előrefizetés
    onlineHoldMinutes: num(env.ONLINE_HOLD_MINUTES, 30),
    manualHoldHours: num(env.MANUAL_HOLD_HOURS, 24),
    lateCancelHours: num(env.LATE_CANCEL_HOURS, 24),

    // Értesítések
    formSubmitEmail: env.FORMSUBMIT_EMAIL || '',
    resendApiKey: env.RESEND_API_KEY || '',
    mailFrom: env.MAIL_FROM || '',
    reminderTickSeconds: num(env.REMINDER_TICK_SECONDS, 60),

    // Élő csevegés: push az admin appba (Firebase szolgáltatásfiók JSON, nyersen vagy base64-ben)
    fcmServiceAccount: env.FCM_SERVICE_ACCOUNT || '',
    chatTimeoutSeconds: num(env.CHAT_TIMEOUT_SECONDS, 120), // ennyi ideje van Evelinnek válaszolni
    chatBusyMinutes: num(env.CHAT_BUSY_MINUTES, 30), // elutasítás / lejárat után ennyi ideig nem jön új értesítés
    chatIdleMinutes: num(env.CHAT_IDLE_MINUTES, 30), // üzenet nélküli élő beszélgetés ennyi után lezárul
    chatPerHour: num(env.CHAT_PER_HOUR, 5), // új kérdések IP-nként óránként
    // Csendes órák (helyi idő, [kezdet, vég)): ilyenkor nincs értesítés, a kérdés egyből e-mailes módba megy
    chatQuietHours: (/^\d{1,2}-\d{1,2}$/.test(env.CHAT_QUIET_HOURS || '') ? env.CHAT_QUIET_HOURS : '22-8').split('-').map(Number),

    // Fizetés: PAYMENT_PROVIDERS=stripe,barion,simplepay (az első az alapértelmezett); a "manual" mindig elérhető
    paymentProviders: (env.PAYMENT_PROVIDERS || '').split(',').map((item) => item.trim()).filter(Boolean),
    demoPayments: env.DEMO_PAYMENTS === '1', // kamu kártyás fizetőoldal teszteléshez; éles üzemben ne kapcsold be
    bankTransferInfo: env.BANK_TRANSFER_INFO || '',
    stripe: { secretKey: env.STRIPE_SECRET_KEY || '', webhookSecret: env.STRIPE_WEBHOOK_SECRET || '' },
    barion: {
      posKey: env.BARION_POS_KEY || '', payee: env.BARION_PAYEE_EMAIL || '',
      baseUrl: env.BARION_BASE_URL || (env.BARION_ENV === 'prod' ? 'https://api.barion.com' : 'https://api.test.barion.com'),
      gatewayUrl: env.BARION_GATEWAY_URL || (env.BARION_ENV === 'prod' ? 'https://secure.barion.com/Pay' : 'https://secure.test.barion.com/Pay'),
    },
    simplepay: {
      merchant: env.SIMPLEPAY_MERCHANT || '', secretKey: env.SIMPLEPAY_SECRET_KEY || '',
      baseUrl: env.SIMPLEPAY_BASE_URL || (env.SIMPLEPAY_ENV === 'prod' ? 'https://secure.simplepay.hu' : 'https://sandbox.simplepay.hu'),
    },
  }
  return { ...config, ...overrides }
}
