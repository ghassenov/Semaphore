# Strategy Notes & Builder's Checklist

A practical synthesis of everything in this folder, written for someone about to actually plan and build a submission. This file is interpretation/synthesis, not verbatim source material — everything here should trace back to a claim made in one of the other files.

## The core thing judges are checking for

Judging Criteria (`01-overview.md`, `02-official-rules.md`) are **equally weighted**:
1. WebMCP Leverage — genuine, non-trivial implementation, not a token `registerTool()` call
2. Execution — a complete, coherent *product*, not a tech demo
3. Potential Impact — a credible, specific real problem for a real audience, actually addressed
4. Creativity & Ambition — novel, differentiated from existing concepts

The single most repeated phrase across every official source (Devpost, OpenAI's site, Netlify's blog) is some version of: **"meaningfully better when people and their agents use it together."** Read that literally — a submission that works identically with or without the agent, or where the agent just automates something a human could already do faster manually, will underperform on Impact and Creativity even if the WebMCP code itself is technically solid. The strongest pattern across sponsor examples (see `08-example-apps-and-showcase.md`) is **agent negotiating against live, contestable state alongside the human** (Mabel's Table hitting a fully-booked slot and negotiating alternatives; The Archive's split human-only/agent-only clues) — not just agent-does-a-task-for-you.

## Pre-build checklist

- [ ] Confirm you (and every team member) meet eligibility — age of majority, resident of an OpenAI-API-supported country/territory, not on the excluded list (`02-official-rules.md` §3, `01-overview.md`)
- [ ] Register on Devpost (`webmcp.devpost.com` → "Join Hackathon")
- [ ] Install/verify your test environment: **either** ChatGPT desktop app (in-app browser, WebMCP works out of the box — but confirm you're on GPT-5.6 Sol/Terra, not Luna) **or** Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled and browser relaunched (`03-requirements-and-submission.md`, `06-webmcp-technical-spec.md` §8)
- [ ] Decide hosting provider — no cost is required; Cloudflare/Vercel/Netlify/Render all have workable free tiers; avoid ChatGPT Sites if you're in the UK/EEA/Switzerland or don't have a paid ChatGPT plan (`04-faq.md`)
- [ ] If you want free credits, claim them **early**, since several are capped by builder-count (first 1,000 for Vercel/Netlify, first 500 for Render) and Netlify's has a hard deadline of **Sep 1, 12pm PT** (`07-sponsor-resources.md`)
- [ ] Pick **one** idea — don't build two, given the unresolved "one Submission" ambiguity (`09-discussions-and-open-questions.md`)
- [ ] If any part of your build depends on a **private/auth-gated repo** as a dependency, get written clarification before relying on it (`09-discussions-and-open-questions.md`)

## Build checklist

- [ ] Name the project something **specific**, not AI-generated-generic — it's the first thing judges see (`04-faq.md`, "Don't use AI to... name your project")
- [ ] Design tools around **one function per tool** — avoid overlapping tools that confuse the agent's tool selection (`06-webmcp-technical-spec.md` §6)
- [ ] Write tool descriptions in **positive language** describing what the tool does, not what it can't do (`06-webmcp-technical-spec.md` §6)
- [ ] Accept raw user input in tool parameters rather than making the agent compute/transform values (`06-webmcp-technical-spec.md` §6)
- [ ] Add `readOnlyHint` to every non-mutating tool and `untrustedContentHint` to every tool returning user-generated or externally-sourced content (`06-webmcp-technical-spec.md` §5)
- [ ] Keep within the recommended character budgets if you want to reduce agent-guardrail friction: 500 chars/description, 150/param description, 30/name, 1.5K/output (`06-webmcp-technical-spec.md` §5) — these are Chrome recommendations, not hard spec limits, but worth respecting
- [ ] Preserve a normal, fully-functional human UI alongside your WebMCP tools — WebMCP should be additive (`06-webmcp-technical-spec.md` §8, per OpenAI's own guidance)
- [ ] If extending a pre-existing project rather than starting fresh, keep clear, dated/timestamped commit history proving what was added **after Aug 25** — required documentation, not optional (`02-official-rules.md` §4, `03-requirements-and-submission.md`)
- [ ] Test against **both** ChatGPT's in-app browser and Chrome with the flag enabled if you can — judges may use either (`02-official-rules.md` §4)
- [ ] Consider testing with the **Model Context Tool Inspector Extension** to verify schema validity and tool discovery independent of a live judge session (`07-sponsor-resources.md`, Google Chrome section)

## Submission checklist

- [ ] **Live URL** — working, testable via ChatGPT in-app browser or WebMCP-enabled Chrome, remains live through **Sep 21** (end of judging)
- [ ] **Text description** answering all four required points explicitly: (1) why WebMCP fits, (2) how it improves UX, (3) what's newly possible together, (4) how you implemented WebMCP (`03-requirements-and-submission.md`)
- [ ] **Public repo** (GitHub/GitLab/Bitbucket) with a license file **visible in the repo's "About" section**, not just buried in the file tree — this is a specific, checkable UI requirement (`02-official-rules.md` §4, `03-requirements-and-submission.md`)
- [ ] **Demo video**: under 3 minutes, public on YouTube, has audio, clearly demos the app working and explains the WebMCP implementation, no unlicensed trademarks/music (`02-official-rules.md` §4)
- [ ] If your app requires login, include working test credentials in the submission form (`02-official-rules.md` §4)
- [ ] Submit **before** Sep 3, 1:00 pm PT — and once submitted, **freeze everything** (submission, repo, live site) until winners are announced; fork the repo if you want to keep developing (`04-faq.md`)

## Risk register (things that could sink an otherwise-good submission)

| Risk | Source | Mitigation |
|---|---|---|
| Editing repo/site after the deadline | `04-faq.md` | Fork before continuing work; leave submitted version untouched |
| License not visible in repo's "About" section (only a LICENSE file in the tree) | `02-official-rules.md`, `03-requirements-and-submission.md` | Explicitly set the license in your Git host's repo settings, not just a file |
| Building on a pre-existing project without clear dated evidence of what's new | `02-official-rules.md` §4 | Keep a clean, dated commit history from Aug 25 onward; consider a CHANGELOG |
| Depending on a private/auth-gated repo as a build dependency | `09-discussions-and-open-questions.md` | Get written clarification, or avoid the dependency |
| Assuming you can submit two ideas because the Rules text implies plurality | `09-discussions-and-open-questions.md` | Plan around exactly one Submission |
| Building only for ChatGPT Sites without checking geo-restriction | `04-faq.md` | Confirm your team/target judges aren't UK/EEA/Switzerland-only if relying on ChatGPT Sites; have a Chrome-testable fallback regardless |
| Demo video over 3 minutes | `02-official-rules.md` §4 | Judges aren't required to watch past 3:00 — front-load the strongest content |
| Tool that "reads" data but actually mutates state (or vice-versa) mismatched with its `readOnlyHint`/description | `06-webmcp-technical-spec.md` §5 (Misrepresentation of Intent) | Keep hints and descriptions strictly accurate — this is literally one of the named security failure modes in the spec, and sloppiness here undermines both security posture and the "Execution" judging criterion |
| Assuming ChatGPT will test with any GPT-5.6 variant | `06-webmcp-technical-spec.md` §8 | If demoing inside ChatGPT, use Sol or Terra — Luna currently has WebMCP disabled |

## Open items to keep monitoring on Devpost directly

Per `09-discussions-and-open-questions.md` and `00-INDEX.md`, this research was done very early in the hackathon window. Before finalizing your plan, re-check:
- The **Discussions** tab — for an official answer to the multiple-submissions ambiguity
- The **Updates** tab — for any organizer-posted rule clarifications or corrections
- The live **Overview** page's countdown/participant count — for the actual current state, since counts were still climbing rapidly at research time
