import { defineConfig } from 'vite'

export default defineConfig({
  base: '/cowork-cases-demo/',
  publicDir: 'content',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
