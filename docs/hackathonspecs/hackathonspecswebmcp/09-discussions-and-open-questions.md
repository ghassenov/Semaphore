# Discussions & Open Questions

Source: https://webmcp.devpost.com/forum_topics (Devpost Discussions tab)

At research time (~24–36 hours into the hackathon), there were exactly **two** discussion threads, both posted by participants, both with **zero replies** from organizers or anyone else. Both raise legitimate ambiguities in the Official Rules that are worth tracking.

## Thread 1: "Clarification on submission limit - one entry per Entrant?"

- **Posted by:** Abdul Alhallak (https://devpost.com/hallak-aa)
- **Link:** https://webmcp.devpost.com/forum_topics/44943-clarification-on-submission-limit-one-entry-per-entrant
- **Status at research time:** 0 comments, unanswered

**The question, verbatim:**

> "I'm preparing an entry for The WebMCP Challenge and wanted to confirm the submission limit, since the rules seem to contain a contradiction.
>
> Section 3 of the official rules reads: 'An Entrant may not submit more than one Submission, however, each Submission must be unique and substantially different from each of the Entrant's other Submissions, as determined by the Sponsor and Devpost in their sole discretion.'
>
> The first clause says only one Submission is allowed, but the clause that follows refers to 'each of the Entrant's other Submissions,' which only makes sense if multiple are permitted.
>
> Could you confirm which applies? Specifically:
> 1. May a single Entrant submit more than one project, provided each is unique and substantially different?
> 2. If so, is an Entrant still limited to winning one prize across all of their submissions?
>
> I have two distinct WebMCP concepts in different problem domains and would rather know before building, so I don't split effort on something that will be disqualified."

**This spec folder's take:** This is a real, correctly-identified contradiction in the Official Rules text (see `02-official-rules.md`, "Multiple Submissions" section) — it is not a misreading. Until Devpost/OpenAI answers this thread or updates the Rules page, the safest planning assumption is **one Submission per Entrant**, since that's the plain-language first clause and the Rules state that in any conflict between Rules and other materials, the Rules control — but the Rules conflicting with themselves isn't addressed by that clause. If you have two genuinely distinct ideas, consider: (a) picking the stronger one, or (b) asking the same question yourself/watching this thread, or (c) emailing the hackathon manager directly (shawni@devpost.com, per the Overview page) for a written answer, which the Rules explicitly invite in §12.6 ("If... an Entrant or prospective Entrant believes that any term in the Official Rules is or may be ambiguous, they must submit a written request for clarification").

## Thread 2: "Are Private repo dependencies allowed"

- **Posted by:** Victor Perez (https://devpost.com/victor635)
- **Link:** https://webmcp.devpost.com/forum_topics/44950-are-private-repo-dependencies-allowed
- **Status at research time:** 0 comments, unanswered

**The question, verbatim:**

> "Example for PHP app that uses composer: Are we allowed to use private/auth-gated repos as dependencies? The source to those repos wouldn't be shared in the public repo, only their composer callout."

**This spec folder's take:** The Rules require the public repo to "contain all necessary source code, assets, and instructions required for the project to be functional" (see `02-official-rules.md`/`03-requirements-and-submission.md`). A dependency resolved via a private/auth-gated package registry at build time is arguably different from *your own project's source code* being private — most hackathons draw this line at "third-party libraries via public package managers are fine; your own application logic must be public" — but this is inference, not a stated rule. If your build genuinely depends on an auth-gated private repo (not a published package on a public registry like Packagist/npm/PyPI), this is a real risk to your submission's compliance and is worth getting an explicit answer on before relying on it.

## General guidance on using the Discussions board

- **Post a new topic:** https://webmcp.devpost.com/forum_topics/new (requires being logged into Devpost)
- You can subscribe to "Email me when new discussions are added" from the Discussions tab.
- The FAQ (see `04-faq.md`) directs unanswered questions to either the **OpenAI Discord** (https://discord.gg/openai) or this **Discussion Board** — so if the board stays quiet, Discord may get a faster response, especially around the scheduled **office hours** on August 31 (see `05-schedule-and-live-events.md`).

## Recommendation

Because this folder was compiled very early in the hackathon (participant count was still climbing rapidly across the research session), **re-check the Discussions and Updates tabs on Devpost directly before finalizing your submission strategy** — particularly around the multiple-submissions ambiguity, since it could materially affect whether you should split effort across two ideas.
