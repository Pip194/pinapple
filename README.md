# PINAPPLE

A school-focused student portal being developed for the GSIS Ooty student community.

**Version 1 target:** 31 December 2026  
**Access model:** Restricted student access  
**Design:** Premium dark theme

## Current stack
- React 18 + Vite 6
- Node.js API
- PostgreSQL (Neon Free)
- bcrypt password hashing and database-backed sessions
- GitHub for source control and CI
- Render for frontend and API hosting

## Database setup
1. Create a free PostgreSQL project at https://neon.tech/.
2. Copy the Neon connection string and add it to the Render `pinapple-api` service as the secret environment variable `DATABASE_URL`.
3. Set `FRONTEND_ORIGIN` to the exact public URL of the PINAPPLE frontend.
4. Set a long, random `PINAPPLE_BOOTSTRAP_KEY` in the API service environment. Keep it private.
5. Redeploy the API. On startup, it creates the required PostgreSQL tables and indexes automatically.
6. Confirm the API health endpoint reports `"database":"connected"`.

Never commit the Neon connection string, bootstrap key, invitation codes or student records to GitHub. The schema is in `db/schema.sql` and is also applied by the API at startup.

## First student setup
After the database is connected and the API is healthy:
1. Open `https://pinapple.onrender.com/setup.html`.
2. Enter the one-time bootstrap key and submit the initial roster as JSON. Each record has `rollNumber`, `fullName` and `role` (`admin` or `student`). The endpoint accepts up to 700 records and can run only while the students table is empty.
3. Save the invitation codes shown on screen securely. They are displayed only once and expire after seven days.
4. Remove `PINAPPLE_BOOTSTRAP_KEY` from Render after the initial import, then redeploy the API.
5. Give each student their own invitation code. They open `https://pinapple.onrender.com/activate.html`, enter their roll number and invitation code, and create their own strong password.

The bootstrap route is one-time and does not accept password values. Passwords are created by students during activation and stored only as bcrypt hashes.

## Authentication
- Student sign-in is checked against PostgreSQL.
- Passwords are verified using bcrypt hashes; plaintext passwords are never stored.
- Sessions use random opaque tokens stored only as SHA-256 hashes in PostgreSQL and delivered in HttpOnly, Secure cookies.
- Admin directory access is checked on the server, not just hidden in the frontend.
- Public self-registration is disabled. Accounts are created only through the protected initial bootstrap and invitation flow.

## Current limitations
- The database schema and authentication API are implemented, but no Neon database is connected until its connection string is added in Render.
- No real student records or passwords have been imported.
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
The repository includes a Render blueprint in `render.yaml`. The API requires `DATABASE_URL`, `PINAPPLE_BOOTSTRAP_KEY` and the frontend origin to be configured in the Render dashboard.

## Product and release documentation
- [Version 1 product scope](docs/PRODUCT_SCOPE.md)
- [Week 1 foundation checklist](docs/WEEK_1_CHECKLIST.md)

Third-party services are opened through their official websites. PINAPPLE does not proxy, mirror or bypass their access controls. Any network security testing must be explicitly approved and performed in a controlled test environment.
