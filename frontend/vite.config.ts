import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // aframe ESM 빌드에 named export가 없어 AR.js가 못 쓴다: src/ar/aframeShim.ts 참고
  resolve: { alias: { aframe: fileURLToPath(new URL('./src/ar/aframeShim.ts', import.meta.url)) } },
  // 개발 중에도 쿠키가 같은 출처로 오도록 백엔드(backend/.env PORT=3000)로 프록시. 원칙 5.2
  //   다른 프로젝트가 3000을 쓰면 API_PORT로 바꾼다 (예: API_PORT=3100 npm run dev)
  server: { proxy: { '/api': `http://localhost:${process.env.API_PORT ?? 3000}` } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.tsx'],
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // 제품 코드 제외는 src/ar/ 하나뿐. 나머지는 테스트 자체·보조 파일
      exclude: ['src/ar/**', 'src/test/**', 'src/**/*.test.{ts,tsx}', 'src/**/*.d.ts'],
      thresholds: { lines: 90 },
    },
  },
  // 사전 번들이 aframe를 한 벌 더 넣는 것을 막는다
  optimizeDeps: { exclude: ['@ar-js-org/ar.js'] },
});
