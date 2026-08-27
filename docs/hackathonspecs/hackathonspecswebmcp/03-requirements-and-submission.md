# What to Build & What to Submit

Consolidated from the Devpost Overview page, Rules tab, and Resources/FAQ tab. This is the practical builder's checklist version of `02-official-rules.md`.

## What to build

> "Build a WebMCP-powered web app that imagines and explores the future of the open web — where humans and agents can interact, collaborate, and create together."

This is deliberately open-ended. It can be:
- A **brand-new app** built during the Submission Period, or
- An **existing app meaningfully extended with WebMCP** during the Submission Period (Aug 25 – Sep 3, 2026). Work done before Aug 25 does not count toward judging, and you must document what's new (e.g., dated/timestamped commits).

The unifying test the judges will apply (per the Devpost Overview's "What to Submit" section and Judging Criteria) is: *does adding WebMCP make the app meaningfully better when a person and their agent use it together* — not just "does the app technically call `registerTool()`."

## What to submit — the four required pieces

### 1. A working live URL
- Must be reachable and testable using **ChatGPT's in-app browser** or **Google Chrome with WebMCP enabled**.
- Host anywhere you like: ChatGPT Sites, Cloudflare, Vercel, Render, Netlify, Shopify, or any other provider.
- You may authenticate the app; if so, supply credentials/testing instructions on the submission form.
- Must remain live and testable **through the end of the Judging Period** (Sep 21, 2026).

### 2. A text description that explicitly answers four questions
The Devpost submission form (and Official Rules) require the description to cover:
1. **Why your use case is a strong fit for WebMCP**
2. **How it creates a better user experience**
3. **What people and agents can do together that was difficult or impossible before**
4. **A brief explanation of how you implemented WebMCP**

Treat these four bullets as an outline for your write-up — judges will be scoring against exactly this framing (it maps directly onto the "WebMCP Leverage" and "Potential Impact" judging criteria).

### 3. A public code repository
- Hosted on **GitHub, GitLab, or Bitbucket**.
- Must contain **all source code, assets, and instructions** needed for the project to actually run.
- Must be **open source** with a license file that is **detectable and visible at the top of the repo page**, specifically in the "About" section (this is a GitHub-specific UI convention — make sure your license shows up in the repo sidebar/About card, not just as a LICENSE file buried in the tree).
- The Devpost page repeats a reminder that repos "should have the following," followed by an example `document.modelContext.registerTool({...})` snippet — read as guidance that your repo's README/code should visibly demonstrate the actual WebMCP tool-registration call, not just link to it.

### 4. A demo video
- **Under 3 minutes.** Judges are not required to watch past the 3-minute mark, so front-load the important content.
- Must be **public on YouTube**, with the link on the submission form.
- Must have **audio** covering what you built and how you used WebMCP.
- Must show a **clear, working demo** — not just slides.
- Must not include third-party trademarks or copyrighted music/material without permission.

## Submission constraints and gotchas

- **One Submission per Entrant** (with an unresolved internal contradiction in the rules text about "other Submissions" — see `09-discussions-and-open-questions.md`). Don't plan around submitting multiple distinct projects until this is clarified.
- **No private-repo option.** Unlike some hackathons, there's no "private repo + judge access" path — the FAQ explicitly confirms: *"unlike some hackathons, this one requires a public repository with a visible open-source license. There's no private-repo-plus-shared-access path here."*
- **No edits after the deadline.** Once the Submission Period closes (Sep 3, 1:00 PM PT), do not touch your Devpost submission, your repo, or your live site until winners are announced — editing during judging risks disqualification. If you want to keep developing, **fork the repo** and work in the fork, leaving the submitted version frozen.
- **Judges may not test your app at all.** They can judge purely from your description, images, and video — so the video and README need to stand alone.
- **Testing access:** if your live app requires login, you must supply working credentials/testing instructions in the submission form.

## Verifying your Chrome / ChatGPT test setup

Per the Rules and FAQ:
- **ChatGPT desktop app:** its built-in in-app browser supports WebMCP out of the box — no flags needed.
- **Google Chrome:** version **149 or later**, then enable `chrome://flags/#enable-webmcp-testing` and relaunch. (Chrome's own developer docs, in `06-webmcp-technical-spec.md`, additionally mention an **origin trial** as of Chrome 146+ as an alternative to the local flag, for testing without every visitor needing to flip a flag themselves.)

## Using AI to build your project — what's allowed (from the FAQ)

> "AI assistants are welcome — judges care about the final project and the real problem it solves, not how the code was typed."

**🟢 Do use AI to:**
- Scaffold, debug, and iterate faster
- Draft and tighten your README and project description
- Brainstorm edge cases

**🔺 Don't use AI to:**
- Name your project generically (pick something specific — it's the first thing judges see)
- Describe your project in vague, generic terms
- Fake or overstate what's actually running

## Optional: Netlify credits (time-boxed, easy to miss)

If you want free Netlify credits (3,000 credits for the first 1,000 eligible builders, per Netlify's own blog — see `07-sponsor-resources.md` and `10-additional-web-sources.md`), you must:
- Be a registered Entrant for the Hackathon
- Complete this form: https://forms.gle/xw75XGUQzCXEiALc7
- **By September 1, 2026, 12:00 pm PT** — two days before the submission deadline itself
- Credits are not cash and must be redeemed by **October 3, 2026**

## Optional: Devpost Hackathons Plugin

An AI-assisted plugin installable inside ChatGPT Codex that can help you discover the hackathon, plan, build, and submit — without leaving Codex. **Not required.** Per the Official Rules, if the Plugin's output ever conflicts with the Official Rules or the Devpost website, the Official Rules and website win. Do not treat anything the Plugin tells you about deadlines/eligibility/prizes as authoritative — verify against this spec folder or the live Devpost pages.

Install link (from Devpost Resources tab): https://chatgpt.com/plugins/plugin_asdk_app_6a330a7730c081919892632d5baaec58

## Vercel-specific submission perk

Vercel is offering **$30 in build credits to the first 1,000 builders** who redeem code `OAIWEBMH-9E2F-MUT4` at https://credits.vercel.sh/redeem (see `07-sponsor-resources.md` for full sponsor-by-sponsor detail).
