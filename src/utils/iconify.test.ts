import assert from 'node:assert/strict'
import { _api, getIcon, loadIcon } from '@iconify/vue'
import localIcons from '../generated/local-icons.json' with { type: 'json' }
import { setupIconify } from './iconify.ts'

let networkRequests = 0
_api.setFetch(async () => {
  networkRequests++
  throw new Error('Unexpected remote icon request')
})
await setupIconify()
for (const name of localIcons.names)
  assert(getIcon(name)?.body, 'Missing local UI/state/provider icon: ' + name)

// A future missing icon must fail locally rather than silently reverting to CDN.
await assert.rejects(loadIcon('tabler:niuniuhub-deliberately-missing'))
assert.equal(networkRequests, 0)
console.log('Local icons: all static/dynamic alternatives resolve and missing icons never fetch')
