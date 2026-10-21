import { Pool } from 'pg';

const connectionString = process.env.PLATFORM_DATABASE_URL;
if (!connectionString) throw new Error('PLATFORM_DATABASE_URL is required');

export const platformDbPool = new Pool({ connectionString });
