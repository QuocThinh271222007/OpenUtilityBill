# Third-Party Notices

This file documents every direct (non-transitive) third-party dependency
introduced by the project-foundation task. License information was
verified against each installed package's own `package.json` metadata,
not assumed.

## Backend (`backend/`)

| Package | Version installed | Purpose | Project URL | License |
|---|---|---|---|---|
| express | 4.22.2 | Minimal HTTP framework used for routing and the REST API surface. | https://expressjs.com/ | MIT |
| @types/express | (dev) | TypeScript type definitions for Express. | https://www.npmjs.com/package/@types/express | MIT |
| @types/node | (dev) | TypeScript type definitions for the Node.js runtime. | https://www.npmjs.com/package/@types/node | MIT |
| tsx | 4.23.13 (dev) | Runs TypeScript directly with auto-reload during `npm run dev`, avoiding a manual build step on every change. | https://github.com/privatenumber/tsx | MIT |
| typescript | 5.9.3 (dev) | Static typing and compilation for the backend source. | https://www.typescriptlang.org/ | Apache-2.0 |

## Frontend (`frontend/`)

| Package | Version installed | Purpose | Project URL | License |
|---|---|---|---|---|
| bootstrap | 5.3.8 | CSS component library used for layout and basic UI (badges, container, spacing). Imported as a package, not vendored into source. | https://getbootstrap.com/ | MIT |
| vite | 6.4.3 (dev) | Development server and production bundler for the frontend TypeScript client. | https://vite.dev/ | MIT |
| typescript | 5.9.3 (dev) | Static typing and compilation for the frontend source. | https://www.typescriptlang.org/ | Apache-2.0 |

## Notes

- Only direct dependencies are listed. Transitive dependencies are
  documented by the respective `package-lock.json` files and are not
  duplicated here.
- No dependency is vendored (copied) into this repository's source tree;
  all are installed via `npm install` and excluded from version control
  via `.gitignore` (`node_modules/`).
- A moderate-severity advisory exists in `qs` (a transitive dependency of
  `express` 4.x) at the time of this task
  (GHSA-x5fp-wj9c-mxmx, GHSA-4mjr-xmp4-gh2g). No fix is currently
  available without an Express major-version upgrade, which is out of
  scope for this foundation task. Tracked for a future dependency review.
