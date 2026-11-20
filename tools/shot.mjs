// Fejlesztői segéd: headless Chromium képernyőkép lépésekkel (kattintás, írás, várakozás, görgetés).
// Használat: node tools/shot.mjs <url> <kimenet.png> <szélesség> <magasság> '["wait:1500","click:.option","scroll:1200"]'
import { spawn } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [url, out, width = '390', height = '844', stepsJson = '[]'] = process.argv.slice(2)
const steps = JSON.parse(stepsJson)
const port = 9300 + Math.floor(Math.random() * 500)
const profile = mkdtempSync(join(tmpdir(), 'shot-'))
const chrome = spawn('chromium-browser', ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page) return page.webSocketDebuggerUrl
    } catch { /* még indul */ }
    await sleep(200)
  }
  throw new Error('A Chromium nem indult el')
}

const ws = new WebSocket(await connect())
await new Promise((r) => ws.addEventListener('open', r))
let id = 0; const pending = new Map(); const logs = []
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
  if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) logs.push(msg.params.args.map((a) => a.value ?? a.description).join(' '))
  if (msg.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text))
})
const send = (method, params = {}) => new Promise((resolve) => { const n = ++id; pending.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params })) })
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value

await send('Runtime.enable'); await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: Number(width), height: Number(height), deviceScaleFactor: 1, mobile: Number(width) < 700 })
await send('Page.navigate', { url })
await sleep(2500)
for (const step of steps) {
  const [kind, ...rest] = step.split(':'); const arg = rest.join(':')
  if (kind === 'wait') await sleep(Number(arg))
  else if (kind === 'click') console.log('click', arg, await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(arg)});if(!e)return 'NOT FOUND';e.click();return 'ok'})()`))
  else if (kind === 'type') { const [sel, ...v] = arg.split('|'); await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});const set=Object.getOwnPropertyDescriptor(e.__proto__,'value').set;set.call(e,${JSON.stringify(v.join('|'))});e.dispatchEvent(new Event('input',{bubbles:true}))})()`) }
  else if (kind === 'check') await evaluate(`document.querySelector(${JSON.stringify(arg)}).click()`)
  else if (kind === 'scroll') { await evaluate(`window.scrollTo(0,${Number(arg)})`); await sleep(1200) }
  else if (kind === 'eval') console.log('eval', await evaluate(arg))
  await sleep(250)
}
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
if (logs.length) console.log('Konzol:', logs.slice(0, 8).join(' | '))
ws.close(); chrome.kill()
process.exit(0)
