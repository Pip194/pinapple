# PINAPPLE

A school-focused student portal being developed for the GSIS Ooty student community.

**Version 1 target:** 31 December 2026  
**Access model:** Restricted student access  
**Design:** Premium dark theme

## Current stack
- React 18 + Vite 6
- Node.js API
- PostgreSQL (Neon Free plan planned)
- bcrypt password hashing and database-backed sessions
- GitHub for source control and CI
- Render for frontend and API hosting

## Database setup
1. Create a free PostgreSQL project at https://neon.tech/.
2. Copy the Neon connection string and add it to the Render `pinapple-api` service as the secret environment variable `DATABASE_URL`.
3. Set `FRONTEND_ORIGIN` to the exact public URL of the PINAPPLE frontend.
4. Redeploy the API. On startup, it creates the required PostgreSQL tables and indexes automatically.
5. Confirm the API health endpoint reports `"database":"connected"`.

Never commit the Neon connection string or any student records to GitHub. The database schema is in `db/schema.sql` and is also applied by the API at startup.

## Authentication foundation
- Student sign-in is checked against PostgreSQL.
- Passwords are verified using bcrypt hashes; plaintext passwords are never stored.
- Sessions use random opaque tokens stored only as SHA-256 hashes in PostgreSQL and delivered in HttpOnly, Secure cookies.
- Admin directory access is checked on the server, not just hidden in the frontend.
- The API currently has no public self-registration route. Student records and initial account activation must be provisioned through a secure, school-approved admin workflow before real student sign-in is enabled.

## Current limitations
- The database schema and authentication API are implemented, but no Neon database is connected until its connection string is added in Render.
- No real student records or passwords have been imported.
- The frontend sign-in screen still needs to be connected to these API routes.
- Messaging, moderation and analytics are not yet backed by PostgreSQL.

Use synthetic accounts during development. Do not commit secrets, credentials or student records to Git.

## Run locally
```bash
npm install
npm run dev
```

## Production build
```bash
npm run build
```

## Render
The repository includes a Render blueprint in `render.yaml`. The API requires `DATABASE_URL` and the frontend origin to be configured in the Render dashboard.

## Product and release documentation
- [Version 1 product scope](docs/PRODUCT_SCOPE.md)
- [Week 1 foundation checklist](docs/WEEK_1_CHECKLIST.md)

Third-party services are opened through their official websites. PINAPPLE does not proxy, mirror or bypass their access controls. Any network security testing must be explicitly approved and performed in a controlled test environment.
