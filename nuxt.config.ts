import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const rareInfoListPath = fileURLToPath(
  new URL('./rare_disease_bot/rare_info_list.txt', import.meta.url)
)

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  app: {
    head: {
      title: '一切开源儿',
      titleTemplate: '%s - 一切开源儿',
      htmlAttrs: { lang: 'zh-CN' },
    },
  },
  devtools: { enabled: true },

  routeRules: {
    // Disable prerendering since we need database connection at runtime
    '/': { ssr: true },
  },

  modules: ['@nuxtjs/supabase'],

  supabase: {
    redirect: false,
  },

  compatibilityDate: '2025-11-30',

  nitro: {
    rollupConfig: {
      plugins: [
        {
          name: 'rare-info-list-raw-loader',
          async load(id) {
            const queryIndex = id.indexOf('?')
            if (queryIndex === -1) return null

            const pathname = id.slice(0, queryIndex)
            const query = id.slice(queryIndex + 1)
            if (pathname !== rareInfoListPath || query !== 'raw') return null

            const content = await readFile(rareInfoListPath, 'utf8')
            return `export default ${JSON.stringify(content)}`
          },
        },
      ],
    },
  },
})
