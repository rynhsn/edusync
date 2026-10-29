import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app';
import { loadEnv } from '../src/env';

/** Tulis spesifikasi OpenAPI ke packages/contracts agar tipe klien web selalu sama dengan API. */
const app = await buildApp(loadEnv());
await app.ready();
const out = fileURLToPath(new URL('../../../packages/contracts/openapi.json', import.meta.url));
writeFileSync(out, `${JSON.stringify(app.swagger(), null, 2)}\n`);
await app.close();
console.log(`OpenAPI ditulis ke ${out}`);
