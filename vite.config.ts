import { defineConfig } from 'vite'

export default defineConfig({
  base: '/cowork-committee-decisions-demo/',
  publicDir: 'content',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
