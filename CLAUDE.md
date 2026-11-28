# CLAUDE.md — Project conventions

Read `AGENTS.md`, `README.md` and relevant `docs/` before writing code. When the code and the docs disagree, ask instead of guessing.

## Stack
- Backend: Node.js 20.19+ or 22.13+ (required by TypeORM 1.x), Express 5, ES Modules (`"type": "module"`), PostgreSQL.
- Frontend: React + Vite + TypeScript, Tailwind v4, shadcn/ui. Import via the `@/` alias.

## Backend rules
- Layered structure: `app.js` → `routes/` → `validators/` → `controllers/` → `services/` → `repositories/` → `db/` (details in `docs/ARCHITECTURE.md`, section "Backend layering").
  - `app.js`: the only entry point. `createApp()` registers every middleware and router; `startServer()` listens, runs background jobs and handles shutdown, and runs only when started with `node src/app.js`.
  - `routes/`: only declare the path + middleware chain (signature check, body parser, auth, limiter), then the route's validator, then the controller. No inline handlers, no zod schemas.
  - `validators/`: the zod schema for every route input, one file per feature (`validators/<feature>/<feature>.validator.js`), each export a middleware built with `validate()` from `validators/validate.js`.
  - `controllers/`: read `req` (already validated), call a service, pick the status code and send `res`. No business logic, no access to `repositories/` or `db/`.
  - `services/`: business logic and transactions. Knows nothing about `req`/`res`. Never touches the database directly: no import from `db/`, no `.query()`. It calls repository functions, and opens a transaction with `withTransaction` from `repositories/database.js`, passing the `client` to each repository call.
  - `repositories/`: every query, one file per table. A repository reaches the database only through `config/database.js` (`query()`, `withTransaction()`, `getRepository(Model)`, `transaction()`), never `db/pool.js` or `db/dataSource.js`. `repositories/<feature>/<table>.repository.js` holds all the methods for that table (e.g. `repositories/orders/order.repository.js` for `orders`). `shopId` comes first, an optional transaction `client` last.
  - `models/`: the shape of each table (TypeORM entity schema), one per table, e.g. `models/orders/Order.js`. No queries.
  - `db/`: infrastructure behind `config/database.js` (`pool.js`, `dataSource.js`, `migrate.js`, `seed.js`, `migrations/`).
  - Feature folders: inside each layer, files live in one folder per feature, e.g. `routes/<feature>/<name>.js` ↔ `controllers/<feature>/<name>.controller.js` ↔ `services/<feature>/<name>.service.js` ↔ `repositories/<feature>/<table>.repository.js` ↔ `models/<feature>/<Model>.js`. Don't add files directly under a layer root. The feature map and the exceptions (`validators/validate.js`; `models/index.js`; `repositories/guard.js`, `repositories/database.js`; everything in `db/`) are in `docs/ARCHITECTURE.md`, section "Feature folders".
- Database access: repositories use `pg` (`db/pool.js`). A repository method may use TypeORM through the entity schemas in `models/` and `getRepository(Model)` / `transaction()` from `config/database.js` (as `repositories/auth/user.repository.js` does), but only when it does not need to share a transaction with `pg` code (order status + ledger + stock, assistant approve/undo, `createAlert({ client })`). Schema changes are SQL migrations in `db/migrations/`; update the matching model in the same PR. Never enable `synchronize`. Details in `docs/ARCHITECTURE.md`, section "Models (TypeORM)".
- Validate every input with `zod`: route input in `validators/`, AI tool input in the tool's own schema.
- Express 5 catches errors from async handlers, so don't wrap each route in try/catch. Throw `appError('CODE', message)` from `errors/index.js`; the status comes from the catalog in `errors/codes.js` (add a new code there first). `errorHandler` turns every other error (database, body parser, unknown) into the same JSON through `toAppError()`. See `docs/ARCHITECTURE.md`, section "Errors".
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
