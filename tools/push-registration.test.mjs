import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'

const source = stripTypeScriptTypes((await readFile(new URL('../expo-app/src/push.ts', import.meta.url), 'utf8'))
  .replace(/^import .+ from .+$/gm, '')).replace(/^export /gm, '')
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(setImmediate) }
function fixture({ granted = true, failures = 0 } = {}) {
  const state = { granted, failures, saved: 0, tokenReads: 0, retry: null, foreground: null }
  const noop = async () => {}
  const context = {
    Error,
    useEffect() {}, useState: () => [0, () => {}],
    Platform: { OS: 'android' },
    AppState: { addEventListener(_, fn) { state.foreground = fn; return { remove() { state.foreground = null } } } },
    Notifications: {
      setNotificationHandler() {}, setNotificationChannelAsync: noop, setNotificationCategoryAsync: noop,
      AndroidImportance: { MAX: 5, DEFAULT: 3 }, AndroidNotificationVisibility: { PRIVATE: 0 },
      getPermissionsAsync: async () => ({ granted: state.granted, canAskAgain: false }),
      getDevicePushTokenAsync: async () => { state.tokenReads++; return { data: 'device-push-token' } },
      addPushTokenListener: () => ({ remove() {} }),
    },
    TaskManager: { defineTask() {}, isTaskRegisteredAsync: async () => true },
    registerPushToken: async () => { if (state.failures-- > 0) throw new Error('network'); state.saved++ },
    currentOpenChat: () => null, refreshChats() {},
    setTimeout(fn) { state.retry = fn; return 1 }, clearTimeout() { state.retry = null },
  }
  runInNewContext(source + '\n globalThis.api = { registerForChatPush, startChatPush, usePushStatus };', context)
  return { state, api: context.api }
}

test('push: Android tiltás látható, token nélkül nem jelez sikert', async () => {
  const { state, api } = fixture({ granted: false })
  assert.equal(await api.registerForChatPush(), false)
  assert.equal(api.usePushStatus().state, 'denied')
  assert.equal(state.tokenReads, 0)
  assert.equal(state.saved, 0)
})

test('push: indítási hálózati hiba megjelenik, automatikus újrapróbálás regisztrál', async () => {
  const { state, api } = fixture({ failures: 1 })
  const stop = api.startChatPush()
  await flush()
  assert.equal(api.usePushStatus().state, 'error')
  assert.equal(api.usePushStatus().message, 'network')
  assert.equal(typeof state.retry, 'function')
  await state.retry()
  assert.equal(api.usePushStatus().state, 'ready')
  assert.equal(state.saved, 1)
  stop()
  assert.equal(state.retry, null)
  assert.equal(state.foreground, null)
})

test('push: Android-beállításokban engedélyezés után az előtérbe hozás regisztrál', async () => {
  const { state, api } = fixture({ granted: false })
  const stop = api.startChatPush()
  await flush()
  assert.equal(api.usePushStatus().state, 'denied')
  assert.equal(state.retry, null)
  state.granted = true
  state.foreground('active')
  await flush()
  assert.equal(state.saved, 1)
  assert.equal(api.usePushStatus().state, 'ready')
  stop()
})
