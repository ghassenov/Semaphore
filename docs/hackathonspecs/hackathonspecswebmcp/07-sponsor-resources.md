# Sponsor Resources — Full Detail by Company

Primary source: Devpost Resources tab (https://webmcp.devpost.com/resources), cross-checked and supplemented with each sponsor's own site where they offered extra detail (credit amounts, mechanics, deadlines) not printed on Devpost.

## Core / non-sponsor-specific documentation (top of the Devpost Resources page)

- **webmachinelearning/webmcp on GitHub** — https://github.com/webmachinelearning/webmcp — Specification source, explainers, open issues.
- **WebMCP developer documentation** (Google) — https://developer.chrome.com/docs/ai/webmcp — official documentation; see `06-webmcp-technical-spec.md` for a full digest.
- **WebMCP origin trial** — https://developer.chrome.com/blog/ai-webmcp-origin-trial — instructions for enabling WebMCP in Chrome via origin trial (an alternative to the local `chrome://flags` toggle).
- **WebMCP tool security guide** — https://developer.chrome.com/docs/ai/webmcp/secure-tools — prompt-injection risk and trust-boundary guidance; fully digested in `06-webmcp-technical-spec.md`.

---

## OpenAI

**Role:** Sponsor of record; runs Codex, ChatGPT, and the underlying models judges will test with.

- **WebMCP Showcase** — https://developers.openai.com/showcase?view=webmcp-apps — curated gallery of agent-native example apps. Full list captured in `08-example-apps-and-showcase.md`.
- **ChatGPT Sites** — https://learn.chatgpt.com/docs/sites?surface=app — build and host a site directly inside ChatGPT. **Caveat from the FAQ:** requires a paid ChatGPT plan and is **not currently available in the UK, EEA, or Switzerland**.
- **"Site tools" (WebMCP) documentation** — https://learn.chatgpt.com/docs/webmcp — OpenAI's own WebMCP integration guide; fully digested in `06-webmcp-technical-spec.md` §8. Key takeaway: use **GPT-5.6 Sol or Terra** (not Luna, which currently has WebMCP disabled); not available in Enterprise/Edu workspaces.
- **Devpost Hackathons Plugin** — installable inside ChatGPT Codex, helps with discovery/build/submission but is explicitly non-authoritative for rules (see `02-official-rules.md` §5). Install: https://chatgpt.com/plugins/plugin_asdk_app_6a330a7730c081919892632d5baaec58
- **OpenAI Discord** — https://discord.gg/openai — general support channel; also hosts the office-hours event (see `05-schedule-and-live-events.md`).
- **Prize contribution (top 10 winners, per team):** $3,000 USD cash, spotlight on @OpenAIDevs on X/Twitter, one Codex Micro device, OpenAI swag (up to 3 team members), ChatGPT Pro for 1 year (up to 3 team members).

---

## Cloudflare

**Role:** Hosting/edge platform sponsor; also independently launched a zero-code WebMCP product mid-hackathon.

- **WebMCP overview (blog)** — https://blog.cloudflare.com/webmcp/ — "Give any website a WebMCP interface." Fully digested in `10-additional-web-sources.md`. Short version: Cloudflare launched a **developer preview** (published August 6, 2026, updated August 10) letting any Cloudflare-fronted site get WebMCP tools via a dashboard toggle, with **zero code changes** — Cloudflare injects a small `<script>` bridge at the edge via HTMLRewriter.
- **WebMCP on Browser Run** — https://developers.cloudflare.com/browser-run/features/webmcp/ — docs for using WebMCP with Cloudflare's remote/headless browser product.
- **Coffee-store demo** — https://webmcp-coffee.jilles.fyi/ — a live WebMCP-enabled commerce example.
- **Cloudflare challenge landing page** — https://webmcp-challenge.examples.workers.dev/ — Cloudflare's own examples/resources page for this specific hackathon.
- **WebMCP on Workers template** — https://github.com/cloudflare/agents/tree/main/examples/webmcp-react — starter template combining WebMCP with React on Cloudflare Workers.
- **Cloudflare Pages / Workers** — https://developers.cloudflare.com/pages/ — general deployment docs.
- **Prize contribution:** $10,000 in Cloudflare credits (top 10 winners).

### Extra Cloudflare technical detail not on Devpost (from the blog post)

- Ships as **"tool packs"** — groups of related tools toggled together via **Agent Readiness > WebMCP** in the Cloudflare Dashboard.
- Two packs available at launch: **Content Credentials** (C2PA image-provenance reading — `scan_images_c2pa`, `inspect_image_c2pa`) and **Site MCP Server** (proxies your own existing MCP server's tools into `document.modelContext.registerTool` calls automatically, using the visitor's live session).
- Everything runs **client-side in the visitor's browser** — no round trip to a Cloudflare-run backend in this preview.
- Verify it's live on your own site with: `curl -s https://your-site.example | grep webmcp`
- Cloudflare's own **BrowserRun** remote browser can be pointed at any URL to discover/call its WebMCP tools exactly as a real visitor's agent would — useful as a testing tool independent of Chrome or ChatGPT.

---

## Vercel

**Role:** Hosting/frontend platform sponsor; contributed a real production storefront retrofit as a worked example.

- **Storefront source code** — https://github.com/vercel/shop — an open-source Next.js storefront you can fork/build on.
- **WebMCP implementation (pull request)** — https://github.com/vercel/shop/pull/498 — shows exactly how WebMCP tools were added to this existing storefront; a genuinely useful diff to read line-by-line as a real-world pattern.
- **Live storefront demo** — https://template.vercel.shop/ — the deployed result.
- **Vercel pricing** — https://vercel.com/pricing
- **Build credits offer:** $30 in Vercel build credits for the **first 1,000 builders** who redeem code **`OAIWEBMH-9E2F-MUT4`** at https://credits.vercel.sh/redeem
- **Prize contribution:** $300/month in Vercel credits + $50/month in AI Gateway credits, for **twelve months** (~$3,600 + $600 total value per winner).

---

## Shopify

**Role:** E-commerce platform sponsor; ships WebMCP tools automatically on every storefront (no opt-in required).

- **Shopify WebMCP tools documentation** — https://shopify.dev/docs/api/web-mcp — see full digest below.
- **Agentic tools** — https://shopify.dev/docs/agents — Shopify's broader agent-facing developer tools, including a Catalog API.
- **Prize contribution:** $250 in limited-edition Shopify Supply gear **per winning submission**.

### Shopify WebMCP tools — full digest (from shopify.dev/docs/api/web-mcp)

This is notable because it's the one sponsor resource describing a **shipped, production, zero-config** implementation rather than a starter kit — useful as a reference for what a mature WebMCP tool surface looks like.

> "Shopify provides WebMCP tools on every Liquid storefront, and on storefronts built with the Hydrogen developer preview. You don't need to install or configure anything."

- Works on the shopper's **live session** — cart tools call the same `Shopify.actions` standard storefront actions apps already use, so agent-driven cart changes behave exactly like the shopper's own (including triggering theme behaviors like opening a cart drawer, if configured).
- Currently limited to **Chromium-based browsers** for agent support.
- Distinguishes this from **Storefront MCP** (Shopify's separate backend MCP server product for developers building their own agents) — WebMCP tools serve *shoppers'* agents visiting the store, not your own agent's backend calls.

**Full tool catalog shipped by default:**

| Category | Tool | Description |
|---|---|---|
| Catalog | `search_catalog` | Search products, collections, articles, and pages; returns matches with price/availability plus a link to full search results. |
| Catalog | `browse_store` | List collections, or browse products within a specific collection; can navigate the shopper to the collection page. |
| Catalog | `get_product` | Full product detail — variants, prices, which option combinations are in stock; can navigate to the product page. |
| Catalog | `show_variant` | Navigate to a product page with a specific variant (or partial option, e.g. just a color) pre-selected. |
| Cart | `get_cart` | Cart contents — line items, product/variant details, quantities, totals. |
| Cart | `update_cart` | Add/change quantity/remove items; returns clarifying options rather than guessing on ambiguous requests. |
| Cart | `cancel_cart` | Empty the cart entirely. |
| Checkout/Orders | `proceed_to_checkout` | Navigate to checkout with the current cart (after verifying it isn't empty). |
| Checkout/Orders | `manage_orders` | Navigate to order history/tracking; prompts login first if the shopper isn't authenticated. |
| Store info | `search_shop_policies_and_faqs` | Answer policy/FAQ questions (returns, shipping, hours) from the store's own content. |

---

## Google Chrome

**Role:** Browser platform sponsor; owns the reference implementation and canonical developer documentation for WebMCP itself.

- **useWebMCPTool React hook** — https://www.npmjs.com/package/use-webmcp-tool — npm package for adding WebMCP tools to a React app. *(Note: this is a different, similarly-named package from the `usewebmcp` hook mentioned in Chrome's own Imperative API doc — check both if you're building in React, since the Devpost Resources page and the Chrome docs page reference slightly different package names.)*
- **WebMCP Explainer** — https://github.com/webmachinelearning/webmcp/blob/main/README.md — API design rationale.
- **WebMCP with Angular** — https://angular.dev/ai/webmcp — native Angular support (Signal Forms → WebMCP tools).
- **WebMCP evals** — https://developer.chrome.com/docs/ai/webmcp/evals — how to test your tools before shipping (evaluation-driven development, referenced conceptually in the Best Practices doc — see `06-webmcp-technical-spec.md` §6).
- **WebMCP developer documentation** — https://developer.chrome.com/docs/ai/webmcp — the full doc hub; fully digested in `06-webmcp-technical-spec.md`.
- **Debug WebMCP tools** — https://developer.chrome.com/docs/devtools/application/webmcp — inspect/debug registered tools directly in Chrome DevTools' Application panel.
- **Modern Web Guidance** — https://github.com/GoogleChrome/modern-web-guidance — includes a WebMCP-specific "skill" designed to be fed to coding agents so they build WebMCP correctly.
- **WebMCP demos** — https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/demos — example implementations, including:
  - **WebMCP Pizza Maker** (Imperative API) — https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/demos/pizza-maker
  - **Travel demo (React, Imperative API)** — https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/demos/react-flightsearch
  - **Le Petit Bistro (Declarative API)** — https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/demos/french-bistro
  - **WebMCP Page Agent demo** — https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/demos/page-agent — shows retrieving tools from an iframe and executing them inside a web-based chat UI.
- **Model Context Tool Inspector Extension** — https://chromewebstore.google.com/detail/model-context-tool-inspec/gbpdfapgefenggkahomfgkhfehlcenpd — lets you chat with a live agent (backed by `gemini-3-flash-preview` by default) against any page to verify your tools are discovered/described/invoked correctly, inspect JSON Schema validity, and view structured tool output/errors.
- **Prize contribution:** 3-month subscription to Google AI Ultra per winning team member (~$300 value/team member).

---

## Render

**Role:** Hosting platform sponsor, with an agent-workflow product angle.

- **Render Workflows** — https://render.com/workflows — build/run agent-ready workflows.
- **Workflows documentation** — https://render.com/docs/workflows
- **Starter templates** — https://render.com/templates
- **Participant credits** — https://credits-portal-mmdm.onrender.com/claim/openai-hackathon — claim **$50 in Render credits**; initially capped at **up to 500 claims**. Credits are valid for **one year** after being applied and can cover workspace costs (plan fees, compute usage, bandwidth).
- **Credits documentation** — https://render.com/docs/credits
- **Prize contribution:** $300 in Render credits (top 10 winners).
- **Extra detail from Render's own X post (not on Devpost):** confirms the $50 participant credit and $300 top-10 credit figures directly, and separately confirms **office hours on 8/31, 11am PT** — matching the general office-hours slot referenced in `05-schedule-and-live-events.md`.

---

## Netlify

**Role:** Hosting platform sponsor; contributed the most extensive independent starter-app library of any sponsor, plus the largest headline credit commitment.

- **Netlify** — https://netlify.com/ — create an account, publish your app, get a live URL; free to start.
- **Participant credits** — the **first 1,000 eligible builders** to complete this form receive **3,000 Netlify credits each**: https://forms.gle/xw75XGUQzCXEiALc7 — available to both new and existing Netlify users. (Cross-referenced in the Official Rules: deadline **September 1, 12:00 pm PT**; credits must be redeemed by **October 3, 2026**; not redeemable for cash.)
- **Choose your path** — https://docs.netlify.com/start/choose-your-path/ — general getting-started guide.
- **WebMCP starter** — https://webmcp-starter.netlify.app/ — copy a ready-made prompt, hand it to a coding agent, and it builds + deploys a full WebMCP-enabled site on Netlify using **Agent Runners**.
- **Prize contribution:** $500 in cash prizes (top 10 winners).

### Extra Netlify detail not on Devpost (from Netlify's own blog: netlify.com/blog/compete-openai-webmcp-challenge)

Headline framing differs slightly from Devpost's per-winner $500 figure — Netlify's own post describes its total commitment as **"3 million credits and a $5,000 prize pool"** across the challenge as a whole (i.e., $5,000 aggregate, consistent with $500 × 10 winners).

Netlify published **five separate, fully forkable demo apps**, each illustrating a different WebMCP pattern — not listed anywhere on Devpost:

| Demo | URL | Pattern illustrated |
|---|---|---|
| WebMCP starter | https://webmcp-starter.netlify.app/ | Prompt-first: copy a prompt, an agent builds + deploys it |
| Kurio | https://webmcp-kurio.netlify.app/ | Fictional marketplace — search, cart, simulated checkout; has a `/learn` page showing exactly what the agent sees |
| Tagboard | https://webmcp-tagboard.netlify.app/ | Public guestbook — agents can read/post notes, every write moderated through Netlify's AI Gateway |
| Mabel's Table | https://webmcp-mabels-table.netlify.app/ | Fictional restaurant — agents work against live reservation state, can hit fully-booked slots, negotiate alternatives, place holds, confirm/cancel bookings |
| The Archive | https://webmcp-archive.netlify.app/ | Detective mystery designed for a human + agent to solve *together*, where some clues are visual (human-only) and others are tool-only (agent-only) |

Netlify also published the same minimal code example shown in the technical spec file:

```js
await navigator.modelContext.registerTool({
  name: 'search_products',
  description: 'Search the catalog by keyword.',
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query']
  },
  execute: async ({ query }) => searchProducts(query),
  annotations: { readOnlyHint: true }
});
```

*(Note: Netlify's snippet uses `navigator.modelContext` while the W3C spec and Chrome's docs use `document.modelContext` — the W3C spec (§4.1) defines the API as an extension of `Document`, so `document.modelContext` is the spec-correct form. Treat Netlify's `navigator.modelContext` as likely a documentation error, not an alternate valid API.)*

Netlify separately maintains a hackathon-specific microsite mirroring/expanding this content: https://webmcpchallenge.netlify.app/

---

## Quick-reference: all sponsor prize contributions in one table

| Sponsor | Per-winner prize |
|---|---|
| OpenAI | $3,000 cash + Twitter/X spotlight + Codex Micro + swag (≤3 members) + 1yr ChatGPT Pro (≤3 members) |
| Cloudflare | $10,000 in Cloudflare credits |
| Vercel | $300/mo Vercel credits + $50/mo AI Gateway credits × 12 months (~$4,200 total value) |
| Render | $300 in Render credits |
| Netlify | $500 cash |
| Shopify | $250 in Shopify Supply gear |
| Google Chrome | 3-month Google AI Ultra subscription per team member (~$300/member) |

## Quick-reference: all "free credits for everyone" offers (not just winners)

| Sponsor | Offer | How to claim | Deadline |
|---|---|---|---|
| Vercel | $30 build credits, first 1,000 builders | Redeem code `OAIWEBMH-9E2F-MUT4` at credits.vercel.sh/redeem | Not stated — while supplies last |
| Render | $50 credits, up to 500 claims | https://credits-portal-mmdm.onrender.com/claim/openai-hackathon | Not stated — while supplies last |
| Netlify | 3,000 credits, first 1,000 builders | Google Form: https://forms.gle/xw75XGUQzCXEiALc7 | Sep 1, 2026, 12:00 pm PT (per Official Rules); redeem by Oct 3, 2026 |
