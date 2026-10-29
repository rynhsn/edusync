import { setupJobs } from './setup';

const url = process.env.DATABASE_JOBS_URL ?? process.env.DATABASE_OWNER_URL;
if (!url) throw new Error('DATABASE_JOBS_URL atau DATABASE_OWNER_URL wajib diisi');

await setupJobs(url);
console.log('Antrean pekerjaan siap');
