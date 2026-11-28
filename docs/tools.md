# Assistant tools

The tools the owner's chat assistant can call to operate the app. Source of truth is the code: tools are registered in `server/src/services/assistant/agent.js`. Paths below are relative to `server/src/services/assistant/`.

Example requests are in Vietnamese, as the shop owner types them.

## How every tool is bounded

- The shop comes from the signed-in session. No tool accepts a shop id.
- Inputs are validated with strict schemas. The model never writes SQL.
- **Read** tools run immediately and change nothing.
- **Write** tools only create a proposal. Nothing changes until the owner approves the card. Approval runs in one database transaction and is recorded in the action log. Undo is refused if the affected data has changed since.
- A proposal holds at most 20 actions. A bank account change, a customer message and a statement import or undo must each be approved on their own. A statement import is split into batches of up to 20 ledger entries.
- A run has at most 15 tool rounds. Each shop has a daily run limit (`AI_DAILY_RUN_LIMIT`, default 50), counted in memory.
- Figures shown to the owner are built by the server from tool results. Model text that contains numbers or money amounts is replaced with a fixed sentence.

## Summary

| Tool | Type | Approval | Undo |
|---|---|---|---|
| `query_data` | read | no | not needed |
| `get_report` | read | no | not needed |
| `get_summary` | read | no | not needed |
| `list_ledger` | read | no | not needed |
| `get_activity` | read | no | not needed |
| `list_orders` | read | no | not needed |
| `get_order` | read | no | not needed |
| `export_ledger_book` | read | no | not needed |
| `ledger_book` | read | no | not needed |
| `open_page` | read | no | not needed |
| `statement` | read and write | import and undo only | yes |
| `propose_change` | write | always | yes, except sent messages |

## Reading data

### `query_data`
Looks up, filters and aggregates the shop's own records (`tools/query.js`, `query-data.service.js`, `query-entities.js`).

- **Input:** `entity`, `fields` (up to 12), `filters` (up to 10; `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `contains`), `groupBy` (up to 2; day, week or month for dates), `metrics` (`count`, `sum`, `avg`, `min`, `max`), `sort`, `limit` (up to 100, default 50).
- **Entities:** `ledger`, `orders`, `order_items`, `products`, `customers`, `payments` (bank transactions already linked to the shop), `files`, `imports`, `alerts`, `conversations`, `messages`, `todos`.
- **Limits:** read-only transaction with a statement timeout; only listed fields; phone numbers are masked and addresses hidden. Free text from outside sources (such as messages, notes and bank descriptions) is shown to the owner after pattern-based redaction and is not sent to the model.
- **Examples:** "Đơn nào đang chờ thanh toán?", "Doanh thu theo ngày trong tuần này là bao nhiêu đơn?"

### `get_report`
Revenue, expenses, profit and cash flow for a period, with an optional comparison period (`tools/report.js`).

- **Input:** `from`, `to`, optional `compareFrom`, `compareTo`.
- **Limits:** business revenue and expenses count only validly classified entries; cash flow counts all entries. Profit is withheld when entries are unclassified, cost is missing, or a cost of zero needs checking. The report says how many records are affected.
- **Example:** "So sánh lãi tháng này với tháng trước."

### `get_summary`, `list_ledger`, `get_activity`
Earlier ledger tools, still registered (`tools/finance.read.js`).

- `get_summary`: classified revenue and expenses for a period.
- `list_ledger`: entries in a period, optionally income or expense only; returns up to 100 entries, including their notes.
- `get_activity`: counts ledger entries and orders created in a period.
- Both summary and list results state how many entries are unclassified.
- **Examples:** "Khoản chi tuần trước gồm những gì?", "Hôm nay có bao nhiêu giao dịch?"

### `list_orders`, `get_order`
Earlier order tools, still registered (`tools/orders.js`).

- `list_orders`: orders, optionally by status. `get_order`: one order by payment code.
- **Examples:** "Đơn chờ thanh toán", or type an order's payment code.

## Ledger books and navigation

### `export_ledger_book`
Prepares a ledger book for PDF or Excel download (`tools/books.js`).

- **Input:** optional `code` (default `S1a-HKD`), optional `from` and `to` together (default: current month).
- **Limits:** the card carries the server's warnings; some books still lack data sources.
- **Example:** "Xuất mẫu sổ tháng này."

### `ledger_book`
Lists or suggests book templates, previews a book, shows the shop name, prepares a custom column and shows year-to-date business revenue (`tools/books.js`).

- **Input:** `action` (`list`, `suggest`, `preview`, `identity`, `columns`, `threshold`), optional `code`, `from`, `to`, `column`.
- **Limits:** only the shop name is available as business identity (no tax id or address). Custom columns are added by the owner on the Ledger books page and last for that page session. Legal notes are conditional and cite their source; the tool does not decide obligations.
- **Examples:** "Có những mẫu sổ nào?", "Doanh thu năm nay so với ngưỡng thế nào?"

### `open_page`
Returns a button that opens a page with filters applied (`tools/page.js`). It never navigates by itself.

- **Pages:** `ledger` (period, type, tab, book code), `orders` (status, search text), `reports` (period), `fraud`, `messenger`, `sources`, `settings`.
- **Example:** "Mở trang đơn hàng đang giao."

## Bank statements

### `statement`
`tools/statement.js`.

| Action | Type | What it does |
|---|---|---|
| `history` | read | Lists uploaded files and imports |
| `preview` | read | Shows the valid rows of a file |
| `reconcile` | read | Compares rows with the ledger by date, direction and amount |
| `import` | write | Proposes ledger entries from a file |
| `undo` | write | Proposes undoing one import |

- Attaching a file in chat also starts an import proposal.
- **Limits:** UTF-8 CSV or XLSX, up to 2 MB and 100 data rows. XLSX: first sheet only, with archive size limits; formulas and embedded content are rejected. No PDF. Reconciliation only reports matches; it never assigns a transaction to an order. Account-number patterns are masked, which does not catch every way of writing them. File descriptions are not included in the results given to the model for preview and reconciliation; classification sends the redacted description to the model. The original file stays in the database.
- **Examples:** "Xem lịch sử nhập sao kê.", "Đối chiếu tệp vừa tải lên với sổ."

## Changing data

### `propose_change`
Proposes 1 to 20 changes for the owner to approve (`tools/change.js` and the `change-*.js` modules).

| Entity | Actions | Rules |
|---|---|---|
| `ledger` | create, update, delete | Delete only manual entries. Automatic entries allow classification and money channel changes only |
| `orders` | create, update | Status: paid → shipping → completed, or awaiting payment → cancelled. New orders await payment, take prices from the database and do not reduce stock. Other updates change shipping details only |
| `alerts` | update | Open → held or dismissed. The order is not changed |
| `shop` | update | Shop name |
| `products` | create, update, delete | Delete means stop selling |
| `customers` | create, update | No delete |
| `todos` | create, update, delete | |
| `conversations` | update | Turn the AI on or off for one conversation |
| `bank` | update | Receiving bank account. **Disabled** unless `ASSISTANT_SENSITIVE_ENABLED=true` |
| `customer_message` | create | Draft only. **Sending is not connected** |

- **Bank account:** the bank code, account number and name must appear in the owner's current message; approval and undo require the password again.
- **Customer message:** the owner picks the recipient among the shop's conversations, edits the text and approves. The send function reports that nothing was sent. Drafts with long unlabelled digit sequences are rejected. A sent message could not be undone.
- **Undo logs** for products, customers, todos, conversations, order details and bank data are encrypted with `APP_ENCRYPTION_KEY`, or `JWT_SECRET` if unset. Keep the key stable so earlier changes can still be undone.
- **Examples:** "Ghi khoản chi 200.000 đồng tiền điện hôm nay.", "Tạm giữ cảnh báo đang mở."

## What the assistant does not do

- Mark an order as paid.
- Create or edit bank transactions, or assign a transaction to an order.
- Change sign-in accounts, passwords, API keys or tokens.
- Read or change another shop's data.
- Write or run SQL.
- Send messages in bulk or without approval.

## When the AI is unavailable

Basic mode (`fallback.js`) matches keywords to one read tool: `get_summary`, `list_ledger`, `list_orders` or `get_order`. It proposes no changes. The server logs the reason and provider status without message content or keys.

## Current gaps

- `guard.js` is a temporary adapter: it refuses requests to confirm payment or match transactions, and wraps untrusted data. It is not a full prompt-injection defence.
- Newer tools have not had the full end-of-project test pass, including checks with a real model.
- Customer message delivery depends on the Messenger integration.
