import assert from 'node:assert/strict'
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const destination = path.join(root, 'src/generated/local-icons.json')
const prefixes = new Set(['carbon', 'icon-park-outline', 'lucide', 'simple-icons', 'tabler'])
const iconPattern = /(['"\x60])((?:carbon|icon-park-outline|lucide|simple-icons|tabler):[a-z0-9-]+)\1/g
const names = new Set()
// Upstream references these three names, absent from its pinned icon package.
// Keep their call sites working with local equivalents instead of a CDN lookup.
const compatibilityAliases = {
  'icon-park-outline:mac': 'apple',
  'simple-icons:linode': 'akamai',
  'tabler:chip': 'cpu',
}

async function inspect(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'generated') await inspect(target)
      continue
    }
    if (!/\.(vue|ts)$/.test(entry.name) || entry.name.endsWith('.test.ts')) continue
    const text = await readFile(target, 'utf8')
    // Include literal alternatives and provider lookup tables, not only templates.
    for (const match of text.matchAll(iconPattern)) names.add(match[2])
    for (const match of text.matchAll(/(['"\x60])([a-z][a-z0-9-]*):\1\s*\+|(['"\x60])([a-z][a-z0-9-]*):[^'"\x60\r\n]*\$\{/g)) {
      assert(!prefixes.has(match[2] || match[4]), 'Computed icon name requires explicit local inventory: ' + target)
    }
  }
}

await inspect(path.join(root, 'src'))
assert(names.size > 0, 'No UI icons discovered')
const collections = []
for (const prefix of [...prefixes].sort()) {
  const source = JSON.parse(await readFile(path.join(root, 'node_modules/@iconify/json/json', prefix + '.json'), 'utf8'))
  const collection = { prefix, icons: {} }
  for (const key of ['left', 'top', 'width', 'height', 'rotate', 'hFlip', 'vFlip']) {
    if (Object.hasOwn(source, key)) collection[key] = source[key]
  }
  const visiting = new Set()
  function include(name) {
    if (Object.hasOwn(collection.icons, name) || Object.hasOwn(collection.aliases || {}, name)) return
    assert(!visiting.has(name), 'Circular icon alias: ' + prefix + ':' + name)
    visiting.add(name)
    if (Object.hasOwn(source.icons, name)) {
      const icon = source.icons[name]
      assert(typeof icon.body === 'string', 'Invalid icon: ' + prefix + ':' + name)
      assert(!/<\s*(script|foreignObject|iframe|object|embed)\b|\bon[a-z]+\s*=|(?:href|xlink:href)\s*=\s*['"]\s*(?:https?:|\/\/|data:|javascript:)/i.test(icon.body), 'Active or remote SVG content: ' + prefix + ':' + name)
      collection.icons[name] = icon
    }
    else {
      const replacement = compatibilityAliases[prefix + ':' + name]
      const alias = source.aliases?.[name] || (replacement ? { parent: replacement } : undefined)
      assert(alias, 'Icon missing from the pinned package: ' + prefix + ':' + name)
      include(alias.parent)
      collection.aliases ??= {}
      collection.aliases[name] = alias
    }
    visiting.delete(name)
  }
  for (const name of [...names].sort()) {
    if (name.startsWith(prefix + ':')) include(name.slice(prefix.length + 1))
  }
  if (Object.keys(collection.icons).length) collections.push(collection)
}
const output = JSON.stringify({ names: [...names].sort(), collections }, null, 2) + '\n'
if (process.argv.includes('--check')) {
  assert.equal(await readFile(destination, 'utf8'), output, 'Bundled icons are stale; run node scripts/generate-local-icons.mjs')
}
else {
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(destination, output)
}
console.log('Local icons: ' + names.size + ' names in ' + collections.length + ' collections; ' + Buffer.byteLength(output) + ' bytes')
