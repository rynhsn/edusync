import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { setupFiles: ['./src/test-env.ts'], testTimeout: 20_000 } });
