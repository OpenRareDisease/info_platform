// @vitest-environment node

import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

type RawLoaderPlugin = {
  name: string
  load: (id: string) => Promise<string | null>
}

function hasRawLoaderShape(value: unknown): value is RawLoaderPlugin {
  if (!value || typeof value !== 'object') return false

  const candidate = value as { name?: unknown; load?: unknown }
  return candidate.name === 'rare-info-list-raw-loader' && typeof candidate.load === 'function'
}

async function loadRawLoaderPlugin() {
  vi.stubGlobal('defineNuxtConfig', <T>(config: T) => config)
  const config = (await import('./nuxt.config')).default
  const plugin = config.nitro?.rollupConfig?.plugins?.find(hasRawLoaderShape)

  if (!plugin) throw new Error('rare-info-list-raw-loader is missing')
  return plugin
}

describe('rare-info-list-raw-loader', () => {
  it('loads only the exact registry file with the raw query', async () => {
    const plugin = await loadRawLoaderPlugin()
    const registryPath = resolve('rare_disease_bot/rare_info_list.txt')

    await expect(plugin.load(`${registryPath}?raw`)).resolves.toContain(
      'https://www.systemicjia.org/'
    )
  })

  it('rejects a different absolute path that merely ends with the registry path', async () => {
    const plugin = await loadRawLoaderPlugin()
    const registryPath = resolve('rare_disease_bot/rare_info_list.txt')

    await expect(plugin.load(`/tmp/mirror${registryPath}?raw`)).resolves.toBeNull()
  })

  it('rejects the exact registry file when the query is not exactly raw', async () => {
    const plugin = await loadRawLoaderPlugin()
    const registryPath = resolve('rare_disease_bot/rare_info_list.txt')

    await expect(plugin.load(`${registryPath}?raw&inline`)).resolves.toBeNull()
  })
})
