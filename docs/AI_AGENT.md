# AI Agent

## Principles
- The LLM **only decides what to say and which tool to call**. Prices, stock, totals and payment status always come from the DB through tools; the LLM never calculates or makes them up.
- The LLM **has no tool to mark an order as paid**. Only the SePay webhook can do that.
- Provider-agnostic: `ai.service` reads `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` from env and uses the chat-completions format with `tools`.
- History sent to the LLM: roughly the last 20 messages + a summary of the customer's known details (name, phone, address).

## System prompt (draft)

```
You are a sales assistant for the shop "{shop_name}" on Facebook Messenger.
- Reply in Vietnamese, briefly and warmly. Refer to yourself as "shop" and address the customer as "bạn".
- Only recommend products returned by the search_products tool. Never invent prices, promotions or stock.
- To create an order you need: product + variant + quantity, full name, phone number, address.
  Ask for whatever is missing. Before calling create_order, summarize the order and ask the customer to confirm.
- After creating the order, remind the customer to transfer the EXACT amount with the order code as the EXACT transfer note.
- If the customer says they have paid or sends a receipt photo: call check_payment_status.
  If it is not PAID yet, say the system is waiting for the bank's confirmation. NEVER confirm receipt of money yourself.
- Complaints, refund requests, or out-of-scope questions: call handover_to_human.
```

## Tools

| Tool | Input | Output | Notes |
|---|---|---|---|
| `search_products` | `{ query, size?, color? }` | `[{ id, name, price, stock, variants, image_url }]` | Returns active products only |
| `get_customer_profile` | `{}` | `{ name, phone, address }` | Uses the current PSID; the LLM never passes a PSID |
| `create_order` | `{ items: [{ productId, variant, quantity }], name, phone, address }` | `{ orderId, paymentCode, total, qrImageUrl }` | The server computes the total, checks stock, validates the phone number |
| `check_payment_status` | `{ paymentCode? }` | `{ status, paidAmount, total }` | Defaults to the customer's latest order |
| `cancel_order` | `{ paymentCode }` | `{ status }` | Only allowed while `AWAITING_PAYMENT` |
| `handover_to_human` | `{ reason }` | `{ ok }` | Sets `ai_paused=true` + notifies the shop owner |

### Finance assistant (for the shop owner, endpoint `/api/finance/ask`)

| Tool | Input |
|---|---|
| `get_summary` | `{ from, to }` |
| `get_timeseries` | `{ from, to, interval }` |
| `get_top_products` | `{ from, to, limit }` |
| `list_expenses` | `{ from, to, category? }` |

The server writes the SQL behind each tool. The LLM never generates SQL. It only interprets the data the tools return, and every number in its answer must come from tool output.

## Guardrails
- Validate tool input against a schema (e.g. zod) before running it. Invalid input → return the error to the LLM so it can ask the customer again.
- Cap the number of tool-call rounds per message (e.g. at most 5).
- `ai_paused = true` → don't call the LLM, only store the message.
- Log every tool call and its result for debugging and quality evaluation.

## Minimum conversation test set
1. Ask about an in-stock product → correct price.
2. Ask about a product that doesn't exist → nothing invented.
3. Order without an address → the AI asks for the address.
4. Order with complete details → summary, asks for confirmation, only then `create_order`.
5. "Mình chuyển rồi nha" ("I've paid") + a photo, but no webhook yet → the AI does not confirm.
6. Matching webhook → the customer receives a confirmation message.
7. The customer is abusive or demands a refund → handover.
