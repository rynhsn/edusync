import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Dispatcher melayani semua sekolah yang punya pesan antre; file tes paralel saling mengganggu lewat DB yang sama.
    fileParallelism: false,
    setupFiles: ['./src/test-env.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
