import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Semua tes memakai satu database bersama, dan beberapa mengubah pengaturan global (mis. penyedia pembayaran
    // di platform_setting). Berkas dijalankan satu per satu supaya tidak saling mengganggu.
    fileParallelism: false,
    // Disk dev bisa lambat (mis. setelah Postgres pulih dari crash); hook awal/akhir membuat banyak baris.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
