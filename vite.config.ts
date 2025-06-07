import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    visualizer({
      open: false, // 빌드 후 자동으로 분석 리포트 열기
      gzipSize: false, // gzip 압축 크기 표시
      brotliSize: false, // brotli 압축 크기 표시
    })
  ],
  base: './',
  build: {
    outDir: 'dist-react',
    chunkSizeWarningLimit: 700, // kB 단위, 예: 1000kB (1MB)로 상향
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // node_modules에 있는 모든 라이브러리를 'vendor' 청크로 분리
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
  },
  server:{
    port: 5123,
    strictPort: true,
  }
})
