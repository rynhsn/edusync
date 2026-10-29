import { buildApp } from './app';
import { loadEnv } from './env';

const env = loadEnv();
const app = await buildApp(env);
await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
