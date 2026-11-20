# PINAPPLE

A school-focused student portal being developed for the GSIS Ooty student community.

**Version 1 target:** 31 December 2026  
**Access model:** Restricted student access  
**Design:** Premium dark theme

## Current stack
- React 18 + Vite 6
- Plain CSS
- Lucide icons
- GitHub for source control and CI
- Render Static Site for the frontend

## Run locally
```bash
npm install
npm run dev
```

## Production build
```bash
npm run build
```

## Render frontend deployment
Create a **Static Site** connected to this repository:
- Build command: `npm install && npm run build`
- Publish directory: `dist`

The repository includes a Render blueprint in `render.yaml`.

## Current prototype scope
- Responsive student portal UI
- Games, social, media and study catalogues
- Google Classroom shortcut: https://classroom.google.com/h/st
- Sign-in form layout (client-side preview only)
- Messaging and admin analytics preview screens

## Important: not ready for real student accounts
Authentication is not implemented. The sign-in form does not verify accounts or send credentials to a server. Messaging is local-only and admin statistics are placeholders. Do not enter real passwords or real student information.

Before real student use, PINAPPLE needs server-side authentication and authorisation, secure password hashing, persistent storage, moderation controls, privacy review and school approval. Frontend-only page hiding is not a security boundary.

Use synthetic accounts and test data during development. Do not commit secrets, credentials or student records to Git.

## Product and release documentation
- [Version 1 product scope](docs/PRODUCT_SCOPE.md)
- [Week 1 foundation checklist](docs/WEEK_1_CHECKLIST.md)

Third-party services are opened through their official websites. PINAPPLE does not proxy, mirror or bypass their access controls. Any network security testing must be explicitly approved and performed in a controlled test environment.
