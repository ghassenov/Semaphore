# Example Apps & Showcase

All the concrete, working example apps referenced across OpenAI's site, the Devpost Resources page, and sponsor blog posts. Use these for inspiration on scope/ambition level and for patterns to borrow.

## OpenAI's own hand-picked examples (from openai.com/webmcp-challenge)

These five are highlighted directly on OpenAI's official challenge landing page as "a few agent-native apps from our team for inspiration":

| App | Description | Try it |
|---|---|---|
| **3D Modeling (Codex Modeling Studio)** | "Build and refine 3D models with your agent, watching the scene take shape as you guide each change." | https://codex-modeling-studio.openai.chatgpt.site/ |
| **Collaborative Writing (Margin)** | "Write and revise together in a shared document, where your agent can leave comments and respond under its own identity." | https://margin-local-docs.openai.chatgpt.site/ |
| **Crossword Builder (Crossword Desk)** | "Turn a topic or context you share with your agent into a personalized crossword, then refine the clues together." | https://crossword-desk-studio.openai.chatgpt.site/ |
| **Wandernote** | "Turn your travel notes into an itinerary with your agent, then leave comments to shape the plan together." | https://wandernote.openai.chatgpt.site/ |
| **Data Exploration (Duckboard)** | "Query and combine data with your agent using DuckDB-Wasm, then create custom visualizations in your browser." | https://duckboard-webmcp.alexmnahas.workers.dev/ |

Note that "Duckboard" was built by **Alex Nahas**, who is also one of the hackathon's official judges (listed as "Creator of MCP-B") — worth studying closely as a signal of what a judge-built reference implementation looks like.

## OpenAI Developers Showcase — "WebMCP apps" filter

Source: https://developers.openai.com/showcase?view=webmcp-apps

The showcase is filterable by model, type (App/Game/Landing Page/Storefront/Other), use case, and tech stack. The full list of WebMCP-tagged apps found at research time:

| App | Description |
|---|---|
| **Codex Modeling Studio** | A web-native 3D modeling suite designed for Codex. |
| **Margin Editor** | A local note-taking app for collaborating with your agent. |
| **Crossword Desk** | Build and solve crosswords with an agent. |
| **Fieldwork // 12** | Create beats and sequence music with Codex. |
| **WanderNote** | Plan a trip together in an editable itinerary. |
| **Webroom** | Agent-compatible photo editing. |
| **Sunday Table** | Plan weekly meals, recipes, and groceries together. |
| **Cubecade** | An arcade-style 3D puzzle cube with agent controls. |
| **Paperie** | Design greeting cards and artwork with Codex. |
| **Verdant Market** | Browse groceries and build a shared cart with an agent. |

The showcase's featured/rotating apps at research time also included **Glass Towers** (a minimalist 3D balancing game), **MiniTown** (a tiny living town sim), **Field Day** (a picnic-supply storefront with a build-your-own basket), and **Material Lab** (a real-time studio for shaping light/surface/form) — these may or may not be WebMCP-specific; check the live showcase filter to confirm current tagging, since the showcase spans multiple OpenAI programs, not just this hackathon.

## Netlify's five demo apps

(Fully described in `07-sponsor-resources.md` under Netlify — repeated here for a single "all example apps" reference point.)

| Demo | Pattern | URL |
|---|---|---|
| WebMCP starter | Prompt-first scaffold-and-deploy | https://webmcp-starter.netlify.app/ |
| Kurio | Marketplace: search → cart → simulated checkout | https://webmcp-kurio.netlify.app/ |
| Tagboard | Public guestbook with AI-Gateway-moderated writes | https://webmcp-tagboard.netlify.app/ |
| Mabel's Table | Restaurant reservations against live, contestable state | https://webmcp-mabels-table.netlify.app/ |
| The Archive | Human+agent cooperative detective mystery | https://webmcp-archive.netlify.app/ |

## Cloudflare's demo

- **Coffee-store demo** — https://webmcp-coffee.jilles.fyi/ — a WebMCP-enabled commerce example (see `07-sponsor-resources.md`).
- **Cloudflare challenge landing page** — https://webmcp-challenge.examples.workers.dev/ — Cloudflare's own curated examples/resources hub for this hackathon specifically.

## Vercel's demo

- **Storefront demo** — https://template.vercel.shop/ — a real Next.js commerce storefront with WebMCP retrofitted onto it. The matching pull request (https://github.com/vercel/shop/pull/498) is arguably the single best "how do I add WebMCP to something I already built" worked example across all sponsors, since it's a diff against a real, non-trivial, open-source app rather than a from-scratch toy.

## Google Chrome's demos

(Fully described in `07-sponsor-resources.md` under Google Chrome.)

| Demo | API used | URL |
|---|---|---|
| WebMCP Pizza Maker | Imperative | https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/demos/pizza-maker |
| Travel demo (React flight search) | Imperative | https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/demos/react-flightsearch |
| Le Petit Bistro | Declarative | https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/demos/french-bistro |
| WebMCP Page Agent | Imperative (iframe tool discovery + in-page chat execution) | https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/demos/page-agent |

Chrome also maintains a live interactive comparison demo (scrape-the-DOM vs. call-a-tool, side by side) at the appointment-booking explainer: https://googlechromelabs.github.io/webmcp-tools/demos/explainer/#compare

## Shopify's production example

Not a "demo" in the toy sense — Shopify ships a full WebMCP tool suite (`search_catalog`, `get_cart`, `update_cart`, `proceed_to_checkout`, etc. — full table in `07-sponsor-resources.md`) on **every live Liquid storefront by default**. Any Shopify store is effectively a real-world WebMCP reference implementation you can inspect live.

## Takeaway for brainstorming

Across every sponsor's examples, four repeatable patterns emerge — useful as a checklist when scoping your own idea:

1. **Search/browse/filter over a catalog** (Verdant Market, Kurio, Kurio-derivatives, Shopify's own tools, Chrome's flight-search demo)
2. **Structured form-filling replacing multi-step UI flows** (Chrome's Le Petit Bistro reservation form, the Warranty Claim and Timesheet examples in Chrome's use-cases doc)
3. **Human + agent co-creating the same artifact in real time** (Margin/Collaborative Writing, WanderNote, Crossword Desk, The Archive)
4. **Agent negotiating against live, contestable state** (Mabel's Table hitting a fully-booked slot and negotiating alternatives) — this is arguably the most "meaningfully better together" pattern and maps most directly onto the "Potential Impact" and "Creativity & Ambition" judging criteria.
