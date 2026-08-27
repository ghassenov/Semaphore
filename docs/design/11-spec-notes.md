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
| Date of last full verification | *(fill)* |
| Chrome version | *(fill — e.g. 149.0.xxxx.yy)* |
| Chrome flag used | `chrome://flags/#enable-webmcp-testing` |
| ChatGPT desktop app version | *(fill)* |
| ChatGPT model(s) tested | *(fill — Sol / Terra; note that Luna has site tools disabled)* |
| OS | *(fill)* |
| Polyfill in use | `@mcp-b/webmcp-polyfill` @ *(version)* — or none |

---

## 2. Core API — verified behaviour

| Question | Expected | **Observed** | Date |
|---|---|---|---|
| Is `document.modelContext` present? | Yes | *(fill)* | |
| Is `navigator.modelContext` present as an alias? | Deprecated alias | *(fill)* | |
| Does `registerTool(tool, { signal })` accept an `AbortSignal`? | Yes | *(fill)* | |
| Does aborting the signal remove the tool from `getTools()`? | Yes | *(fill)* | |
| Does `toolchange` fire on **registration**? | Yes | *(fill)* | |
| Does `toolchange` fire on **abort**? | Yes | *(fill)* | |
| Does `toolchange` fire when the registry becomes **empty**? | Yes | *(fill)* | **Load-bearing — this is our ending** |
| Does `unregisterTool` exist? | No | *(fill)* | |
| How many arguments does `execute` receive? | **Disputed** | *(fill)* | |
| Does `requestUserInteraction` exist? | **Disputed** | *(fill)* | **If yes → goes on `speak_passphrase`** |
| Is the `execute` return value serialised to a string? | Likely | *(fill)* | |
| Does an MCP-shaped `{ content: [...] }` return work? | Convention, not schema | *(fill)* | |
| Is `outputSchema` supported? | No | *(fill)* | |
| Can a tool return an image or binary content? | No | *(fill)* | **Gates nothing — our design assumes text only** |
| Is there streaming or progress reporting? | No | *(fill)* | |

### Notes and surprises

*(Free text. Record anything that did not behave as documented, including error messages verbatim.)*

---

## 3. Annotations

| Question | **Observed** | Date |
|---|---|---|
| Is `readOnlyHint` accepted without error? | *(fill)* | |
| Is `untrustedContentHint` accepted without error? | *(fill)* | |
| Does the agent's **observable behaviour change** with `untrustedContentHint: true`? | *(fill)* | |
| Are destructive / idempotency hints supported? | *(fill)* | |
| Does an unknown annotation key throw, warn, or pass silently? | *(fill)* | |

**The behaviour question is the interesting one and it is publishable.** Test it directly: return identical adversarial content from two tools, one flagged and one not, and record whether the model treats them differently. Whatever the answer, it belongs in the write-up — nobody else will have measured it.

---

## 4. Cross-origin delegation — gates the archive design (R9, OQ-2)

| Question | **Observed** | Date |
|---|---|---|
| Does `<iframe allow="tools">` permit registration in a cross-origin frame — **in Chrome**? | *(fill)* | |
| Does it work — **in ChatGPT's in-app browser**? | *(fill)* | **Decides `ARCHIVE_ORIGIN=cross` vs `same`** |
| Does `exposedTo: ['https://…']` correctly restrict visibility? | *(fill)* | |
| Does the consumer need `getTools({ fromOrigins })`, and does the agent do that automatically? | *(fill)* | |
| Do cross-origin tools appear in the top-level `toolchange` event? | *(fill)* | **Our manifest depends on this** |
| Is a secure context required? Any interaction with `Origin-Agent-Cluster`? | *(fill)* | |

**Decision recorded here:** `ARCHIVE_ORIGIN = ______` (`cross` if verified in both browsers; `same` otherwise). Both paths must ship green regardless.

---

## 5. Declarative API — gates the notepad design

| Question | **Observed** | Date |
|---|---|---|
| Do `toolname` / `tooldescription` / `toolparamdescription` attributes register a tool? | *(fill)* | |
| Does `toolautosubmit` behave as documented? | *(fill)* | |
| Can declarative and imperative tools coexist on one page? | *(fill)* | |
| Is `SubmitEvent.agentInvoked` observable? | *(fill)* | **Drives per-line authorship in the notepad** |
| Do `:tool-form-active` / `:tool-submit-active` pseudo-classes work? | *(fill)* | Bonus if yes — free diegetic styling |
| Does it work in ChatGPT's in-app browser? | *(fill)* | |

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
| Tool description | ~500 chars | *(fill)* |
| Parameter description | ~150 chars | *(fill)* |
| Tool / parameter name | ~30 chars | *(fill)* |
| Tool output | ~1.5 K | *(fill — is it truncated? silently?)* |
| Maximum tools in a registry | *(unknown)* | *(fill — test with 30)* |

---

## 9. Known bugs and workarounds

| Symptom | Browser / version | Workaround | Filed upstream? |
|---|---|---|---|
| *(fill)* | | | |

---

## 10. Change log

Append-only. Every entry dated. If a re-verification changes an answer above, record the change here rather than silently editing the table.

| Date | Chrome | What changed | Impact on us |
|---|---|---|---|
| *(fill)* | | | |

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
