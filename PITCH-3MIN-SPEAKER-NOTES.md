# Borneo — 3-minute speaker notes

**Screens:** Demo on main · Slides on second display  
**Live URL:** https://singhacks2026.vercel.app  
**Rule:** Slides = stats + Stripe ACS + close. Demo = everything else.

---

## PRE-FLIGHT (before you walk on)

- [ ] Production only — not a preview URL  
- [ ] Merchant logged in, Visa setup done, on `/onboard`  
- [ ] Buyer logged in on `/buyer` (other tab)  
- [ ] Shopify URL or CSV ready  
- [ ] Buyer prompt ready: *linen shirt for humid weather* OR *date night — find me a set*  
- [ ] Slides 1–2 open; Slide 4 ready for close  

---

## 0:00–0:20 · SLIDE 1 — Problem

**SAY:**

> Agents can’t shop the web. HTML, CAPTCHAs, multi-step checkout — top agents still fail about thirty percent of web tasks. Agentic commerce is exploding, but catalogs are trapped inside closed chat apps. If a merchant only lists there, every other agent is blind.

**SLIDE SHOWS:** ~30% fail · ~47% bot traffic · $8B→$1.5T · 2 closed paths / ∞ agents locked out  

**DON’T:** Explain WebArena. Don’t list every friction.

---

## 0:20–0:30 · SLIDE 2 — vs Stripe ACS

**SAY:**

> Stripe’s agent commerce path is closed. Borneo is open HTTP — any agent that loads our skill can crawl, search, and pay. We ship the skill, not a waitlist. We move with agents.

**SLIDE SHOWS:** Closed vs Open table  

**DON’T:** Feature-war with Stripe. Open vs closed is enough.

---

## 0:30–1:10 · DEMO — Merchant publish

**SWITCH TO:** `/onboard`

**SAY:**

> Merchant side. No admin marathon. Talk the catalog — or paste a store URL.

**DO:** Paste Shopify / drop CSV / chat → open sheet → **Confirm & publish**

**SAY (as it goes live):**

> Store is live for agents. Not HTML — `llms.txt` and `catalog.json`. On the market immediately.

**IF panes appear:** Flash Agent discovery 3–5s, then move on.  
**IF publish slow:** Keep talking — “fashion sheet confirms sizes and prices, then one click live.”

---

## 1:10–1:25 · Bridge — Indexed registry (one liner)

**SAY (while switching to buyer):**

> Buyer agents don’t scrape. They hit our indexed registry — fashion shortlist first, then semantic rank with stock and reviews. Not a full-catalog scan.

**OPTIONAL FLASH:** `/market` or search results — 5s max.  
**DON’T:** Say “O(1) embeddings.” Shortlist + rank is the line.

---

## 1:25–2:20 · DEMO — Buyer shop + pay

**SWITCH TO:** `/buyer`

**SAY:**

> Shopper just says what they want. Agent discovers, compares, and keeps checkout in the chat.

**DO:** Send prompt → wait for picks → open pay → **Authorize** (Visa preferred for drama)

**SAY (on confirm / pay):**

> Explicit authorize. Catalog text cannot change payee or amount. Visa scoped card in chat — RLUSD on XRPL is the second rail when you want on-chain settle.

**IF Visa flakes:** Show 402 on a store `/buy` or say “dual-rail — crypto path is the same handshake” and point at slide features.  
**DON’T:** Debug live. Don’t re-bind wallets.

---

## 2:20–2:40 · Coverage (glance, don’t lecture)

**SAY:**

> Merchants, buyers, open protocol, indexed search, dual rails, confirm-before-pay, reviews into rank, and a public skill so any agent can buy. Full loop.

**OPTIONAL:** Flash features slide 1 beat.

---

## 2:40–3:00 · SLIDE 4 — Close

**SAY:**

> Borneo: open agent storefronts. Merchants go live in chat. Buyers shop and pay in chat. Not a closed ACS — a protocol plus a skill. That’s how agent commerce scales.

**SLIDE SHOWS:** Open protocol · Indexed discovery · Dual-rail · singhacks2026.vercel.app  

**STOP. Smile. Hands free for questions.**

---

## IF JUDGES ASK (10-second answers)

| Question | Answer |
|----------|--------|
| Why not just Stripe? | Closed surface. We’re public protocol + skill — any agent runtime. |
| How does search scale? | Indexed shortlist by fashion facets, then embed/rank top candidates — not O(n) over every SKU. |
| What’s the currency? | Demo: RLUSD on XRPL Testnet + Visa-scoped card in chat. |
| Is the seed required? | Demo: shared `MERCHANT_ADDRESS` from env. Production can bind per merchant. |
| Moat? | Open discovery + pay handshake + merchant chat onboard + agent skill distribution. |

---

## FORBIDDEN (burns the clock)

- Seed / MetaMask / “bind wallet” story  
- Deep protocol dump (`402` internals unless they ask)  
- Reading every slide bullet  
- Restarting the demo from scratch  
- Apologizing mid-flow — skip ahead  

---

## ONE-LINE CHEAT (if you blank)

> **Open storefronts for agents — publish in chat, discover on an index, pay in chat — not a closed ACS.**
