# OpenLobster Web

The web client of OpenLobster — an AI-native development workspace. Built with
Next.js (App Router) + Tailwind CSS 4 + TypeScript, per `apps/web/DESIGN.md`.

## Prerequisites

- Node.js 20+
- The OpenLobster API (`apps/api`) reachable on `http://127.0.0.1:3000`
  (which needs PostgreSQL + Redis via `docker compose up -d` at the repo root).

## Getting started

```bash
# from the repo root: start infrastructure, then the API and worker
docker compose up -d

# from apps/api
npm run dev        # Express API on :3000

# from apps/web
npm install
npm run dev        # Next.js dev server on :3001
```

Open http://localhost:3001.

The web app never calls the API origin directly: all requests go through a
same-origin rewrite proxy (`/api/v1/*` → `API_PROXY_ORIGIN/v1/*`, see
`next.config.ts`). Override the upstream with `API_PROXY_ORIGIN` if the API
runs elsewhere; this variable is resolved server-side only and is never
exposed to browser code.

## Structure

```
app/                  Routes: landing, signin, signup, workspace, project/[id], settings
components/
  auth/               Shared sign-in/sign-up experience
  brand/              Lobster mark + wordmark
  landing/            Hero demo + navbar
  layout/             Authenticated app shell (sidebar/drawer)
  project/            Chat workspace: sessions, composer, activity panel, diff
  settings/           Account / usage / models / appearance
  ui/                 Buttons, inputs, dialogs, states, badges
lib/
  api/                Typed client mirroring the existing backend contracts
  auth/               Token store, AuthProvider, route guards
  hooks/              useApiQuery (REST), useRunStream (SSE)
  markdown/           Conservative, injection-safe Markdown renderer
  sse/                Fetch-based SSE subscriber with Last-Event-ID replay
```

## Conventions

- Design tokens live in `app/globals.css`; components never hardcode theme
  colors — both dark and light themes are driven by CSS variables.
- Saira is the global UI font; monospace is reserved for code, terminal and
  diff content.
- No emojis in the UI. Icons are inline SVGs (`components/icons.tsx`).
- The frontend consumes only the existing REST/SSE contracts in `apps/api`;
  when a capability is missing upstream it is surfaced as such instead of
  being mocked.
