import { Pool } from 'pg';

const connectionString = process.env.SCHOOL_DATABASE_URL;
if (!connectionString) throw new Error('SCHOOL_DATABASE_URL is required');

export const schoolDbPool = new Pool({ connectionString });
