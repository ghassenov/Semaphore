# 11 — Spec Notes

**Status: TEMPLATE. Fill during Phase 0 §0.3, update whenever anything changes, and re-verify the day before submitting.**

WebMCP is a Draft Community Group Report under active revision — it moved `modelContext` from `navigator` to `document`, removed `provideContext`/`clearContext`, and removed `unregisterTool`, all within six months. Several claims in our own v1 documents turned out to be disputed on closer reading. **We do not build on memory. We build on things we tested, on a date, in a named browser version.**

This document is also a small public artifact in its own right: dated empirical findings about a moving spec, in an open repo, is exactly the kind of thing a working group finds useful. Write it for someone else.

---

## 0. Documentary baseline (read from the spec, NOT observed in a browser)

**This section is the exception that proves the rule.** Everything below section 1 is empirical and stays blank until a browser produces it. This section is what the normative text says, recorded separately so the two are never confused. A row here is a **prediction the spike is trying to falsify**, not a finding.

Source: the W3C Web Machine Learning Community Group draft at <https://webmachinelearning.github.io/webmcp/>, read 2026-08-27.

| Claim | Spec text | Consequence for us |
|---|---|---|
| `modelContext` lives on `Document` | `partial interface Document { readonly attribute ModelContext modelContext; }` | `document` first. Chrome 150 deprecates the `navigator` alias, so keep the fallback, do not lead with it. |
| `registerTool(tool, options)` | `Promise<undefined> registerTool(ModelContextTool tool, optional ModelContextRegisterToolOptions options = {})` | Returns `undefined`, not the registered tool. See spec issue 234, which proposes changing this. |
| Registration options | `signal` (AbortSignal), `exposedTo` (sequence of USVString origins) | Both load-bearing: `signal` is the whole lifecycle, `exposedTo` is the archive origin. |
| No `unregisterTool` | Absent. Removal is "add the following abort steps to signal: unregister a tool" | Confirmed. `AbortSignal` teardown is the only path, which is the mechanism the game is built on. |
| **`execute` takes TWO arguments** | `(object inputObject, ToolExecuteCallbackOptions options)`, where options carries `required AbortSignal signal` | **Corrects doc 03 section 1.** See decision log D-007. |
| **`requestUserInteraction` does not exist** | Absent from the specification entirely | **Corrects doc 03 section 1.** Doc 02 section 3.4's contingency is dead; the caution design is unchanged. |
| The execute `AbortSignal` is a real capability | Passed to every execution | Unplanned gain. Wire it into the action semaphore as a cancellation path. |
| Return value is serialised | `Promise<any>`, put through "serialize a JavaScript value to a JSON string" | Confirms `{ content: [...] }` is a passed-through convention, not an enforced schema. Text and JSON only. |
| `toolchange` | `ModelContext` has `ontoolchange`; fires on register and unregister | The empty-registry ending depends on the unregister case. Still needs observing. |
| Annotations | `ToolAnnotations` with `boolean readOnlyHint = false` and `boolean untrustedContentHint = false` | Exactly the two we use. No destructive or idempotency hint exists. |
| `getTools(options)` | `Promise<sequence<RegisteredTool>> getTools(optional ModelContextGetToolOptions options = {})`, options carries `fromOrigins` | Cross-origin consumption needs `fromOrigins` **and** the owner's `exposedTo`. Both sides must agree. |
| `executeTool` input type | IDL says `optional object inputObject = {}` | **Discrepancy.** Our captured hackathon reference says a JSON string. Only affects code that drives tools directly, which today is the spike alone. Flagged for section 2. |

Everything in this table still gets verified. A specification is a claim about what browsers should do, and this one has moved four times in six months.

---

## 1. Test environment

| Field | Value |
|---|---|
| Date of last full verification | 2026-08-28 (Chrome only; ChatGPT still outstanding) |
| Chrome version | 151.0.7922.137, headless (`HeadlessChrome/151.0.0.0`) |
| Chrome flag used | `chrome://flags/#enable-webmcp-testing`, driven as `--enable-features=WebMCPTesting`. `DevToolsWebMCPSupport` was added for the host-invocation probes in section 2. |
| ChatGPT desktop app version | *(fill)* — **not yet run** |
| ChatGPT model(s) tested | *(fill — Sol / Terra; note that Luna has site tools disabled)* |
| OS | Linux 7.0.0-28-generic, x86_64 |
| Polyfill in use | None. Native implementation. |

**How this run was driven.** `apps/spike` served on two ports (8790 game, 8791 archive), Chrome launched headless with a throwaway profile, and the report read out of the DOM over the DevTools Protocol. Everything in section 2 marked *host-invoked* was measured through the CDP `WebMCP` domain (`WebMCP.invokeTool`), which is the closest available stand-in for an agent calling a tool; everything else is the spike's own automatic checks. Section 6 and the agent half of section 3 are still empty because they measure what a **model** does, and no model has met the page yet.

---

## 2. Core API — verified behaviour

| Question | Expected | **Observed** | Date |
|---|---|---|---|
| Is `document.modelContext` present? | Yes | Yes, an object | 2026-08-28 |
| Is `navigator.modelContext` present as an alias? | Deprecated alias | Yes, and `document.modelContext === navigator.modelContext`. Touching it logs `navigator.modelContext is deprecated. Please use document.modelContext instead.` | 2026-08-28 |
| Does `registerTool(tool, { signal })` accept an `AbortSignal`? | Yes | Yes. Resolves to `undefined`, as spec issue 234 describes. | 2026-08-28 |
| Does aborting the signal remove the tool from `getTools()`? | Yes | Yes: present before abort, absent after. **The mechanism the game is built on works.** | 2026-08-28 |
| Does `toolchange` fire on **registration**? | Yes | Yes | 2026-08-28 |
| Does `toolchange` fire on **abort**? | Yes | Yes | 2026-08-28 |
| Does `toolchange` fire when the registry becomes **empty**? | Yes | **Yes, verified empty.** Two events observed on the drain, the second with `getTools()` returning zero tools. One caveat, below: a declarative tool does not leave on abort. | 2026-08-28 — **Load-bearing — this is our ending** |
| Does `unregisterTool` exist? | No | No | 2026-08-28 |
| How many arguments does `execute` receive? | **Disputed** | **One.** Host-invoked: `argCount: 1`, second argument `undefined`. **Settled against D-007.** | 2026-08-28 |
| Does `requestUserInteraction` exist? | **Disputed** | No. There is no second argument to carry it. Doc 02 section 3.4's contingency is dead, as D-007 already assumed. | 2026-08-28 |
| Is the `execute` return value serialised to a string? | Likely | Yes. Page-side `executeTool` returned the literal string `{"content":[{"type":"text","text":"shape recorded"}]}`. | 2026-08-28 |
| Does an MCP-shaped `{ content: [...] }` return work? | Convention, not schema | Yes, passed through intact as JSON. Confirmed a convention, not an enforced schema. | 2026-08-28 |
| Is `outputSchema` supported? | No | Not present on the surface. Not exercised further; our design returns text only. | 2026-08-28 |
| Can a tool return an image or binary content? | No | Not tested; the return path serialises to a JSON string, which rules it out in practice. | 2026-08-28 — **Gates nothing, our design assumes text only** |
| Is there streaming or progress reporting? | No | None on the surface. | 2026-08-28 |

**Two additional rows this run added, both host-invoked.**

| Question | **Observed** | Date |
|---|---|---|
| How is `execute`'s input delivered to an **agent** invocation? | A plain **object**: `firstType: "object"`, value `{"probe":"from-host"}`. | 2026-08-28 |
| How is it delivered to a page-side `executeTool` call? | A **JSON string**. Passing an object throws `Failed to parse input arguments`. | 2026-08-28 |

### Notes and surprises

**`execute` takes one argument, not two, and there is no `AbortSignal` (2026-08-28).** This settles the row section 0 marked as correcting doc 03, and it settles it the other way: the IDL reading recorded in D-007 is not what Chrome 151 implements. A tool's `execute` is called with a single input object and nothing else. Verified twice, by the spike's own `executeTool` path and by a real host invocation through the CDP `WebMCP` domain, which agreed. Consequence: the cancellation path is not reachable in this browser, so `ToolCancelEvent` in `packages/protocol` and the `cancelled` outcome in the client's director are both currently unreachable. See decision log D-024 for why they are being kept rather than deleted.

**The input-shape discrepancy is real, and it resolves in our favour (2026-08-28).** Section 0 flagged that the IDL says object and our captured hackathon reference says JSON string. Both are right, about different callers: a **host** invocation delivers an object, and the page-side `executeTool` testing helper requires a JSON string. The game's tools are only ever host-invoked, so `apps/game` reading `input.designation` off an object is correct. Anything that drives tools directly - the spike today, the benchmark harness later - has to serialise.

**A declarative tool cannot be removed by aborting a signal (2026-08-28).** This is the one finding that changes a design. Aborting the controller removed every imperative tool and left the form-registered `spike_write_note` in the registry, which is why the spike's own `toolchange.empty` row reads `[info]` rather than `[pass]`: the event fired, but one tool remained. Removing the `<form>` element from the DOM removed it, fired a second `toolchange`, and `getTools()` then returned **zero**. So the empty-registry ending is real and reachable, and `ToolDirector.endSession()` has to remove the notepad form from the document as well as abort its controllers. Recorded in the director's docstring and in NEXT-STEPS so Phase 1.4 cannot miss it.

**Host-visible annotation names are normalised (2026-08-28).** A tool registered with `{ readOnlyHint: true, untrustedContentHint: false }` reaches the host as `{ readOnly: true, untrustedContent: false }`. Page-side `getTools()` still reports the `*Hint` names. Harmless for us, since we only ever author the `*Hint` form, but worth knowing before anyone matches on the host-side name.

*(Free text. Record anything that did not behave as documented, including error messages verbatim.)*

---

## 3. Annotations

| Question | **Observed** | Date |
|---|---|---|
| Is `readOnlyHint` accepted without error? | Yes, and it survives into `getTools()`. | 2026-08-28 |
| Is `untrustedContentHint` accepted without error? | Yes, and it survives into `getTools()` as `true`. | 2026-08-28 |
| Does the agent's **observable behaviour change** with `untrustedContentHint: true`? | **Still open.** Needs a model: the spike registers `spike_read_flagged` and `spike_read_plain` with identical adversarial payloads for exactly this comparison. | |
| Are destructive / idempotency hints supported? | No such hints exist. Only the two we use. | 2026-08-28 |
| Does an unknown annotation key throw, warn, or pass silently? | Passes silently. No throw, no console warning. | 2026-08-28 |

**The behaviour question is the interesting one and it is publishable.** Test it directly: return identical adversarial content from two tools, one flagged and one not, and record whether the model treats them differently. Whatever the answer, it belongs in the write-up — nobody else will have measured it.

---

## 4. Cross-origin delegation — gates the archive design (R9, OQ-2)

| Question | **Observed** | Date |
|---|---|---|
| Does `<iframe allow="tools">` permit registration in a cross-origin frame — **in Chrome**? | **Yes.** `spike_archive_manual` and `spike_archive_log` registered from `http://localhost:8791` and were visible to the parent on `:8790`. | 2026-08-28 |
| Does it work — **in ChatGPT's in-app browser**? | *(fill)* — **not yet run.** This is now the only thing keeping the flag at `same`. | **Decides `ARCHIVE_ORIGIN=cross` vs `same`** |
| Does `exposedTo: ['https://…']` correctly restrict visibility? | Yes. Exposed to the parent origin only, read from `document.referrer`. | 2026-08-28 |
| Does the consumer need `getTools({ fromOrigins })`, and does the agent do that automatically? | The consumer does need it: a default `getTools()` does not include the frame's tools. Confirmed again in the game itself on 2026-08-29. Whether an **agent** passes `fromOrigins` on its own is still open and needs a model. | 2026-08-29 |
| Do cross-origin tools appear in the top-level `toolchange` event? | Not established this run. They are absent from a default `getTools()`, so the manifest panel must call `getTools({ fromOrigins })` explicitly rather than assume the default view is complete. | 2026-08-28 (partial) — **Our manifest depends on this** |
| Is a secure context required? Any interaction with `Origin-Agent-Cluster`? | Plain `http://localhost` worked, which is a secure context by definition. Not tested on non-secure origins. | 2026-08-28 (partial) |

**A host invocation is frame-scoped, and its answer arrives as an event (2026-08-29).** The CDP `WebMCP.invokeTool` command takes a `frameId` alongside the tool name, and returns only an `invocationId`; the output comes back later on `WebMCP.toolResponded`. Both matter for anything driving cross-origin tools: a tool registered by the archive frame is invoked *against that frame*, not against the page that can see it, and a driver that reads the command's own return value sees an id rather than an answer. `tests/cross-origin-delegation.ts` does both correctly and is the reference.

**The whole delegated path was exercised end to end (2026-08-29).** `tests/cross-origin-delegation.ts` played a full four-chamber session in Chrome 151 with `apps/archive` on a second origin: `read_manual` and `read_station_log` registered there, invisible to a default `getTools()` on the game origin, visible through `fromOrigins`, invocable, and answering with the station's own content fetched back from the worker across a CORS preflight. `read_station_log` called that way recorded itself in the Durable Object, which is what lets the Archive's door open. The finale left one tool and the ending left none, counting both origins. The same script passed with the frame absent, which is the fallback.

**Decision recorded here:** `ARCHIVE_ORIGIN = same` for now. Chrome is verified and passing; the rule in `apps/archive/CLAUDE.md` requires **both** browsers, and ChatGPT's in-app browser has not been tested. Flip to `cross` the moment it is. Both paths must ship green regardless.

---

## 5. Declarative API — gates the notepad design

| Question | **Observed** | Date |
|---|---|---|
| Do `toolname` / `tooldescription` / `toolparamdescription` attributes register a tool? | **Yes.** The form appears in `getTools()` with its parameter schema built from the field names and `toolparamdescription`. | 2026-08-28 |
| Does `toolautosubmit` behave as documented? | Reaches the host as `annotations: { autosubmit: true }`. Its effect on an agent submission needs a model. | 2026-08-28 (partial) |
| Can declarative and imperative tools coexist on one page? | Yes, in one registry, indistinguishable in `getTools()` apart from the annotation. | 2026-08-28 |
| Is `SubmitEvent.agentInvoked` observable? | *(fill)* — **not yet run.** Needs a real submission; a synthetic one would only prove the human branch. | **Drives per-line authorship in the notepad** |
| Do `:tool-form-active` / `:tool-submit-active` pseudo-classes work? | *(fill)* — not tested this run. | Bonus if yes — free diegetic styling |
| Does it work in ChatGPT's in-app browser? | *(fill)* — **not yet run.** | |

---

## 6. Agent discovery and behaviour (OQ-1, R2)

| Question | **Observed** | Date |
|---|---|---|
| **Does a page with exactly one tool get reliably discovered and called?** | *(fill)* | **The front-door design depends on this** |
| Does the agent surface tools to the human unprompted, or only when asked? | *(fill)* | |
| **Does the agent have visual access to the rendered canvas?** (OQ-1) | *(fill)* | If yes, lean on Chamber II in the video |
| Does the agent read DOM text outside of tools? | *(fill)* | Bears on the screen-reader-mirror trade-off |
| Are tool descriptions truncated above any observed length? | *(fill)* | |
| How does the agent handle a tool that returns an error string? | *(fill)* | |
| Does the agent retry on `E_BUSY` sensibly? | *(fill)* | |

---

## 7. Latency measurements — feeds the Chamber III window

Measure round-trip from tool call initiation to `execute` invocation, over ≥30 calls per backend, in a real session rather than a synthetic loop.

| Backend | p50 | p90 | p95 | Max | Derived Ch. III window (`6 × p50`, clamped 12–35s) |
|---|---:|---:|---:|---:|---:|
| *(fill)* | | | | | |
| *(fill)* | | | | | |
| *(fill)* | | | | | |

**If p50 exceeds ~5 seconds on any backend we intend to support**, revisit the Chamber III design rather than only widening the clamp.

---

## 8. Budgets — as observed, not as documented

| Budget | Chrome's recommendation | **Observed enforcement** |
|---|---|---|
| Tool description | ~500 chars | **Not enforced.** 599 characters registered and read back at 599, untruncated. |
| Parameter description | ~150 chars | Not separately tested; no enforcement observed anywhere else. |
| Tool / parameter name | ~30 chars | Not enforced at registration. |
| Tool output | ~1.5 K | Not tested. Nothing in the return path truncated our outputs. |
| Maximum tools in a registry | *(unknown)* | **No ceiling at 30.** 30 of 30 registered, 30 visible. Our full game registers about a dozen. |

The budgets are recommendations about what a model reads well, not limits the browser imposes. That is an argument for keeping `apps/game`'s own budget test (D-022), not against it: nothing else will tell us when a description has grown too long.

---

## 9. Known bugs and workarounds

| Symptom | Browser / version | Workaround | Filed upstream? |
|---|---|---|---|
| `execute` receives one argument, not the two the IDL specifies, so no `AbortSignal` reaches a tool. | Chrome 151.0.7922.137 | None needed. Our adapter types the second argument as optional, so the plumbing is inert rather than broken. | Not yet — worth reporting, since the IDL and the implementation disagree. |
| A declarative form tool is not removed by aborting the registration signal. | Chrome 151.0.7922.137 | Remove the `<form>` element from the DOM. Verified to fire `toolchange` and drain the registry to zero. | Not yet — arguably correct behaviour (the tool is the element), but it is undocumented. |
| `navigator.modelContext` logs a deprecation warning on every access. | Chrome 151.0.7922.137 | Read `document.modelContext` first, which `adapter.ts` already does. Only the fallback path warns. | Known, deprecated in Chrome 150. |

---

## 10. Change log

Append-only. Every entry dated. If a re-verification changes an answer above, record the change here rather than silently editing the table.

| Date | Chrome | What changed | Impact on us |
|---|---|---|---|
| 2026-08-28 | 151.0.7922.137 | First full run of the spike. Sections 2, 3 (non-agent), 4 (Chrome), 5 (non-agent) and 8 filled. | Three findings that matter: `execute` takes **one** argument with no `AbortSignal`, reversing D-007; a declarative tool needs its **form element removed** to leave the registry, which the ending depends on; cross-origin delegation **works in Chrome**, so `apps/archive` is viable. See D-024. |

---

## 11. Final pre-submission re-verification

Run the whole spike again the day before submitting. Tick each:

- [ ] All of §2 re-verified against the current Chrome version
- [ ] `toolchange` still fires with an empty registry (the ending)
- [ ] Cross-origin path still works, or the flag is flipped to `same` and that path is green
- [ ] Declarative notepad still registers
- [ ] The front door is still discovered by all tested backends
- [ ] Chrome version and date recorded in §1 and in the README
- [ ] Anything that changed is in §10, and any affected doc has been updated
