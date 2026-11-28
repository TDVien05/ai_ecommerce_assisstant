# CLAUDE.md — Project conventions

Read `AGENTS.md`, `README.md` and relevant `docs/` before writing code. When the code and the docs disagree, ask instead of guessing.

## Stack
- Backend: Node.js 18+, Express 5, ES Modules (`"type": "module"`), PostgreSQL.
- Frontend: React + Vite + TypeScript, Tailwind v4, shadcn/ui. Import via the `@/` alias.

## Backend rules
- Layered structure: `routes/` → `controllers/` → `services/` → `db/` (details in `docs/ARCHITECTURE.md`, section "Backend layering").
  - `routes/`: only declare the path + middleware chain (verify, body parser, `validate`) and point to a controller. No inline handlers.
  - `controllers/`: read `req` (already validated), call a service, pick the status code and send `res`. No business logic, no access to `db/`.
  - `services/`: business logic and transactions. Knows nothing about `req`/`res`.
  - Naming: `routes/<name>.js` ↔ `controllers/<name>.controller.js` ↔ `services/<name>.service.js`.
- Validate every input (body, query, AI tool input) with `zod`.
- Express 5 catches errors from async handlers, so don't wrap each route in try/catch. Throw errors with `status` + `code` and let `errorHandler` return JSON.
- Webhooks: verify the signature/API key **before** parsing or processing. The Messenger route must keep the raw body.
- Money: integer VND (`BIGINT` in the DB, `number` in JS). Never use floats.
- Changing an order's status + writing the ledger + decrementing stock must happen in **one DB transaction**.
- Never log tokens, app secrets, API keys, or customers' full phone numbers/addresses.
- Never hardcode secrets. All config comes from `process.env` via `src/config/env.js` (validated with zod at startup).

## AI rules
- The LLM must never calculate prices or confirm payments itself. See `docs/AI_AGENT.md`.
- Never add a tool that lets the LLM move an order to `PAID`.

## Frontend rules
- Before creating, changing or removing UI in `client/`, read `docs/design-system/AGENTS.md`, `docs/design-system/README.md`, then `docs/design-system/COMPONENTS.md` in full. Follow `AGENTS.md` for the mandatory design and verification rules.
- Build with the existing Flowy theme and components and shadcn components. Do not introduce new design tokens or change the theme without agreement from the UI owner; propose missing design-system components as specified in `AGENTS.md`.
- Prefer existing shadcn components (`npx shadcn@latest add <name>`) over writing your own.
- Call the API through a single client, `src/lib/api.ts`.
- Money formatting: `new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })`.

## Git
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`…
- Every PR is tied to a milestone in `docs/ROADMAP.md`.
