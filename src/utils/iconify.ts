import type { IconifyAPIModule, IconifyJSON } from '@iconify/vue'
import { _api, addCollection } from '@iconify/vue'
import localIcons from '../generated/local-icons.json' with { type: 'json' }

const noRemoteIcons: IconifyAPIModule = {
  prepare: (provider, prefix, icons) => [{ type: 'icons', provider, prefix, icons }],
  send: (_host, _params, callback) => callback('abort', 404),
}

/** Register every UI/provider icon before app.mount; missing icons never use a CDN. */
export async function setupIconify(): Promise<void> {
  // Unknown providers inherit the default module, which refuses network use too.
  for (const provider of new Set(['', ..._api.listAPIProviders()]))
    _api.setAPIModule(provider, noRemoteIcons)

  for (const collection of localIcons.collections) {
    // JSON inference creates a union of disjoint icon-name maps. The generator
    // validates these maps, and addCollection performs Iconify's runtime check.
    if (!addCollection(collection as unknown as IconifyJSON))
      throw new Error('Invalid bundled icon collection: ' + collection.prefix)
  }
}
