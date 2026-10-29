# EduSync

EduSync separates the Platform control plane from each school’s operational system. The Platform API owns tenant provisioning and operator access; School API provisioning is a private service-to-service operation.

## Repository layout

| Path | Purpose |
| --- | --- |
| `apps/platform-api` | Platform API (Fastify, PostgreSQL, port 4001): operators and invitations, Platform users, tenants, audit logs, account settings. |
| `apps/school-api` | School API (Fastify, separate PostgreSQL, port 4002): academic years, classes, students, enrollments, tenant provisioning, School Admin activation. |
| `apps/web` | Platform web app (React, Vite, Tailwind, port 5174). |
| `apps/school-web` | School web app (React, Vite, Tailwind, port 5175). |
| `packages/contracts` | Zod schemas and types shared by the APIs and web apps. |
| `packages/api-docs` | Serves OpenAPI JSON and HTML docs for each API. |
| `Planning/` | Re-engineering notes for the legacy system. These modules are not implemented yet (see [Roadmap](#roadmap)). |

The Platform and School systems use separate databases, auth secrets, and sessions. They share no origin or cookie.

## Local development

Prerequisites: Node.js 24, pnpm 12, and Docker Desktop (or Docker Engine with Compose).

1. Copy `.env.example` to `.env` without replacing an existing file. Set distinct random values for `PLATFORM_AUTH_SECRET` and `SCHOOL_AUTH_SECRET` (at least 32 characters) and `SCHOOL_PROVISIONING_SECRET` (at least 32 characters). Set a private `PLATFORM_BOOTSTRAP_PASSWORD` of at least 12 characters. These values are for local development only; do not use them in production. `.env` is not a frontend configuration file: only `VITE_*` values are exposed to browser code.
2. Install workspace dependencies and start the local PostgreSQL databases (Platform on port 5433, School on port 5434):

   ```bash
   pnpm install
   docker compose up -d
   ```

3. Apply both database migrations:

   ```bash
   pnpm db:migrate
   ```

4. Start the Platform API, School API, Platform web app, and School web app:

   ```bash
   pnpm dev
   ```

   | Service | URL |
   | --- | --- |
   | Platform API | `http://localhost:4001` |
   | School API | `http://localhost:4002` |
   | Platform web app | `http://localhost:5174` |
   | School web app | `http://localhost:5175` |

   To start only one web app, run `pnpm dev:web` (Platform) or `pnpm dev:school-web` (School). Each API serves its OpenAPI document at `/openapi.json`, interactive docs at `/docs`, and a health check at `/health`.

5. To create the first local Platform Admin, set `PLATFORM_BOOTSTRAP_ENABLED=true` in the private `.env`, then run:

   ```bash
   pnpm --filter @edusync/platform-api db:seed
   ```

   The bootstrap also requires `NODE_ENV=development`. It creates a new account only and refuses to modify or promote an existing account with the configured email. Turn `PLATFORM_BOOTSTRAP_ENABLED` back to `false` after use. Never use this bootstrap path in production.

### Common commands

```bash
pnpm typecheck   # typecheck every workspace package
pnpm test        # run all Vitest suites
pnpm build       # build every package
pnpm db:seed     # run both development seeds (each is gated by its own *_BOOTSTRAP_ENABLED flag)
```

## Platform

### Web app

The Platform web app reads `VITE_PLATFORM_API_URL` (default `http://localhost:4001`). Public routes are `/sign-in`, `/sign-up`, `/forgot-password`, and `/invite/:token`; every other path is the authenticated Platform shell: overview, tenants, operators, audit logs, settings, and API docs. Management controls are limited to Platform Admins.

### Account types

| Role | How it is created | Access |
| --- | --- | --- |
| `platform_admin` | Bootstrap seed or operator invitation | Full management of operators and tenants. |
| `platform_read_only` | Operator invitation | Can view tenants and operators; cannot make changes. |
| `platform_user` | Public self-registration | A customer account that manages only the schools it owns (see `tenant_owners`). |

### Platform operator invitations

Only Platform Admins can manage Platform operators; School users and credentials stay in the separate School API/database. Platform Admins manage operators from the web app’s Operators page: invite, resend, revoke, change roles, and enable or disable operators. Invitees receive a single-use link, valid for 48 hours, and set their own password (12–128 characters). Changes to roles and disabling an operator invalidate their active Platform sessions. The final active Platform Admin cannot be downgraded or disabled.

To send invitations, configure the optional variables in the private `.env`: `PLATFORM_SMTP_HOST`, `PLATFORM_SMTP_PORT`, `PLATFORM_SMTP_SECURE=true`, `PLATFORM_SMTP_USER`, `PLATFORM_SMTP_PASSWORD`, `PLATFORM_EMAIL_FROM`, and `PLATFORM_PUBLIC_URL`. The sender address is restricted to `hi.edusync@gmail.com`; use a Gmail App Password rather than the Gmail account password. Keep all SMTP credentials private and never place them in `VITE_*` variables or browser code. `PLATFORM_PUBLIC_URL` must be HTTPS outside local development. Without working SMTP configuration, an invitation is still created but marked **Delivery failed** so a Platform Admin can retry it from the operator page. Resending rotates the token, invalidating the prior link, and starts a new 48-hour period. Never send a live email during development verification unless private credentials have been configured and a live test is explicitly intended.

### Password reset

`/forgot-password` sends a one-time code (OTP) that is verified before the password can be changed. Reset requests use the same SMTP configuration as invitations.

### Audit logs

Sensitive Platform actions (operator invitations and role changes, tenant creation and status changes, user registration, profile updates) are written to `platform_audit_logs` and shown on the Audit logs page. The School API keeps its own authorization audit log (`school_authz_audit_logs`).

### Migrations

Apply Platform migrations with `pnpm --filter @edusync/platform-api db:migrate` after configuring the local Platform database. Migration `004_operator_email_normalization.sql` adds a normalized-email uniqueness index and will stop if existing Platform accounts contain duplicate normalized email addresses; resolve those identities deliberately, then rerun migration. The routes normalize submitted email addresses before storage and enforce uniqueness against accounts and active invitations.

## Tenants and School provisioning

A tenant moves through these Platform statuses: `provisioning`, `active`, `suspended`, and `provisioning_failed`.

1. A Platform Admin or `platform_user` creates a tenant with the School Admin’s name and email. The Platform API records it and calls the School API’s private `POST /internal/provisioning/tenants` endpoint, authenticated with the shared `SCHOOL_PROVISIONING_SECRET`.
2. The School API creates the School tenant and its organization, and emails the School Admin a single-use activation link (valid for 48 hours). **No School password or reusable credential ever passes through the Platform provisioning API.**
3. The School Admin opens `/activate/:token` on the School web app and sets their own password. Until then the admin contact cannot sign in, and the Platform UI reports activation as pending.
4. If provisioning fails, the tenant is marked `provisioning_failed` and a Platform Admin or the owning `platform_user` can retry it. Active tenants can be suspended or reactivated by a Platform Admin; the change is propagated to the School API.

Activation emails use the optional `SCHOOL_SMTP_HOST`, `SCHOOL_SMTP_PORT`, `SCHOOL_SMTP_SECURE`, `SCHOOL_SMTP_USER`, `SCHOOL_SMTP_PASSWORD`, and `SCHOOL_EMAIL_FROM` variables, falling back to the `PLATFORM_SMTP_*` values. The same sender restriction and App Password guidance as for Platform invitations apply, and `SCHOOL_PUBLIC_URL` must be HTTPS outside local development. Without working SMTP configuration, no email is sent.

## School

### Web app

`apps/school-web` is a separate frontend for each school’s own operational panel. It talks only to the School API (`VITE_SCHOOL_API_URL`, default `http://localhost:4002`) and shares no origin or session with the Platform web app, so `SCHOOL_TRUSTED_ORIGINS` must list its origin (`http://localhost:5175` locally). Public routes are `/sign-in` and `/activate/:token`. Every other path is the authenticated School shell: dashboard, students, classes, and academic years.

| Role | Access |
| --- | --- |
| `school_admin` | Create, update, and delete records. |
| `school_staff` | Read-only. |

Students carry their class and academic year through an enrollment record, so at least one class and one academic year must exist before a student can be registered. Student status is one of `AKTIF`, `LULUS`, `MUTASI`, or `KELUAR`.

### Development bootstrap

Because provisioning creates no user, a fresh development database has no School account to sign in with. Besides going through the activation flow above, you can create one school and its first accounts directly. In the private `.env`, set `NODE_ENV=development`, `SCHOOL_BOOTSTRAP_ENABLED=true`, the `SCHOOL_BOOTSTRAP_*` name, slug, email, and password values (and optionally the staff email and password), then run:

```bash
pnpm --filter @edusync/school-api db:seed
```

Turn `SCHOOL_BOOTSTRAP_ENABLED` back to `false` afterwards. Never use this bootstrap path in production.

## Roadmap

Implemented: tenant provisioning and lifecycle, operator and user management, School Admin activation, and master data for academic years, classes, and students.

Not yet implemented (documented in `Planning/`): RFID and class attendance, grades, non-academic assessments, SPMB online registration, the public school website, role and menu administration, and the remaining master data (teachers, parents, lesson periods, programs).
