# Week 1 — Foundation and UI Audit

**Dates:** 20–26 November 2026  
**Branch:** `week-1/foundation`  
**Tracking:** GitHub issue #1

## Confirmed decisions

- Audience: GSIS Ooty students.
- Access: restricted.
- Release priority: maximum useful features by 31 December 2026.
- Design: existing premium dark theme.
- Stack: GitHub + Render; React/Vite frontend.

## Day-by-day plan

### Day 1 — Repository baseline
- [x] Inspect current repository tree and latest commit.
- [x] Confirm existing React/Vite frontend and Render static-site blueprint.
- [x] Confirm GitHub Actions frontend build workflow.
- [x] Create a dedicated Week 1 branch and tracking issue.
- [x] Record product scope and release security gates.
- [ ] Run the project locally on the developer Chromebook/computer.
- [ ] Confirm the current production build succeeds from a clean install.

### Day 2 — UI and navigation audit
- [ ] Check every sidebar destination and home shortcut.
- [ ] Test mobile navigation open/close and scrim behaviour.
- [ ] Test catalogue search and empty results.
- [ ] Verify external links open safely and point to official services.
- [ ] Check keyboard-only navigation, visible focus and reduced motion.
- [ ] Record bugs with reproduction steps.

### Day 3 — Restricted-access UX
- [ ] Design logged-out and authenticated navigation states.
- [ ] Clearly distinguish demo placeholders from live features.
- [ ] Keep student-only navigation unavailable to logged-out users.
- [ ] Do not treat frontend gating as a security boundary; backend authorisation is mandatory.

### Day 4 — Catalogue and dashboard polish
- [ ] Improve empty states and item descriptions.
- [ ] Add the missing requested catalogue entries only after verifying official destinations.
- [ ] Ensure media catalogue uses lawful metadata/discovery sources, not unauthorised streams.
- [ ] Check responsive cards and accessibility.

### Day 5 — Deployment readiness
- [ ] Run clean dependency installation and production build.
- [ ] Review Render headers and static-site configuration.
- [ ] Connect the repository to Render and verify HTTPS deployment.
- [ ] Verify the deployed build on Chromebook and mobile.

### Day 6–7 — QA and weekly review
- [ ] Fix launch-blocking UI bugs.
- [ ] Confirm GitHub Actions passes on the Week 1 branch.
- [ ] Update README with accurate current status.
- [ ] Close completed issue checklist items and list remaining blockers.

## Baseline findings

- Existing frontend: React 18, Vite 6, Lucide icons.
- Existing UI includes Home, Game zone, Social, Watchlist, Study space, Messages and Admin preview.
- Existing sign-in is a client-side preview only.
- Messaging is local browser state only.
- Admin metrics are placeholders.
- Most games/social entries are official external links.
- Render config describes a static site publishing `dist`.
- GitHub Actions has one successful historical frontend build run (10 November 2026); a fresh run is still required.

## Week 1 done means

- A repeatable local build works.
- The UI has been audited on desktop and Chromebook/mobile widths.
- The logged-out experience is clear and student-only routes are marked for backend enforcement.
- A Render deployment is verified, or the exact blocker is documented.
- No real student data or passwords are collected.
