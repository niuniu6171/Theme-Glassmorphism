import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, expect } from '@playwright/test'

// Isolated local fixture only: never load a live Hub, cookies or a user profile.
// Run after building, with MONITOR_BROWSER_AUDIT_DIR set outside this repository.
const repository = await realpath(fileURLToPath(new URL('..', import.meta.url)))
const dist = await realpath(path.join(repository, 'dist'))
const requestedOutput = process.env.MONITOR_BROWSER_AUDIT_DIR
assert.ok(requestedOutput && path.isAbsolute(requestedOutput), 'MONITOR_BROWSER_AUDIT_DIR must be an absolute path')
function outsideRepository(directory) {
  const relative = path.relative(repository, directory)
  return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
}
assert.ok(outsideRepository(path.resolve(requestedOutput)), 'Audit output must be outside the repository')
await mkdir(requestedOutput, { recursive: true })
const output = await realpath(requestedOutput)
assert.ok(outsideRepository(output), 'Audit output must resolve outside the repository')

const nodeName = 'Local Regression Node'
const tasks = {
  1: '电信 · Regression 🇭🇰',
  2: '<img src=x onerror="window.__themeXss=1">',
  3: '</span><script>window.__themeXss=2</script>',
  4: '<svg onload="window.__themeXss=3">',
}
const now = Math.floor(Date.now() / 1000)
const gib = 1024 ** 3
const metrics = {
  uptime: 86400, cpu: 12.5, load: [0.12, 0.08, 0.06],
  mem_total: 2 * gib, mem_used: 0.5 * gib, swap_total: 0, swap_used: 0,
  disk_total: 20 * gib, disk_used: 4 * gib,
  net_rx: 120000, net_tx: 80000, total_rx: 3 * gib, total_tx: gib,
  month_rx: gib, month_tx: 0.5 * gib, tcp: 12, udp: 2, procs: 48,
}
const node = {
  id: 1, name: nodeName, sort: 0, group: 'Local fixture', public: false, online: true,
  country: 'HK', last_seen: now, metrics, os: 'Debian GNU/Linux 13', kernel: '6.12-test',
  arch: 'x86_64', virt: 'KVM', cpu_name: 'Synthetic Test CPU', cpu_cores: 2,
  mem_total: metrics.mem_total, swap_total: 0, disk_total: metrics.disk_total,
  agent_version: '1.2.3', price: 0, currency: 'CNY', billing_cycle: 'monthly',
  expires_at: null, expires_in: null, traffic_limit: 0, traffic_mode: 'sum', traffic_reset_day: 1,
  total_rx: metrics.total_rx, total_tx: metrics.total_tx, month_rx: metrics.month_rx,
  month_tx: metrics.month_tx, month_used: 1.5 * gib, month_start: '', day_rx: 100000, day_tx: 50000,
  hostname: 'local-fixture', ip: '192.0.2.10', ipv4: '192.0.2.10', ipv6: '',
  addresses: [{ address: '192.0.2.10', source: 'fixture' }],
  remark: 'Synthetic data only', public_remark: 'Local browser regression',
}
const history = {
  step: 60,
  metrics: Array.from({ length: 30 }, (_, i) => ({
    ...metrics, ts: now - (29 - i) * 60, cpu: 10 + i % 6, cpu_max: 20 + i % 7,
    net_rx_max: 150000, net_tx_max: 100000, minutes: 1,
  })),
  ping: Array.from({ length: 30 }, (_, i) => Object.keys(tasks).map(id => ({
    ts: now - (29 - i) * 60, task_id: Number(id), latency: 30 + Number(id) * 8 + i % 5,
    loss: i % 4 === 0 ? 10 : 0,
  }))).flat(),
  probes: tasks,
  loss: Object.fromEntries(Object.keys(tasks).map(id => [id, 2.5])),
}

const report = {
  startedAt: new Date().toISOString(), fixture: 'synthetic loopback only',
  browser: 'installed Chrome, headless, fresh nonpersistent context',
  passed: false, checks: {}, externalRequests: [], unexpectedApiRequests: [],
  pageErrors: [], consoleErrors: [], failedRequests: [], screenshots: [],
}
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
}
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname)
    const filename = path.resolve(dist, `.${pathname}`)
    const relative = path.relative(dist, filename)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      response.writeHead(403).end()
      return
    }
    let served = filename
    try {
      if (!(await stat(served)).isFile()) served = path.join(dist, 'index.html')
    }
    catch {
      if (pathname === '/' || /^\/(?:node|instance)\/\d+$/.test(pathname)) served = path.join(dist, 'index.html')
      else { response.writeHead(404).end(); return }
    }
    const bytes = await readFile(served)
    // No CSP is added: it must not mask a tooltip injection regression.
    response.writeHead(200, { 'content-type': mime[path.extname(served)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
    response.end(bytes)
  }
  catch { response.writeHead(500).end() }
})

let browser
let context
let page
let phase = 'setup'
async function screenshot(name) {
  const filename = path.join(output, name)
  await page.screenshot({ path: filename, fullPage: true })
  report.screenshots.push(filename)
}
async function checkIcons(label) {
  const icons = page.locator('svg.iconify')
  await expect.poll(() => icons.count(), { timeout: 15000 }).toBeGreaterThan(5)
  const details = await icons.evaluateAll(elements => ({
    count: elements.length,
    empty: elements.filter(element => !element.querySelector('path, circle, rect, line, polygon, polyline, ellipse, use, g')).length,
    visible: elements.filter(element => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0).length,
  }))
  assert.equal(details.empty, 0, `${label}: bundled SVG icons must have drawing elements`)
  assert.ok(details.visible > 5, `${label}: bundled SVG icons must be visible`)
  report.checks[`${label}Icons`] = details
}
async function findTooltip(chart) {
  await chart.scrollIntoViewIfNeeded()
  const box = await chart.boundingBox()
  assert.ok(box && box.width > 100 && box.height > 100, 'Ping chart must have a rendered canvas')
  for (const fraction of [0.5, 0.35, 0.65, 0.25, 0.75]) {
    await page.mouse.move(box.x + box.width * fraction, box.y + box.height * 0.45)
    await page.waitForTimeout(200)
    const state = await chart.evaluate((element, expectedNames) => {
      const tooltip = [...element.querySelectorAll('div')].find(candidate =>
        candidate.style.position === 'absolute'
        && candidate.textContent.includes(expectedNames[1])
        && getComputedStyle(candidate).visibility !== 'hidden'
        && candidate.getBoundingClientRect().width > 0)
      return tooltip ? {
        text: tooltip.textContent,
        unsafeElements: tooltip.querySelectorAll('img, script, svg').length,
        sentinel: window.__themeXss,
      } : null
    }, Object.values(tasks))
    if (state) return state
  }
  throw new Error('Could not observe the real ECharts HTML tooltip')
}

try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const origin = `http://127.0.0.1:${server.address().port}`
  report.origin = origin
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, serviceWorkers: 'block' })
  assert.equal((await context.cookies()).length, 0)
  report.checks.initialCookiesEmpty = true
  await context.addInitScript(() => { window.__themeXss = 0 })
  await context.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin !== origin) {
      report.externalRequests.push({ phase, url: url.href, method: request.method(), resourceType: request.resourceType() })
      await route.abort('blockedbyclient')
      return
    }
    if (!url.pathname.startsWith('/api/')) { await route.continue(); return }
    let data
    if (request.method() === 'GET' && url.pathname === '/api/me')
      data = { authed: true, public_page: false, site_name: 'Local Security Regression', history_days: 7 }
    else if (request.method() === 'GET' && url.pathname === '/api/nodes')
      data = { admin: true, nodes: [node] }
    else if (request.method() === 'GET' && url.pathname === '/api/nodes/1/metrics') data = history
    else if (request.method() === 'GET' && url.pathname === '/api/themes/niuniuhub-glass/config') data = {}
    else {
      report.unexpectedApiRequests.push({ phase, method: request.method(), path: url.pathname })
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Unmocked API' }) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'cache-control': 'no-store' }, body: JSON.stringify(data) })
  })
  await context.routeWebSocket('**/*', socket => {
    const url = new URL(socket.url())
    if (url.host === new URL(origin).host && url.pathname === '/api/ws') {
      socket.send(JSON.stringify({ nodes: [node] }))
      return
    }
    report.externalRequests.push({ phase, url: url.href, resourceType: 'websocket' })
    void socket.close({ code: 1008, reason: 'Only mocked loopback WebSocket is allowed' })
  })
  page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => report.pageErrors.push({ phase, message: error.message, stack: error.stack }))
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push({ phase, text: message.text() }) })
  page.on('requestfailed', request => report.failedRequests.push({ phase, url: request.url(), reason: request.failure()?.errorText }))

  phase = 'homepage'
  await page.goto(origin, { waitUntil: 'domcontentloaded' })
  const card = page.getByRole('button', { name: `查看节点 ${nodeName} 详情`, exact: true })
  await expect(card).toBeVisible({ timeout: 30000 })
  await expect(card).toContainText('CPU')
  await checkIcons('home')
  await page.waitForTimeout(3000)
  await screenshot('homepage.png')
  report.checks.homepage = true

  phase = 'node-detail'
  await card.click()
  await expect(page).toHaveURL(/\/(?:instance|node)\/1$/)
  await expect(page.locator('.instance-detail')).toContainText(nodeName)
  await expect(page.locator('.instance-detail')).toContainText('Synthetic Test CPU')
  await expect(page.locator('.instance-detail')).toContainText('Debian')
  await checkIcons('detail')
  await page.waitForTimeout(3000)
  await screenshot('node-detail.png')
  report.checks.nodeDetail = true

  phase = 'ping-tooltip'
  const detailTabs = page.getByRole('tab', { name: '延迟', exact: true })
  if (await page.getByRole('tab', { name: '概览', exact: true }).count()) await detailTabs.first().click()
  await expect(page.locator('[data-ping-task-id="2"]')).toBeVisible()
  const chart = page.locator('.echarts').last()
  await expect(chart.locator('canvas').first()).toBeVisible()
  for (const mode of ['延迟', '丢包率']) {
    await page.getByRole('tablist', { name: '探测图表指标' }).getByRole('tab', { name: mode, exact: true }).click()
    const state = await findTooltip(chart)
    for (const name of Object.values(tasks)) assert.ok(state.text.includes(name), `${mode}: task name must be literal tooltip text`)
    assert.equal(state.unsafeElements, 0, `${mode}: task names must not create img/script/svg elements`)
    assert.equal(state.sentinel, 0, `${mode}: no injected handler may execute`)
    report.checks[mode === '延迟' ? 'latencyTooltip' : 'lossTooltip'] = state
  }
  await screenshot('ping-tooltip.png')
  assert.equal(await page.locator('img[src="x"], svg[onload]').count(), 0, 'No injected image/SVG nodes may exist')
  assert.equal(await page.locator('script').evaluateAll(elements => elements.filter(element => element.textContent.includes('window.__themeXss=2')).length), 0, 'No injected script nodes may exist')
  assert.equal(await page.evaluate(() => window.__themeXss), 0)
  assert.equal((await context.cookies()).length, 0)
  assert.deepEqual(report.pageErrors, [], 'No uncaught browser errors')
  assert.deepEqual(report.unexpectedApiRequests, [], 'No unexpected API calls')
  assert.deepEqual(report.externalRequests, [], 'Default views must not attempt external requests')
  report.checks.noExternalRequests = true
  report.checks.noPageErrors = true
  report.checks.noCookies = true
  report.passed = true
}
catch (error) {
  report.failure = { phase, message: error.message, stack: error.stack }
  if (page && !page.isClosed()) await screenshot('failure.png').catch(() => {})
  process.exitCode = 1
}
finally {
  if (context) await context.close().catch(() => {})
  if (browser) await browser.close().catch(() => {})
  server.closeAllConnections()
  if (server.listening) await new Promise(resolve => server.close(resolve))
  report.finishedAt = new Date().toISOString()
  report.cleanup = { browserClosed: !browser?.isConnected(), serverClosed: !server.listening }
  await writeFile(path.join(output, 'browser-security.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ passed: report.passed, output, checks: Object.keys(report.checks), externalRequestCount: report.externalRequests.length, pageErrorCount: report.pageErrors.length, failure: report.failure }, null, 2))
}
