# Borneo — 3-minute speaker notes (OKX Dev Day)

## Opening (0:00–0:40)

Agent commerce is real — but catalogs are walled. If you only list where ChatGPT or Claude can Instant Checkout, every other agent is locked out: procurement bots, local LLMs, Cursor agents, personal runners.

**Borneo** is an open HTTP storefront protocol. Publish once. Any agent can discover and buy.

## Problem → product (0:40–1:20)

Show `/` — closed catalog gate vs open registry.

- Index: `/registry.json`, `/llms.txt`
- Discover: `GET /api/search`
- Buy: `POST /s/{slug}/buy` → HTTP **402** (A2MCP-shaped)

Settlement is **USDT0 on X Layer** via **OKX Payment SDK / facilitator**. Optional Visa-style scoped card stays in chat.

## Live demo (1:20–2:20)

1. **Merchant** `/onboard` — talk inventory or paste Shopify → publish  
2. **Buyer** `/buyer` — “I want a t-shirt” → compare → pick USDT0 → authorize  
3. Call out: catalog text never changes payee or amount; locked quote only  

If keys are missing, still show the 402 challenge — that is the product surface for A2MCP registration on OKX.AI.

## Why OKX (2:20–2:50)

- **X Layer** — EVM L2, cheap gas, USDT0 settlement asset  
- **Onchain OS** — Agentic Wallet + MCP skills for builders  
- **A2MCP** — same 402 shape the marketplace validates  
- **Builder guidelines** — agent-native payments, not a wrapped checkout page  

## Close (2:50–3:00)

Open supply for every agent. Trusted settle on OKX rails. That’s Borneo.

---

## Judge Q&A cheat sheet

| Question | Answer |
|---|---|
| What’s the currency? | Demo: USDT0 on X Layer Testnet (`eip155:1952`) + optional Visa-scoped card in chat. |
| Is this scraping? | No — `/llms.txt`, registry, catalog JSON, `/api/search` only. |
| How do external agents pay? | Sign x402 `PAYMENT-SIGNATURE` (Agentic Wallet or local key) and replay `/buy`. |
| MCP? | Cursor `.cursor/mcp.json` → `onchainos mcp`; skills under `.agents/skills/okx-*`. |
