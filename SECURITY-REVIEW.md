# Security review

Review date: 2026-11-07

## Scope

Review focused on risks relevant to publishing this project publicly and on the
backend functionality that a GitHub Pages deployment would not host. This is a
point-in-time review, not a guarantee that the application is free of
vulnerabilities.

## Findings

| # | Severity | File | Lines | Finding | Confidence |
|---|---|---|---|---|---|
| 1 | HIGH | `.env` | 1-16 | The tracked environment file contains live-looking credentials for Neon, ImageKit, and Gemini. Removing it from the next build or commit does not remove copies from the repository history. | 10/10 |
| 2 | HIGH | `server/neonAuth.js`; `server/index.js` | 15-18, 72-80; 277-295, 456-468 | Registration does not verify email ownership before account creation, while account role assignment grants administrator privileges based on a configured email address. If that address is not already registered, an unauthenticated person could register it and receive admin access. This affects the Express backend when deployed, not GitHub Pages by itself. | 8/10 |

## Recommended actions

1. Revoke and rotate the credentials exposed through `.env`, including database,
   ImageKit, and Gemini credentials. Do not copy their values into source,
   frontend variables, or this report.
2. Stop tracking `.env` and ensure it is ignored. If the repository is public
   or has been shared, consider removing the exposed values from Git history;
   coordinate that history rewrite with collaborators.
3. Grant administrator privileges only through a trusted provisioning path.
   Verify email ownership before granting any privileges based on an email
   address, and do not treat an unverified registration as an administrator.
4. For GitHub Pages, publish only the built static frontend. Host the Express
   API separately and configure the frontend to use that API; Pages cannot run
   the app's `/api` endpoints, database access, uploads, or Gemini translation.

## Deployment note

Vite's normal build does not publish the root `.env` as a frontend asset, but
that does not protect a tracked file or erase its repository history. A
Pages-only deployment can serve the static pages, but backend-dependent
features require a separately hosted API.
