# EduSync

Platform manajemen sekolah multi-tenant (yayasan dengan banyak unit sekolah). Rancangan lengkap ada di `Planning/09-rebuild-blueprint.md`.

## Prasyarat

Node 26, pnpm 12, Docker.

## Mulai

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:migrate
pnpm dev          # API di http://localhost:4000, dokumentasi di /docs
pnpm test
```

## Struktur

- `apps/api` Fastify + Zod. OpenAPI dibuat otomatis dari skema route.
- `packages/db` skema Drizzle, migrasi, kebijakan RLS, `withTenant()`.

## Isolasi tenant

Request tenant memakai peran `edusync_app` (tunduk pada RLS) dan `withTenant(db, schoolIds, fn)`. Peran `edusync_platform` melewati RLS dan hanya untuk konsol platform dan webhook.
