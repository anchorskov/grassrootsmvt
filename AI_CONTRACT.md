# AI Contract - GrassrootsMVT.org Site

## Purpose
This contract defines the initial toolchain and guardrails for the grassrootsmvt.org site so day-to-day development stays consistent and avoids drift.

## Scope
- Target: grassrootsmvt.org
- Hosting: Cloudflare (via Wrangler workflow already used in this repo)
- Frontend: vanilla JavaScript (no framework), HTML, CSS
- Build: minimal build tooling for local dev and production bundling

## Decisions Locked In
- Keep the site framework-free (vanilla JS only).
- Use utility CSS via UnoCSS plus a small token system (Open Props) and a reset.
- Prefer small, dependency-light libraries and static assets.
- Use Cloudflare tooling for deploys to match existing infra.

## Selected Tools
### Core tooling
- Vite (dev server + build)
- Wrangler (deploy to Cloudflare)

### Styling
- UnoCSS (utility-first CSS)
- Open Props (design tokens)
- modern-css-reset

### Linting and formatting
- ESLint
- Prettier

### Git hygiene (optional but preferred)
- Husky
- lint-staged

### Testing
- Vitest (unit)
- Playwright (e2e)

### UI assets
- Lucide icons (SVG)
- Fontsource (self-hosted fonts)

## Drift Control
- Any change to this tool list or architecture must be reflected here and in README.md.
- If a change is needed, update this file first, then implement the change.

## Start-of-Work Ritual
Read this contract at the start of every session:

```bash
./scripts/read_contract.sh
```
