# AI Sales Assistant for Facebook Pages

An AI assistant that helps shop owners sell through Facebook Messenger:

1. A customer messages the Page → the AI replies automatically (product advice, prices, stock).
2. The AI collects the customer's details and **creates the order itself**, then sends a confirmation + a payment QR code back on Messenger.
3. **Anti-scam:** an order is only confirmed when the bank webhook (SePay) reports that the money has arrived in the account. The system never trusts screenshots of a transfer.
4. Every paid order is written to the income/expense ledger → a **finance assistant** for the shop owner (revenue, profit, best sellers, natural-language Q&A).

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Node.js 18+, Express 5 |
| Frontend (shop owner dashboard) | React + Vite + TypeScript, Tailwind CSS v4, shadcn/ui |
| Database | PostgreSQL |
| Chat channel | Meta Messenger Platform (Webhook + Send API) |
| Payment verification | SePay Webhook (balance changes) |
| AI | LLM with function calling (provider configured via env) |

## Documentation

| File | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architecture, backend layering, main flows (sequence diagrams) |
| [docs/DATABASE.md](docs/DATABASE.md) | Data schema, order states |
| [docs/API.md](docs/API.md) | Webhooks + REST API for the dashboard |
| [docs/AI_AGENT.md](docs/AI_AGENT.md) | System prompt, AI tools, guardrails |
| [docs/PAYMENT_ANTI_SCAM.md](docs/PAYMENT_ANTI_SCAM.md) | Bank transfer verification rules |
| [docs/SETUP.md](docs/SETUP.md) | Local setup, environment variables, Facebook App and SePay configuration |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Milestones and task checklists |
| [CLAUDE.md](CLAUDE.md) | Coding conventions (for AI coding assistants and the team) |

## Repo structure (planned)

```
sales-assistant/
├── server/                 # Express API
│   ├── src/
│   │   ├── routes/         # path + middleware: webhook.messenger, webhook.sepay, orders, products, finance
│   │   ├── controllers/    # req/res: *.controller.js, one controller per route
│   │   ├── services/       # business logic: messenger, ai, order, payment, finance
│   │   ├── middlewares/    # verifyFbSignature, verifySepayKey, validate, errorHandler
│   │   ├── db/             # pool, migrate, migrations
│   │   ├── config/         # env.js (validates process.env)
│   │   ├── lib/            # httpError, logger
│   │   ├── app.js          # wires middleware + mounts routes
│   │   └── index.js        # listen + graceful shutdown
│   └── .env.example
├── client/                 # React Vite + shadcn dashboard
│   └── src/{pages,components/ui,lib}
├── docs/
└── README.md
```

## Quick start

See [docs/SETUP.md](docs/SETUP.md) for details.

### Docker (PostgreSQL + server + client, with hot reload)

```bash
cp server/.env.example server/.env   # fill in secrets if needed
docker compose up --build            # client :5173, server :4000, db :5432
```

The server runs migrations automatically on startup. After changing `package.json`, run `docker compose up --build -V` to reinstall `node_modules` inside the container.

### Without Docker

```bash
# backend
cd server && npm install && npm run dev      # http://localhost:4000

# frontend
cd client && npm install && npm run dev      # http://localhost:5173
```
