import assert from 'node:assert/strict'
import { formatPingTooltipRow } from './pingTooltip.ts'

const color = '#38bdf8'
const nameStart = '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'

// Test the actual formatter output, not only an otherwise unused escape helper.
for (const [name, encoded] of [
  ['<img src=x onerror="alert(1)">', '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'],
  ['</span><svg onload=alert(1)>', '&lt;/span&gt;&lt;svg onload=alert(1)&gt;'],
  ['&lt;img src=x onerror=alert(1)&gt;', '&amp;lt;img src=x onerror=alert(1)&amp;gt;'],
  ['A&B < > " \'', 'A&amp;B &lt; &gt; &quot; &#39;'],
  ['电信 / 联通 / 移动 · 香港 🇭🇰 e\u0301', '电信 / 联通 / 移动 · 香港 🇭🇰 e\u0301'],
  ['aiyun4837', 'aiyun4837'],
  ['', ''],
] as const) {
  for (const isLoss of [false, true]) {
    const html = formatPingTooltipRow(name, 12.56, color, isLoss)
    assert.ok(html.includes(`${nameStart}${encoded}</span>`), `task name must remain literal text: ${name}`)
    assert.doesNotMatch(html, /<(?:img|svg|script)\b/i)
    assert.equal((html.match(/<span\b/g) ?? []).length, 3, 'task names must not create additional elements')
    assert.ok(html.includes(isLoss ? '>12.6%</span>' : '>13 ms</span>'))
    assert.ok(html.includes(`background:${color};`))
  }
}

assert.ok(formatPingTooltipRow('HK', 0, color, false).includes('>0 ms</span>'))
assert.ok(formatPingTooltipRow('HK', 100, color, true).includes('>100.0%</span>'))
console.log('Ping tooltip: HTML injection, literal entities, Unicode and latency/loss formatting passed')
