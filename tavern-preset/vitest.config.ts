import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
    // Anchor vitest's temp build cache inside this repo (`.vitest` is ignored).
    cacheDir: '.vitest',
  },
})
