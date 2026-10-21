# EduSync

EduSync separates the Platform control plane from each school’s operational system. The Platform API owns tenant provisioning and operator access; School API provisioning is a private service-to-service operation.

## Local development

Prerequisites: Node.js 24, pnpm 12, and Docker Desktop (or Docker Engine with Compose).

1. Copy `.env.example` to `.env` without replacing an existing file. Set distinct random values for `PLATFORM_AUTH_SECRET` and `SCHOOL_AUTH_SECRET` (at least 32 characters) and `SCHOOL_PROVISIONING_SECRET` (at least 32 characters). Set a private `PLATFORM_BOOTSTRAP_PASSWORD` of at least 12 characters. These values are for local development only; do not use them in production. `.env` is not a frontend configuration file: only `VITE_*` values are exposed to browser code.
2. Install workspace dependencies and start the local PostgreSQL databases:

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

   The local URLs are `http://localhost:4001` (Platform API), `http://localhost:4002` (School API), `http://localhost:5174` (Platform web app), and `http://localhost:5175` (School web app). To start only the Platform web app, run `pnpm dev:web`; to start only the School web app, run `pnpm dev:school-web`. The Platform web app reads `VITE_PLATFORM_API_URL` from the environment (default `http://localhost:4001`); only `VITE_*` values are exposed to browser code. Public routes are `/sign-in`, `/forgot-password`, and `/invite/:token`; every other path is the authenticated Platform shell (overview, tenants, operators), with management controls limited to Platform Admins.

### School web app

`apps/school-web` is a separate frontend for each school’s own operational panel. It talks only to the School API (`VITE_SCHOOL_API_URL`, default `http://localhost:4002`) and shares no origin or session with the Platform web app, so `SCHOOL_TRUSTED_ORIGINS` must list its origin (`http://localhost:5175` locally). Public route: `/sign-in`. Every other path is the authenticated School shell: dashboard, students, classes, and academic years. School admins (`school_admin`) can create, update, and delete records; School staff (`school_staff`) get read-only access. Students carry their class and academic year through an enrollment record, so at least one class and one academic year must exist before a student can be registered.

5. To create the first local Platform Admin, set `PLATFORM_BOOTSTRAP_ENABLED=true` in the private `.env`, then run:

   ```bash
   pnpm --filter @edusync/platform-api db:seed
   ```

   The bootstrap also requires `NODE_ENV=development`. It creates a new account only and refuses to modify or promote an existing account with the configured email. Turn `PLATFORM_BOOTSTRAP_ENABLED` back to `false` after use. Never use this bootstrap path in production.

### Platform operator invitations

Only Platform Admins can manage Platform operators; School users and credentials stay in the separate School API/database. Platform Admins manage operators from the web app's Operators page: invite, resend, revoke, change roles, and enable or disable operators. Invitees receive a single-use link, valid for 48 hours, and set their own password (12–128 characters). A read-only operator can view Platform tenants and operators but cannot make changes. Changes to roles and disabling an operator invalidate their active Platform sessions. The final active Platform Admin cannot be downgraded or disabled.

To send invitations, configure the optional variables in the private `.env`: `PLATFORM_SMTP_HOST`, `PLATFORM_SMTP_PORT`, `PLATFORM_SMTP_SECURE=true`, `PLATFORM_SMTP_USER`, `PLATFORM_SMTP_PASSWORD`, `PLATFORM_EMAIL_FROM`, and `PLATFORM_PUBLIC_URL`. The sender address is restricted to `hi.edusync@gmail.com`; use a Gmail App Password rather than the Gmail account password. Keep all SMTP credentials private and never place them in `VITE_*` variables or browser code. `PLATFORM_PUBLIC_URL` must be HTTPS outside local development. Without working SMTP configuration, an invitation is still created but marked **Delivery failed** so a Platform Admin can retry it from the operator page. Resending rotates the token, invalidating the prior link, and starts a new 48-hour period. Never send a live email during development verification unless private credentials have been configured and a live test is explicitly intended.

Apply Platform migrations with `pnpm --filter @edusync/platform-api db:migrate` after configuring the local Platform database. Migration `004_operator_email_normalization.sql` adds a normalized-email uniqueness index and will stop if existing Platform accounts contain duplicate normalized email addresses; resolve those identities deliberately, then rerun migration. The routes normalize submitted email addresses before storage and enforce uniqueness against accounts and active invitations.

Tenant provisioning creates the School tenant and organization. **School admin account activation is not implemented yet**: the UI reports this as pending, and the listed admin contact cannot sign in until a separate activation flow is built. Do not send a School password or reusable activation credential through the Platform provisioning API.
