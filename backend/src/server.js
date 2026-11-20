import { createServer } from 'node:http'
import { createApp } from './app.js'

const port = Number(process.env.PORT || 3001)
const app = createApp({ dataFile: process.env.DATA_FILE })
const server = createServer(app)
server.listen(port, '0.0.0.0', () => console.log(`Nails by Evelin API listening on http://0.0.0.0:${port}`))

// Lejárt fizetési hold-ok felszabadítása és emlékeztető e-mailek
const timer = setInterval(() => app.tick().catch((error) => console.error('[ütemező]', error)), app.config.reminderTickSeconds * 1000)
timer.unref()
