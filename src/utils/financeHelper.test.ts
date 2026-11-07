import assert from 'node:assert/strict'
import { loadConfig } from '../monitor/config.ts'
import { DEFAULT_EXCHANGE_RATES, getDailyExchangeRates } from './financeHelper.ts'

let online = false
let rateRequests = 0
const storage = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value) },
  removeItem: (key: string) => { storage.delete(key) },
} })
Object.defineProperty(globalThis, 'window', { configurable: true, value: {
  setTimeout, clearTimeout,
} })
globalThis.fetch = async (input) => {
  const url = String(input)
  if (url.startsWith('/api/themes/'))
    return new Response(JSON.stringify({ onlineExchangeRates: online }))
  rateRequests++
  assert.equal(url, 'https://open.er-api.com/v6/latest/CNY')
  return new Response(JSON.stringify({ rates: { ...DEFAULT_EXCHANGE_RATES, USD: 0.15 } }))
}

await loadConfig()
const offline = await getDailyExchangeRates()
assert.deepEqual(offline.rates, DEFAULT_EXCHANGE_RATES)
assert.equal(offline.source, 'default')
assert.equal(offline.approximate, true)
assert.equal(offline.updatedAt, null)
assert.equal(offline.onlineEnabled, false)
assert.equal(rateRequests, 0)

online = true
await loadConfig()
const enabled = await getDailyExchangeRates()
assert.equal(enabled.source, 'network')
assert.equal(enabled.rates.USD, 0.15)
assert.equal(enabled.onlineEnabled, true)
assert.equal(rateRequests, 1)
assert.equal((await getDailyExchangeRates()).source, 'cache')
assert.equal(rateRequests, 1)

online = false
await loadConfig()
const disabled = await getDailyExchangeRates()
assert.equal(disabled.source, 'default')
assert.equal(disabled.rates.USD, DEFAULT_EXCHANGE_RATES.USD)
assert.equal(disabled.onlineEnabled, false)
assert.equal(rateRequests, 1, 'Disabling rates must not fetch or reuse a previous network rate')
disabled.rates.USD = 99
assert.equal(DEFAULT_EXCHANGE_RATES.USD, offline.rates.USD)
console.log('Exchange rates: offline by default, explicit opt-in/cache, opt-out ignores old network cache')
