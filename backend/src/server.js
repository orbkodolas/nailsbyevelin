import { createServer } from 'node:http'
import { createApp } from './app.js'

const port = Number(process.env.PORT || 3001)
const app = createApp({ dataFile: process.env.DATA_FILE, databaseUrl: process.env.DATABASE_URL })
// Lassú / félbehagyott kérések bontása (Slowloris ellen; Node.js Security Best Practices), fejlécméret-korlát
const server = createServer({ maxHeaderSize: 16 * 1024, connectionsCheckingInterval: 5_000 }, app)
server.headersTimeout = 15_000
server.requestTimeout = 30_000
server.keepAliveTimeout = 65_000
server.maxRequestsPerSocket = 1000
server.listen(port, '0.0.0.0', () => console.log(`Nails by Evelin API listening on http://0.0.0.0:${port} (tár: ${process.env.DATABASE_URL ? 'Postgres' : 'JSON-fájl'})`))

// Lejárt fizetési hold-ok felszabadítása és emlékeztető e-mailek
const timer = setInterval(() => app.tick().catch((error) => console.error('[ütemező]', error)), app.config.reminderTickSeconds * 1000)
timer.unref()
