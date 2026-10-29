import { describe, expect, it } from 'vitest';
import { schoolOpenApi, schoolOpenApiJson } from './openapi.js';

describe('School OpenAPI document', () => {
  it('documents the live private provisioning operation as server-to-server only', () => {
    const operation = schoolOpenApi.paths['/internal/provisioning/tenants']?.post;
    expect(operation).toBeDefined();
    expect(operation?.tags).toContain('Internal · server-to-server');
    expect(operation?.security).toEqual([{ provisioningBearer: [] }]);
    expect(operation?.description).toContain('Never call from a browser');
    expect(operation?.requestBody).toBeDefined();
  });

  it('does not publish a secret or expose activation tokens in provisioning', () => {
    expect(() => JSON.parse(schoolOpenApiJson)).not.toThrow();
    expect(schoolOpenApiJson).not.toContain('SCHOOL_PROVISIONING_SECRET');
    expect(schoolOpenApi.paths['/api/admin-activations/lookup']?.post).toBeDefined();
    expect(schoolOpenApi.paths['/api/admin-activations/accept']?.post).toBeDefined();
    expect('security' in schoolOpenApi.paths['/api/admin-activations/lookup']!.post).toBe(false);
    expect('security' in schoolOpenApi.paths['/api/admin-activations/accept']!.post).toBe(false);
  });

  it('documents every school operation as session-authenticated and tenant-scoped', () => {
    const operations = [
      schoolOpenApi.paths['/api/school/overview']?.get,
      schoolOpenApi.paths['/api/academic-years']?.get,
      schoolOpenApi.paths['/api/academic-years']?.post,
      schoolOpenApi.paths['/api/academic-years/{id}']?.patch,
      schoolOpenApi.paths['/api/classes']?.get,
      schoolOpenApi.paths['/api/classes']?.post,
      schoolOpenApi.paths['/api/classes/{id}']?.patch,
      schoolOpenApi.paths['/api/students']?.get,
      schoolOpenApi.paths['/api/students']?.post,
      schoolOpenApi.paths['/api/students/{id}']?.patch,
      schoolOpenApi.paths['/api/students/{id}']?.delete,
    ];
    for (const operation of operations) {
      expect(operation).toBeDefined();
      expect(operation?.security).toEqual([{ schoolSession: [] }]);
      expect(operation?.responses['401']).toBeDefined();
      expect(operation?.responses['403']).toBeDefined();
    }
    expect(schoolOpenApi.paths['/api/school/overview']?.get?.description).toContain('caller\'s school');
  });

  it('documents the identity operation as session-authenticated for every role', () => {
    const operation = schoolOpenApi.paths['/api/school/me']?.get;
    expect(operation).toBeDefined();
    expect(operation?.security).toEqual([{ schoolSession: [] }]);
    expect(operation?.responses['401']).toBeDefined();
    // Every signed-in member may read their own role, so this operation has no 403.
    const responses: Record<string, unknown> = operation?.responses ?? {};
    expect(responses['403']).toBeUndefined();
    const ref = (operation?.responses['200']?.content?.['application/json']?.schema as { $ref?: string } | undefined)?.$ref;
    expect(ref).toBe('#/components/schemas/SchoolAuthContext');
    expect(schoolOpenApi.components.schemas.SchoolAuthContext).toBeDefined();
  });

  it('publishes a schema for every request body it accepts', () => {
    const bodyOperations = [
      schoolOpenApi.paths['/api/academic-years']?.post,
      schoolOpenApi.paths['/api/academic-years/{id}']?.patch,
      schoolOpenApi.paths['/api/classes']?.post,
      schoolOpenApi.paths['/api/classes/{id}']?.patch,
      schoolOpenApi.paths['/api/students']?.post,
      schoolOpenApi.paths['/api/students/{id}']?.patch,
    ];
    for (const operation of bodyOperations) {
      const schema = operation?.requestBody?.content['application/json']?.schema;
      const ref = (schema as { $ref?: string } | undefined)?.$ref;
      expect(ref).toBeDefined();
      const name = ref?.split('/').pop() ?? '';
      expect(schoolOpenApi.components.schemas[name as keyof typeof schoolOpenApi.components.schemas]).toBeDefined();
    }
  });

  it('confines the service bearer credential to the provisioning operation', () => {
    const bearerOperations = Object.entries(schoolOpenApi.paths).flatMap(([path, item]) =>
      Object.entries(item as Record<string, { security?: { provisioningBearer?: unknown }[] }>)
        .filter(([, operation]) => operation.security?.some((entry) => 'provisioningBearer' in entry))
        .map(([method]) => `${path} ${method}`),
    );
    expect(bearerOperations).toEqual(['/internal/provisioning/tenants post']);
  });
});
