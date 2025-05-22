import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist-react',
    chunkSizeWarningLimit: 1000, // kB 단위, 예: 1000kB (1MB)로 상향
  },
  server:{
    port: 5123,
    strictPort: true,
  }
})
