import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'url';

// base: './' + viteSingleFile() → 모든 CSS, JS, 에셋이 단 1개의 index.html 파일 안에 인라인 번들링됨
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: {
      mqtt: fileURLToPath(new URL('./node_modules/mqtt/dist/mqtt.esm.js', import.meta.url)),
    },
  },
  build: {
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
  },
});
