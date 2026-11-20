# PINAPPLE — Product Scope (Version 1)

**Target release:** 31 December 2026  
**Audience:** GSIS Ooty student community  
**Access model:** Restricted student portal  
**Release priority:** Maximum useful features, with security and reliability gates  
**Design direction:** Premium dark theme  
**Current stack:** React 18 + Vite 6 + Lucide, GitHub, Render

## Product goal

PINAPPLE is a school-focused portal that brings student resources, official third-party destinations, community features and approved administrative tools into one consistent interface.

PINAPPLE is a portal and directory. It does not clone, proxy, mirror or bypass third-party services.

## Access and roles

- **Logged-out visitor:** sees only the sign-in / access information needed to enter the portal.
- **Student:** can access student portal areas after successful server-side authentication.
- **Administrator:** receives separately authorised management and moderation capabilities.
- **Development:** use synthetic student records only. Do not put real student credentials or personal information into the prototype.

A four-digit roll number is an identifier, not a secret. Authentication must also require a password or approved second factor. Roll numbers must be unique within the school cohort and must never be treated as sufficient proof of identity.

## Version 1 modules

1. **Home dashboard:** personalised shortcuts, announcements and study links.
2. **Games catalogue:** searchable directory of legitimate official game/platform destinations.
3. **Social catalogue:** searchable directory of official social/community services.
4. **Media catalogue:** discovery/watchlist metadata from sources whose terms permit the intended use; no unauthorised streaming or content hosting.
5. **Study space:** Google Classroom shortcut and curated study resources.
6. **Messaging:** authenticated student-to-student messaging, with reporting, blocking, rate limits and moderation.
7. **Admin:** role-protected account management, moderation queue and privacy-conscious aggregate analytics.
8. **Security testing:** separate, documented test dashboard for explicitly approved tests against isolated lab assets only.

## Security and privacy requirements

- Server-side authorisation on every protected API route; hiding a frontend page is not access control.
- Passwords stored only as strong salted hashes using a recognised password-hashing library.
- Secure, HTTP-only, SameSite cookies; HTTPS in production; CSRF protection where applicable.
- Login throttling, generic authentication errors, session expiry and session revocation.
- Admin accounts and permissions separated from student accounts.
- Collect the minimum data needed; define retention and deletion rules before real student use.
- Never commit secrets, credentials, student lists or production data to Git.
- Security testing requires written approval, a defined scope, test accounts and an isolated environment. No covert bypassing of live school network controls.

## Release gates

PINAPPLE V1 is not ready for real student use until:
- Authentication and role checks are enforced by the backend.
- Data is stored in a persistent database with a tested backup/restore approach.
- Messaging has moderation and abuse-reporting controls.
- Admin actions are permission-checked and auditable.
- Privacy, school approval and deployment configuration have been reviewed.
- Critical/high-severity security issues are fixed.
- The production build and core user journeys pass testing.
