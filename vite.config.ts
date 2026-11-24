import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    // 게임(index.html)과 문구 편집기(editor.html) 두 페이지
    rollupOptions: { input: { main: 'index.html', editor: 'editor.html' } },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
