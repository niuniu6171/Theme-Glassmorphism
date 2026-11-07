const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, character => HTML_ENTITIES[character]!)
}

// ECharts inserts formatter strings as HTML. Task names come from Hub settings,
// so encode them at this sink while keeping the original names for matching.
export function formatPingTooltipRow(name: string, value: number, color: string | undefined, isLoss: boolean): string {
  const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${escapeHtml(color ?? '')};margin-right:8px;flex-shrink:0"></span>`
  const valueText = isLoss ? `${value.toFixed(1)}%` : `${Math.round(value)} ms`
  return `<div style="display:flex;align-items:center">${colorDot}<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(name)}</span><span style="margin-left:auto;font-weight:600;margin-left:16px;font-variant-numeric:tabular-nums">${valueText}</span></div>`
}
