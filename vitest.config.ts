import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  test: {
    // 使用 happy-dom 作为 DOM 环境（比 jsdom 更快）
    environment: 'happy-dom',

    // 测试文件匹配模式
    include: ['**/*.{test,spec}.{js,ts}'],
    exclude: ['**/node_modules/**', '**/.nuxt/**', '**/.output/**', '**/.superpowers/**'],

    // 全局测试设置
    globals: true,

    // 覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        '.nuxt/',
        '.output/',
        '**/*.config.{js,ts}',
        '**/*.d.ts',
        '**/types/**',
        '**/server/articles/**',
        '**/rare_disease_bot/**',
      ],
    },

    // 设置超时时间（毫秒）
    testTimeout: 10000,

    // 设置钩子超时时间
    hookTimeout: 10000,

    // 设置文件路径别名（如果需要）
    alias: {
      '~': new URL('.', import.meta.url).pathname,
      '@': new URL('.', import.meta.url).pathname,
      h3: new URL('./node_modules/.pnpm/h3@1.15.4/node_modules/h3/dist/index.mjs', import.meta.url)
        .pathname,
    },
  },
})
