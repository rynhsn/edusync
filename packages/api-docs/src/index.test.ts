import Fastify from 'fastify';
import { afterAll, describe, expect, it } from 'vitest';
import { registerApiDocs } from './index.js';

const app = Fastify();

await registerApiDocs(app, {
  openapi: '3.0.3',
  info: { title: 'EduSync Test API', version: '0.1.0', description: 'Test API documentation.' },
  tags: [{ name: 'Test', description: 'Test endpoints.' }],
  paths: {
    '/test': {
      post: {
        tags: ['Test'],
        summary: 'Create test item',
        operationId: 'createTestItem',
        requestBody: { required: true },
        responses: { '201': { description: 'Created.' } },
      },
    },
  },
});

afterAll(async () => {
  await app.close();
});

describe('API docs routes', () => {
  it('serves the OpenAPI document as JSON', async () => {
    const response = await app.inject('/openapi.json');

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.json()).toMatchObject({
      openapi: '3.0.3',
      info: { title: 'EduSync Test API' },
      paths: { '/test': { post: { operationId: 'createTestItem' } } },
    });
  });

  it('serves the custom responsive docs interface without Swagger', async () => {
    const response = await app.inject('/docs');

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('<meta name="viewport" content="width=device-width,initial-scale=1">');
    expect(response.body).toContain('EduSync Test API');
    expect(response.body).toContain('/openapi.json');
    expect(response.body).toContain('Create test item');
    expect(response.body).toContain('minmax(0,1fr)');
    expect(response.body).not.toContain('swagger-ui');
  });
});

