# Nails by Evelin – foglalási API

Node.js (20.6+), külső csomag nélkül, JSON fájl alapú tárolással. Indítás: `npm start`, tesztek: `npm test`.
Beállítások: `backend/.env` (példa: `.env.example`, a Git kihagyja). Az árak és a házirend a `../shared/catalog.json`-ban vannak; a frontend ugyanezt olvassa.

## Mit old meg?

A cél: ne legyenek meg nem jelenések és szó nélküli lemondások.

- **Csak szabad idősáv foglalható**: munkaidő, szolgáltatás hossza, 15 perc puffer, admin blokkok (szabadság) – szerveroldalon ellenőrizve.
- **Minden vendég kap egy privát linket** (`/#/foglalas/:id/:token`) a visszaigazoló e-mailben: egy kattintással megerősít vagy lemond. A lemondás Evelinnek azonnal e-mailt küld; 24 órán belül „késői lemondásként” jelölve.
- **Emlékeztetők**: 24 és 2 órával előtte e-mail megerősítő linkkel (Resend kulccsal).
- **Következmény automatán**: az admin „nem jelent meg / késett” jelölése után a vendég (telefon vagy e-mail alapján) következő foglalása `pending_payment`: a teljes ár előre fizetendő, késés esetén az előző alkalom díjával együtt. Az időpont fizetésig foglalt (online: 30 perc, átutalás: 24 óra), utána automatikusan felszabadul.
- **Opcionális előleg** mindenkinek: `DEPOSIT_PERCENT`.
- **Visszaélés ellen**: IP-alapú korlát, honeypot mező, vendégenként max. 2 aktív foglalás.

## Vendég végpontok

- `GET /api/catalog` – szolgáltatások, árak, házirend, fizetési módok
- `GET /api/availability?serviceId=&from=YYYY-MM-DD&to=` – szabad kezdési idők napokra (max. 62 nap)
- `POST /api/bookings` – `name`, `phone`, `email`, `serviceId`, `startsAt` (ISO, időzónával), `acceptedRules: true`, opc. `note`, `paymentMethod`; a válasz tartalmazza a `manageToken`-t és fizetés esetén a `payment` blokkot (`checkoutUrl` vagy `instructions`)
- `GET /api/bookings/:id?token=` · `POST /api/bookings/:id/(confirm|cancel|pay)` – `token` a body-ban vagy `x-manage-token` fejlécben
- `POST /api/vouchers` – ajándékutalvány rendelés (`amountHuf`, `buyerName`, `buyerEmail`, opc. `recipientName`, `message`)

## Admin (`Authorization: Bearer <ADMIN_TOKEN>`)

- `GET /api/admin/bookings` (a blokkokkal együtt)
- `POST /api/admin/bookings/:id/(no-show|payment-confirmed|complete|cancel)` – no-show törzs: `{ "reason": "late" | "no_show" }`
- `POST /api/admin/blocks` (`{date}` egész napra vagy `{startsAt, endsAt}`), `DELETE /api/admin/blocks/:id`
- `GET /api/admin/vouchers`, `POST /api/admin/vouchers/:id/(payment-confirmed|redeem)`
- `GET /api/admin/reminders?due=1`, `POST /api/admin/reminders/:id`

Admin felület: külön app készül; addig az `/api/admin/*` végpontok `Authorization: Bearer <ADMIN_TOKEN>` fejléccel érhetők el.

## Fizetés

`PAYMENT_PROVIDERS` sorrendje adja az alapértelmezettet; az „átutalás / egyeztetés” (`manual`) mindig elérhető, ezt az admin igazolja vissza.

| Szolgáltató | Webhook | Megjegyzés |
|---|---|---|
| Stripe | `POST /api/payments/webhook/stripe` | Checkout Session, `checkout.session.completed`; aláírás-ellenőrzés `STRIPE_WEBHOOK_SECRET`-tel |
| Barion | `/api/payments/webhook/barion` (CallbackUrl) | a visszahívás után `GetPaymentState`-tel kérdezi le az állapotot |
| SimplePay | `POST /api/payments/webhook/simplepay` (IPN) | HMAC-SHA384; **váz**, sandbox kulccsal kell kipróbálni |

A Stripe és Barion a dokumentáció alapján, mock-kal tesztelve van bekötve; éles használat előtt egy sandbox fizetéssel ki kell próbálni. A webhook idempotens, az összeget ellenőrzi. Ha a fizetés a hold lejárta után érkezik és az időpont már foglalt, a foglalás `refund_needed` jelzést kap, és Evelin e-mailt kap. Visszatérítést (`refundStatus: review`) egyelőre kézzel kell intézni a szolgáltatónál.

## Határok

Nincs naptárszinkron és SMS. Az admin egy megosztott tokent használ. A JSON fájl tároló egy példányos futtatásra való; nagyobb forgalomnál adatbázisra cserélendő. Éles használat előtt HTTPS és rendszeres mentés kell.
