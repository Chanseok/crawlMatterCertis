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
          // React 관련 라이브러리를 별도 청크로 분리
          if (id.includes('react') || id.includes('react-dom')) {
            return 'react-vendor';
          }
          
          // 차트 라이브러리를 별도 청크로 분리
          if (id.includes('recharts') || id.includes('d3-')) {
            return 'charts';
          }
          
          // MobX 상태관리 라이브러리를 별도 청크로 분리
          if (id.includes('mobx')) {
            return 'state-management';
          }
          
          // 크롤링 관련 대형 라이브러리들을 별도 청크로 분리
          if (id.includes('playwright') || id.includes('cheerio') || id.includes('axios')) {
            return 'crawler-libs';
          }
          
          // Excel/Office 관련 라이브러리를 별도 청크로 분리
          if (id.includes('exceljs') || id.includes('xlsx')) {
            return 'office-libs';
          }
          
          // 기타 유틸리티 라이브러리들
          if (id.includes('date-fns') || id.includes('nanoid') || id.includes('zod')) {
            return 'utils';
          }
          
          // 나머지 node_modules를 vendor 청크로 분리
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
