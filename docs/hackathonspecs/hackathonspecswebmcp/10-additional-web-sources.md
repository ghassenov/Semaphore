# Additional Web Sources (Not Found on Devpost)

This file collects everything discovered *outside* webmcp.devpost.com that adds information Devpost itself doesn't contain. Some of this material is fully digested elsewhere in this folder (cross-referenced below); this file is the single place listing every non-Devpost source with a short note on what it uniquely contributes.

## 1. OpenAI's official challenge landing page
**URL:** https://openai.com/webmcp-challenge/
**Fully digested in:** `01-overview.md`, `05-schedule-and-live-events.md`
**Unique contributions not on Devpost:**
- The exact **opening livestream** time/link (Aug 25, 3:00 pm PT, on X: https://x.com/i/broadcasts/1qGoNYbWdkvKv)
- The exact **office hours** time/link (Aug 31, 11:00 am PT, Discord channel link)
- A shorter, differently-worded judging description ("usefulness, originality, execution, thoughtful use of WebMCP, and quality of the human-agent experience") that is *not* the legally-binding four-criteria version but is useful as OpenAI's own plain-language framing
- Five hand-picked example apps with direct "try it" deep links into ChatGPT's desktop app
- A judge title discrepancy: lists Justin Rushing as **"Browser Agent Lead, OpenAI"** vs. Devpost's **"Browser Platform Lead, OpenAI"**

## 2. Netlify's challenge blog post
**URL:** https://www.netlify.com/blog/compete-openai-webmcp-challenge/
**Fully digested in:** `07-sponsor-resources.md` (Netlify section), `08-example-apps-and-showcase.md`
**Unique contributions not on Devpost:**
- Netlify's aggregate framing of its own commitment: "3 million credits and a $5,000 prize pool"
- All **five** Netlify demo apps (Kurio, Tagboard, Mabel's Table, The Archive, WebMCP starter) with descriptions — none of these are linked from Devpost's Resources page except the WebMCP starter
- A code snippet using `navigator.modelContext` (likely a documentation typo vs. the spec-correct `document.modelContext` — flagged in `07-sponsor-resources.md`)
- Independent confirmation of the full event timeline, matching OpenAI's dates
- Netlify's own philosophical framing of *why* WebMCP matters (the "web as a directory → web as a search index → web as an actable surface" narrative), useful context for a submission's "why is this a strong fit for WebMCP" writeup
- A separate Netlify-run microsite: https://webmcpchallenge.netlify.app/

## 3. Cloudflare's WebMCP launch blog post
**URL:** https://blog.cloudflare.com/webmcp/
**Fully digested in:** `06-webmcp-technical-spec.md` is spec-focused; the product-specific content is in `07-sponsor-resources.md` (Cloudflare section)
**Unique contributions not on Devpost:**
- This is a full **product launch announcement** (published Aug 6, 2026, updated Aug 10, 2026) — predates the hackathon itself and is the deepest single technical writeup of any sponsor's own WebMCP work
- Explains Cloudflare's **zero-code, edge-injected** WebMCP bridge mechanism in detail, including the exact `<script>` tag it injects and a full JS code sample of how it proxies an existing MCP server's tools into `document.modelContext.registerTool`
- Describes the **Content Credentials (C2PA)** tool pack in detail, including example JSON output from `scan_images_c2pa`
- Confirms Chrome's WebMCP surface first shipped experimentally in **Chrome 146** (a data point not stated anywhere on Devpost or even consistently on Chrome's own docs, which reference Chrome 149 for the testing flag)
- Links to Cloudflare's own **Radar** product's planned WebMCP tools (not yet shipped at research time)

## 4. OpenAI Developer Community forum announcement
**URL:** https://community.openai.com/t/the-webmcp-challenge-is-here/1392582
**Not separately fetched in full**, but its search snippet independently corroborates the sponsor list (Google Chrome, Cloudflare, Shopify, Vercel, Render, Netlify) and framing found on OpenAI's landing page — useful as a place to watch for official Q&A, separate from Devpost's own Discussions board and the OpenAI Discord.

## 5. X (Twitter) announcement threads
Multiple official sponsor accounts posted launch announcements. None were fetched as full pages (X requires login for full thread views), but **search snippets captured**:
- **@OpenAIDevs** — https://x.com/OpenAIDevs/status/2092344873764704345 and https://x.com/OpenAIDevs/status/2092344959248761263 — confirm the $35,000 total figure, sponsor list, and that ChatGPT Sites now supports WebMCP.
- **@ChromiumDev** — https://x.com/ChromiumDev/status/2092347580646637772 — confirms Sarah Drasner as a Chrome judge; a reply in this thread's snippet contains unfiltered community skepticism worth noting for expectation-setting: *"hackathon demos will look great, the open question is whether normal sites ever bother exposing the tools"* and *"the Google prize for this is weaksauce -- openai is offering a YEAR of their Pro license, at least offer a year of AI Ultra!"* — i.e., some public reaction has been mixed/critical of relative prize value, which is useful context but not authoritative.
- **@render** — https://x.com/render/status/2092349072372088973 — independently confirms Render's $50 participant credit, $300 top-10 credit, and the Aug 31 11am PT office-hours date.
- A personal account (@JamesZmSun) posted the same OpenAI kickoff message about adding WebMCP support to ChatGPT's desktop browser and the 3pm livestream — corroborating rather than adding new information.

## 6. Shopify's WebMCP tools documentation
**URL:** https://shopify.dev/docs/api/web-mcp
**Fully digested in:** `07-sponsor-resources.md` (Shopify section)
**Unique contribution:** This page is linked from Devpost only indirectly (Devpost links to shopify.dev/docs/agents and the same web-mcp URL) — it's the fullest description of a **production, shipped-by-default** WebMCP implementation among all sponsor resources, and useful as a "what does a mature/complete tool surface look like" reference distinct from every other sponsor's starter-kit-style resources.

## 7. The W3C/WebMachineLearning specification itself
**URL:** https://webmachinelearning.github.io/webmcp/
**Fully digested in:** `06-webmcp-technical-spec.md`
**Why this counts as "not on Devpost":** Devpost links to it, but doesn't reproduce any of its content — this is the actual normative spec text, current as of **26 August 2026** (the "Draft Community Group Report" date shown on the page itself, meaning it's being actively revised even during the hackathon window). Contains the full IDL, security/privacy considerations section, and acknowledgments naming individual spec contributors (including Alex Nahas, one of the hackathon judges, credited for "sharing early implementation experience").

---

## Sources considered but not independently verified

A general web search surfaced references to a "WebMCP" concept/brand at **webmcp.dev** (cited inside Netlify's own blog post as a canonical link: `[WebMCP](https://webmcp.dev/)`). This domain was not independently fetched during this research session — treat it as a pointer worth checking, not a verified source, since it wasn't opened directly.
