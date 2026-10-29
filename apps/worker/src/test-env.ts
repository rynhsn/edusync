try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // Variabel boleh datang dari lingkungan CI.
}
