import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: '/popis-zarnic/',
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
