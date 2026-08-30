# NEXT STEPS

**The handoff file.** Whoever stops working updates this before they stop. Whoever starts working reads this first and nothing else.

It answers three questions and only three: where the repo is right now, what to pick up next, and what will bite you if nobody warns you. It is not a changelog ([docs/decision-log.md](docs/decision-log.md) is), not a journal ([docs/lessons-learned.md](docs/lessons-learned.md) is), and not a plan ([docs/design/08-implementation-plan.md](docs/design/08-implementation-plan.md) is).

---

## Status

| | |
|---|---|
| **Last updated** | 2026-08-31, Ahmed Saad |
| **Branch** | `feat/judge-path-replay-access`, off `main` at `84bbcb0` |
| **Pipeline** | Green: **726 tests**, typecheck, lint, format, both `vite build`s plus the bundle budget and the palette check |
| **Sound** | **Built and heard** (D-050, D-051). Listened to on a real machine on 2026-08-30 and signed off. Plan phase 5.2 in full: eight mechanism cues, the ambience bed, four timer-keyed tension layers, a behind-the-wall thump per KEEPER tool call, and a mix with a mute. Plus **a warm unresolved theme** on top, always on, which is a deliberate departure from doc 06's chiptune direction (D-051). All synthesised in `apps/game/src/audio/`; still no asset file of any kind. `PilotView` gained `seq`, without which the detents cannot repeat. |
| **Doors and the way back** | **Every door stands in an opening you can actually walk through, and PILOT can go back through one** (D-053 to D-055). `doorways.ts` holds each room's openings room-local and its test derives the real ones from `stationCells`; two openings could not carry a door (a south face, and eleven metres of gauge bank) so the **corridors were rerouted**, not the doors. `Q` at an open door walks PILOT back into a room the pair has already cleared, drawn from the last frame the server sent for it with its doors opened by `asCleared`. Nothing crosses the wire: the clock keeps running, KEEPER's 14 tools are untouched, and KEEPER's body is not drawn in a room the session has left. Every room also got a decoration and ambient-motion pass, including the two that had never had a composition pass. |
| **Console** | **Rebuilt around the room** (D-052). The room fills the deck and is centred; panels live behind labelled tabs on the two edges, open on demand, one per edge, resizable by drag or arrow keys, closed with Escape. Deeper ground, a grain layer, a beacon sweep on the start card and the gate, and PILOT has four poses and a flickering lamp. Channel colours untouched. |
| **Interface** | **Rebuilt in real-time 3D** (D-042 to D-045). Phaser and the tile renderer are gone. The station is a lit cutaway model: rooms open at the top and on their south face, camera always to the south, four lights and no post-processing. New colour language (D-043), procedural assets and **no asset files at all** (D-044), and a console laid out as two surfaces with the room between them (D-045). |
| **Licence** | **MIT throughout again.** The vendored art pack went with the tile renderer, so `LICENSE` has no carve-out (D-044). |
| **Toured** | **25 of 25 browser checks and eleven frames, on Chrome 151, 2026-08-30.** The tour now waits on the camera's own `data-settled` flag instead of a copied `WALK_MS + SHOT_MS` (D-056), which had already gone wrong: the Archive's frame was taken at 2000ms against a 2400ms arrival, so every tour since the doors landed photographed that beat as the station from four hundred metres up, with all twenty-one assertions green. It also checks the ending's replay link, and runs a third faster. Earlier: **21 of 21 on Chrome 151.** The tour now walks back through a door and forward again, and checks the key, the cached room, the console header and that the session never notices. It found four defects, all of them in the frames and none in 700 passing tests: `E` held at a door hijacking the lean-in (it is `Q` now, edge-triggered), arriving in a chamber standing PILOT in the doorway and dragging the camera onto the outside of a wall, `BACK TO AIRLOCK` printed across `PAGE MARKED`, and the console growing a horizontal scrollbar when a room name got eight characters longer. All fixed, and captions are now checked by projection as well as by anchor. |
| **Played** | A full session end to end in Chrome 152 against a live `wrangler dev`: all four chambers, the Archive, the finale, the ending. 17/17 browser checks green on the single-origin path. **A second pass on a real machine found five more defects, all of them things a frame shows and no test does** (D-046, D-047): neighbouring rooms crowding a room shot, hidden masonry left as lit plates, the Archive's beams across its own monitor, KEEPER's body sharing a wall with a shelf rack, and every fixture carrying two stacked captions. All fixed. **A third pass then found six more in the two beats nobody had inspected** (D-048): the finale drew an empty room for its last two phases, an open door showed a crack instead of its opening, the bolt ring floated over the lintel, its count printed on top of the door sign, the room lit itself flat with the door open, and a pendant hung between the camera and the Archive monitor. All fixed. The tour now also presses `E`. **A fourth pass was *played* rather than looked at** - one person as PILOT in the browser, one driving KEEPER over the worker's HTTP tool surface - and found a twelfth that no frame could show (D-049): the Blind Panel drew `DIAL n` directly beneath `GAUGE n`, asserting the one thing that chamber exists to withhold. Fixed. |
| **Judge path** | **Built, and phase 4 is now complete** (D-058, D-059, D-062). SPECTATE on the gate screen, attract mode after twenty seconds on the landing screen, the ablation folded into the start card, and `?chamber=N` deep links that walk the real transitions rather than assigning a state. All three recorded-session surfaces share one painter, `render/monitor.ts`, which uses a 2D context so the gate never fetches Three.js. The starter prompt card is a **station requisition slip** now, doc 04's own art direction: one builder for both homes, open on the landing screen, and it hands the room over when the shift starts. |
| **Replay viewer** | **Built** (D-060). `/replay?id=<session>` reads the gzipped D1 row and draws two tracks over one axis - amber PILOT, cyan KEEPER - with the CONCORD trace underneath and the station's own monitor beside it, scrubbable. The ending links to it. It is a **projection**: `state_delta` never leaves the server, because a seed is reproducible and a replay URL is meant to be shared. |
| **Accessibility** | **Built** (D-061). Doc 08 phase 6 bar the screen-reader session. An Access panel on PILOT's edge: the room described into an `aria-live` region (off by default, never names a glyph), high contrast derived from the locked palette, and a reduce-motion switch the stage reads every frame. Colourblind verification is now a Vienot simulation over all three dichromacies in `palette.test.ts`. |
| **Bundle** | Entry **30.4KB** gzipped of a 400KB budget, up from 25.4KB across all of phases 4, 6 and 7.2. Three.js is still a **143KB** chunk fetched only when a shift starts. No images, no fonts, no asset requests at all. |
| **Archive** | Both halves still built (D-039). KEEPER calls `read_station_log`; PILOT watches the same log on a CRT drawn to a canvas. The exclusion is asserted in both directions, on the projection and again on the wire. |
| **Delegation** | Working and proved. `ARCHIVE_ORIGIN` stays `same` (D-033). `tests/cross-origin-delegation.ts` is also the screenshot tour: `SHOTS=<dir>` writes a frame at every beat and is a no-op without it. |
| **Ablation / Benchmark** | Unchanged and still published (D-040, D-041). Nothing in the last two reworks touched `bench/`, `apps/worker/`, `packages/` or the possible-worlds proof. |
| **Verify with** | `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` |
| **Run it** | `cd apps/worker && npx wrangler dev` in one shell, `cd apps/game && pnpm dev` in another. Vite proxies `/session` to `127.0.0.1:8787`, WebSocket included. |
| **Cloudflare** | Logged in. D1 database `semaphore-sessions` provisioned and migrated, local and remote. |

### What exists

| Path | State |
|---|---|
| `docs/design/` | Numbered set 00-12. **Doc 06 rewritten for 3D**; the rest unchanged. |
| `docs/` | Decision log at D-052, lessons journal live. |
| `packages/seed` | Done. Untouched. |
| `packages/protocol` | Done. Gained the `Cue` vocabulary and `PilotView.seq` for the audio layer (D-050). |
| `apps/worker/**` | Done. The only change since the 3D rework is that each chamber's `lastSound` now returns a cue beside its prose, from one branch (D-050). Four chambers, the reducer, the Archive beat, the timer, the read-only tool surface, the manual, PILOT's view socket, CONCORD, the notepad. |
| `apps/game/src/webmcp/*` | Done and untouched. Adapter, three-tier director, 14 tools, the archive frame. |
| `apps/game/src/net/*` | Done and untouched. |
| `apps/game/src/render/palette.ts` | "Low Tide": 20 colours in two locked sets. Its test now simulates protanopia, deuteranopia and tritanopia and holds the two channels apart under all three (D-061). |
| `apps/game/src/render/monitor.ts` | **Pure-ish. New** (D-058). One recorded-session picture, drawn with a 2D context and nothing else. The Archive's CRT, SPECTATE, attract mode and the replay viewer all use it, which is what keeps Three.js off the gate screen's path. |
| `apps/game/src/ui.ts` (`promptCard`) | **New** (D-062). The requisition slip, built once for the gate screen and the console drawer. The tour asserts it is whole and on screen, not merely present. |
| `apps/game/src/render/mirror.ts` | **Pure. New** (D-061). The room in words, for the accessibility mirror. Never names a glyph; `mirror.test.ts` asserts that for every chamber. |
| `apps/game/src/replay.ts` | **New** (D-060). The `/replay?id=` viewer: two tracks, the CONCORD trace, the monitor and a native range scrubber. `replayIdFrom` is the route match and refuses the path form. |
| `apps/worker/src/replay.ts` | **Pure. New** (D-060). Projects a finished session for the viewer. Drops every `state_delta`, which is where the `HIDDEN` fields are. |
| `apps/game/public/_redirects` | **New.** Pages routing for `/replay`, and only that shape. Its comment says why the nested one is not routed. |
| `apps/game/src/render/glyphs.ts` | **New.** The twelve glyphs, pixel maps carried over unchanged from `sprites.ts`. Still the one thing with hard edges. |
| `apps/game/src/render/chamber.ts` | **Pure. New.** What is in a room, as fixtures in metres. Replaces `room.ts`'s tile plans. Now also places every door from `doorways.ts`, moves KEEPER's alcove off whichever doorway is in the east wall, and holds `asCleared` (D-053, D-054). |
| `apps/game/src/render/doorways.ts` | **Pure. New** (D-053). Which wall of each room has a hole in it, room-local, per mode. Its own module because the fact belongs beside the corridors and `plan.ts` imports `chamber.ts`, so putting it there would close a cycle. Also `doorLeadsTo`, which is the whole gate for walking back. |
| `apps/game/src/render/plan.ts` | **Pure. Rewritten** in world units. Also owns `stationCells`, the one-metre rasterisation the walls resolve from, and `stationOwners`, which says whose masonry is whose so a room shot can drop the neighbours (D-046). |
| `apps/game/src/render/camera.ts` | **Pure. New.** Where the camera stands. `fitBox` frames a room corner by corner rather than by bounding sphere. Also `captionHeight`, which keeps a caption a constant fraction of the frame at any distance (D-047). |
| `apps/game/src/render/floors.ts`, `hud.ts`, `ghost.ts` | Unchanged in substance. `ghost.ts` reports a footprint in metres rather than tiles. |
| `apps/game/src/render/kit.ts` | Materials, generated textures, labels, halos. **The only place a material is created.** |
| `apps/game/src/render/fixtures.ts` | One geometry builder per fixture kind, and the converge-toward-the-server stepper. |
| `apps/game/src/render/keeper.ts` | **KEEPER's body as the registry**, and PILOT. The never-cut beat. |
| `apps/game/src/render/stage.ts` | The scene, the lights, the camera and the loop. The only file that owns a renderer. |
| `apps/game/src/ui.ts`, `style.css` | The console and the gate screen. **Rebuilt again around the room (D-052)**: `edge()` builds a tab rail and its drawer, and the layout is a deck with two edges rather than three bays. The gate carries the ablation, the split-lamp mark and the beacon sweep. |
| `apps/game/src/audio/*` | **New** (D-050, D-051). `plan.ts` is pure and tested; `engine.ts` owns the only `AudioContext`; `voices.ts` synthesises everything, including the theme's note tables; `index.ts` schedules. Has its own `CLAUDE.md`. |
| `apps/game/scripts/check-palette.mjs` | **New.** Holds `style.css` and `palette.ts` to the same values, both directions, on every build. Replaces `check-art.mjs`. |
| `tests/possible-worlds.test.ts` | Done and passing for all four chambers. Untouched. |
| `tests/cross-origin-delegation.ts` | The browser proof and the screenshot tour. Its wait is stated against the camera's own constants, `shotHolding` presses `E` so the lean-in has a frame (D-047), and it now walks back through a door and forward again (D-054). 21 checks, eleven frames. |
| `bench/` | Ablation and Cooperative Benchmark, both **re-run this session and byte-identical**, which is the determinism check passing. `benchmark.md` was a version behind on disk and is regenerated. Both entrypoints now resolve their paths from `import.meta.dirname`, so `pnpm ablation` and `pnpm benchmark` work from any directory - they used to write into `bench/bench/results` or crash. |

---

## What landed on 2026-08-31

The three review findings on the teammate's work are fixed: `deep_linked` now
reaches D1 (it was recorded on the session and died at the persistence
boundary, so the flag protected nothing), the replay's chamber labels measure
themselves, and the fullscreen button is out from under the tab rail. The page
no longer scrolls on a window that fits it: the console had a definite row plan
but only a `min-height`, so `minmax(0, 1fr)` had no space to divide and the deck
sized itself to the canvas's drawing buffer.

Then the redesign (D-063, D-064): a landing screen and a gate screen that lead
with the thesis and prove it with the split graphic, the ground palette retuned
and the type lifted, real elevation on every surface, **a guided first shift in
two layers**, and **told sequences opening and closing a shift**.

**Two things to know before touching the visuals.** The channel hues are
information and carry a measured colourblind guarantee - retuning them retunes
the legend. And `check-palette.mjs` now fails on any hex written into a rule,
not only on a token declaration, because twenty inline colours had accumulated
behind the old check and eleven of them silently kept the previous palette.

## Do this next

In order. Each item ends somewhere the pipeline is green and the repo is committable.

### 0. What this session closed, so nobody re-does it

Doc 08 **phase 4 (the judge path), phase 6 (accessibility) and phase 7.2 (the
replay viewer)** are built and verified in Chrome (D-056 to D-062). **Phase 4 is
complete**, including the starter prompt card's art.

Four defects were found and fixed on the way, and three of them were only
findable by running the thing:

- The tour photographed the Archive beat from four hundred metres up, in runs
  whose twenty-one assertions were green (D-056).
- `inspect({target})` told an agent `Received .` (D-057).
- A failed fetch drew `NO TAPE`, which is a **prop**, so nothing reported a
  failure and the first check passed on it (D-058).
- The replay page was blank in production and perfect in development, twice over
  (D-060).
- The starter prompt card, which is on the never-cut list, existed as two
  hand-assembled copies and the gate's had silently lost its fallback line
  (D-062).

**The stale-server trap cost the first hour and will cost yours.** Two previous
sessions had left a `vite` on 5173 and a Chrome on 9222. The tour ran green
against a seven-hour-old build and reported failures that were not in this
checkout. Before trusting any browser run: `ss -ltnp | grep -E ':(5173|8787|9222)'`,
kill what is there, and start Vite with `--strictPort` so it cannot quietly
land on 5175.

### 1. Keep playing and fixing, and play it properly this time

**Still the item to pick up first.** Five sittings have now produced sixteen
defects that 700 passing tests did not see (D-046 to D-049, D-054), and the rate
has not fallen off.

**The fourth sitting changed how this should be done, and the change matters
more than the defect it found.** The first three were one person looking at
frames. The fourth was two roles: a person as PILOT in the browser, and someone
driving KEEPER over the worker's HTTP tool surface, actually asking "which lever
has the spiral" and acting on the answer. That found a defect no frame could
ever have shown, because the frame was unambiguous and well composed and *wrong*
(D-049). **Play it that way.** The game is about describing a room to somebody
who cannot see it, so that is the instrument.

**You do not need WebMCP or a model to play KEEPER.** The entire agent tool
surface is plain HTTP on the worker, so a second person, a terminal, or an agent
with a shell can drive it against the same seed the browser is on:

```bash
B=http://127.0.0.1:8787/session/play-a          # ?seed=play-a in the browser
curl -sX POST $B/begin_shift -H 'content-type: application/json' \
  -d '{"designation":"KEEPER"}'                 # then PILOT clicks a length
curl -s "$B/manual?section=index"
curl -s "$B/describe"
curl -sX POST $B/pull_lever -H 'content-type: application/json' \
  -d '{"lever_id":"lever_c"}'
```

Route names are the tool names; `apps/worker/src/Session.ts` line 136 onward is
the list. Note the order: KEEPER calls `begin_shift` **first**, and only then
does PILOT pick a session length, or `start` answers `E_NO_SESSION`. Pick
`practice` to look at rooms without a clock.

**Bring it up.** Two shells, then a browser:

```bash
cd apps/worker && npx wrangler dev --port 8787   # shell one
cd apps/game   && pnpm dev                       # shell two, serves :5173
```

Vite proxies `/session` to the worker, WebSocket included. Open
`http://localhost:5173/?seed=play-a`, and paste the starter prompt from the
console's YOUR AGENT panel into whichever agent is playing KEEPER. The seed in
the URL is what lets a second pair of eyes join the same session.

**The mid-play session from the last handoff is gone.** Seed
`play-1788042567794` answers `E_NO_SESSION`; the Durable Object's local state
did not survive. Nothing downstream depended on it.

**What to actually do while playing.** Walk into every corner of every room with
**WASD**, hold **E** on everything that will take it, press **Q** at every open
door and walk the station backwards, press **M** in each chamber, and go
**fullscreen with F** - the console is a different shape there
and has had far less looking-at. Four faults are worth watching for by name:
geometry standing inside other geometry, text printed on top of text, anything
hanging between the camera and the thing a room exists for, and - new with
D-049 - **any two fixtures whose arrangement implies a relation the renderer
cannot know**.

**Then run the tour and read every frame.**

```bash
SHOTS=/tmp/tour ARCHIVE="" GAME=http://localhost:5173 \
  WORKER=http://127.0.0.1:8787 CDP=http://127.0.0.1:9222 \
  node --experimental-strip-types tests/cross-origin-delegation.ts
```

It needs a Chrome on port 9222. Headless works and is what the last two runs
used:

```bash
google-chrome-stable --headless=new --remote-debugging-port=9222 \
  --user-data-dir=$(mktemp -d) \
  --enable-features=WebMCPTesting,DevToolsWebMCPSupport about:blank
```

Ten frames in about a minute, and 17 assertions alongside them. **Open all ten
and crop into the corners.** Eleven of the twelve defects were already present
in a frame that had been captured and not read.

**One known-unverified thing, and it now has numbers.** Every tuned renderer
constant - ambient at 0.62, the doorway spotlight at 110, the caption's 0.032 of
viewport height - was set by looking at a 1400x900 desktop window, and two
things have now been measured going wrong at narrower ones. See item 2a. (The
Signal Room and the Concord Lock have had their composition pass, D-055.)

**Four new surfaces have been proved but never played.** The Access panel's
mirror (is a room actually describable from it, by somebody who cannot see the
canvas?), SPECTATE and attract mode on the gate (does a judge who lands there
watch it?), the replay viewer (does the two-track picture say anything to
somebody who was not in the session?), and `?chamber=N`. Every one of them
passed a scripted check and none has met a person.

**And `Q` is new.** Walking back through an open door (D-054) has been proved in
a browser by the tour but never *played*. What a script cannot tell you: whether
anybody finds it, whether going back is ever worth the clock it costs, and
whether an empty alcove where KEEPER was reads as the beat it is meant to be or
as a missing body.

**The audio has been heard and signed off** (2026-08-30), so this is no longer
the open risk it was for the length of one session. What is *not* yet separately
confirmed is the narrow thing Chamber II depends on: whether eight detents at
180ms are countable **by ear** by somebody who does not already know the answer.
That one is a playtest question rather than a listening one - see item 2 - and
`MECH` on the mixer is the fader to reach for if they are hard to pick out.

### 2a. Decide what captions do in a narrow window [measured, not fixed]

Two separate crowding problems, both from the same cause: a caption is a fixed
fraction of the **viewport height** by construction (`CAPTION_SCREEN`), so a
narrower window brings captions together without making them smaller. Neither is
an authoring mistake and neither is new.

- **The Blind Panel's gauge and dial banks touch at 4:3 and 1:1.** Four captions
  across an eleven-metre wall. Measured by the new projection test, which is
  restricted to 16:9 for exactly this reason and says so in its own comment.
  Worst pair at 4:3: `gauge-3|gauge-4`, 0.2263 of viewport height apart where
  0.2304 is needed. It is that close. Widening the test's aspect list is the
  check for whatever fix is chosen; do not widen it before fixing something.
- **The console's room name ellipsises below about 800px.** Correct behaviour
  now the grid column is constrained (D-054), but `CONCORD LOCK - REVISITED` is
  24 characters into a slot that holds about 14 at that width, and the marker is
  the half that gets cut. The floor rail carries the same fact as a pip, so
  nothing is lost, but a phone is an explicit target.

Both want the same decision: whether a caption should shrink with the window, or
whether a bank should thin out, or whether the rail should drop a part. Do not
guess at it - the numbers above are cheap to re-measure.

### 2. Playtest with humans [needs people]

The thing item 1 cannot do: item 1 is one person who knows where everything is,
and that person cannot be surprised by the game. Doc 08 section 0.1
wants six. What a script cannot answer: whether it is fun, whether a cold
player's description of a glyph reaches the manual's canonical name, and whether
the vandalised Signal Room page actually fools anybody. The glyph vocabulary's
`plainNames` are placeholders until this happens.

**Three questions the rework specifically added.** Does the cutaway model read
as a building you are inside, or as a diorama you are outside? Does anybody find
**M**? And does KEEPER's body land - do people notice the arms changing at a
chamber boundary without being told to look?

**Three more from the doors** (D-053 to D-055). Does anybody find **Q**, and do
they think to go back at all? Does a door on a side wall read as a way out, given
the camera always stands to the south and sees every one of them nearly edge-on -
or is the hazard paint on the floor doing all of the work? And does a ladder up a
wall actually make a room read as tall?

### 3. Run the spike in ChatGPT's in-app browser, and meet a real model [needs a human]

Unchanged, and the rework adds one thing to check: **WebGL performance in the
in-app browser on a phone.** The renderer is deliberately cheap - four lights,
no post-processing, one 1024px shadow map, device-pixel ratio capped - but none
of that has been measured anywhere except desktop Chrome. If it is slow there,
the first things to drop are shadows and the dust cloud, in that order.

Two spike rows still decide things: `crossorigin.delegation`, which flips
`ARCHIVE_ORIGIN`, and `declarative.agentinvoked`, which the notepad's per-line
authorship depends on.

### 4. Bring doc 06 section 11 in line with what the client actually plays

Sound is **built, heard and signed off** (D-050, D-051), so phase 5.2 is closed
and this is the paperwork it leaves behind.

**Doc 06 section 11 and the code now disagree, deliberately.** The doc asks for
a chiptune score. The client plays a warm, unresolved instrumental as its
resting state with the chiptune tension layers arriving on top of it as the
clock drains. The code is the newer decision and the one that was listened to,
so the doc is the half that should move. Rewriting that section is maybe an
hour, and doc 09's shot list and doc 10's submission copy should be checked for
anything that describes the score while somebody is in there.

If a later ear does find the arpeggio fighting the theme, **cut the arpeggio
first and the pulse second** - the cues, the bed and the ducking carry the
`AUDIBLE` channel and none of that may be cut, and the theme is the station's
character.

### 5. Decide what to do about the two things the ablation found

Numbers and reasoning in D-040. Neither is a bug, which is why both are a
decision rather than a task. **Chamber II falls off a cliff at a slow agent
rhythm** (4.00 of four at 4s, 3.80 at 6s, 2.00 at 9s), and **the Signal Room's
1,956 figure holds against blind guessing only.** Do not tune the drift rate
until doc 11 sections 6 and 7 carry measured round trips; then re-run both the
ablation and the benchmark.

### 6. Deploy the archive origin as its own Pages project

The code is done and proved locally; the second Cloudflare Pages project and its
preview-deploy wiring are not. `VITE_ARCHIVE_ORIGIN` and the worker's
`ALLOWED_ORIGINS` are the only two settings involved.

### 7. Point a model at the benchmark [blocked on step 3]

The harness, the suite, the partner axis and the report all exist and run in
seconds with zero tokens. Budget the tokens before running, not after.

## Things that will bite you

### The renderer

- **A renderer's defects are in the frame, and the only instrument that sees them is a frame.** Eleven defects across three sittings (D-046 to D-048) were each invisible to 650 passing tests, and two of them were *introduced by the fix for another*. When a room looks wrong, do not reason about the plan: take the frame, crop it, and if that is not enough, name the scene graph and dump it. Every object now carries a name (`building`, `room`, `dressing`, `dress:<kind>`, `fix:<id>`) precisely so that dump is one call rather than a bisection.
- **A test written around a bug you already found will not find its sibling.** The dressing-overlap check compared centre points and skipped any fixture above 1.4m, which is exactly why it missed a 4m monitor with two cabinets buried in it. Widen the check to what the rule actually says, not to what reproduces the one case.
- **A test written from the code rather than from the intent will guard the bug.** A green unit test asserted that the finale had no room to draw. That was the defect: the last two beats of the game rendered an empty shell for as long as the 3D client had existed, and the test said so approvingly.
- **Hidden has to mean gone.** An instance scaled to a hair in y keeps a full-size lit top face. Two of the eleven were introduced by the fix for another, and both were of this shape: geometry made *conditionally* absent, and not absent enough.
- **Prefer a relation to a number.** "Nothing hangs between the camera and the Archive's screen" as a coordinate range needs re-deriving whenever either end moves; as a ray from `roomShot`'s eye to the plane of the monitor it is true by construction, and it caught a fault in itself on its first run.
- **Run the tour and look at the frames before calling a rendering change done.** `SHOTS=/tmp/tour ARCHIVE="" GAME=http://localhost:5173 node --experimental-strip-types tests/cross-origin-delegation.ts` plays a whole session against live servers in about a minute. Three renderers in a row have shipped green and produced defects in their first tour that six hundred unit tests could not see. Servers and flags are in the header of that file.
- **The tour's wait must stay longer than `WALK_MS + SHOT_MS`** in `render/camera.ts`. A frame grabbed early is the previous room with the next room's name over it, or the whole building from four hundred metres up. Both have happened.
- **Fog is squared in distance, so it is a wide-shot setting.** A density that is imperceptible in a room erases the building when the camera pulls back. If the wide shot looks broken, check the fog before the lights.
- **Additive blending has no upper bound.** A translucent double-sided cone over a dark room accumulates front face over back face into a solid grey shape. "Subtle" is an opacity times the number of surfaces the ray crosses, not an opacity.
- **A door may never be placed on a room's south wall.** Every room is open on that face so the camera can see in; a door there hangs in the opening rather than reading as a way out. Two corridors used to arrive at walls that could not carry a door, and the fix was to move the corridors (D-053): **the building's shape is the cheapest thing in the model to change and it is the last thing anybody thinks of changing.**
- **A caption on a side wall can only be separated from another one vertically.** A wall running away from the camera barely moves across the frame, so three metres of separation in the room is a dozen pixels on screen. The anchor check in `chamber.test.ts` measures metres and cannot see this; the projection check beside it can, and only at 16:9 (item 2a).
- **`length` is a run along x and `height` is a rise, and the two fields exist so nothing has to guess which.** A cable's drop was held in `length` for three renderers, so the check that keeps dressing inside its room was measuring every cable sideways through the wall and passed only because no cable had been hung near enough to one. Two separate checks were reading that field; moving one without the other would have silently weakened the other.
- **Two positions measured from different origins will disagree the first time either moves.** The Archive's screen was hung from the room's back wall and its housing from its own centre, which put the picture inside the casing. Both come from `MONITOR_DEPTH` now.
- **Every material comes from `kit.ts`.** A `new MeshStandardMaterial` anywhere else is a fifteenth colour arriving where nothing will notice, and it also leaks GPU memory across a session because nothing else disposes it.
- **`scripts/check-palette.mjs` is the only thing that notices a colour changed in `style.css` and not in `palette.ts`.** The drift does not throw; the console just quietly stops matching the room.
- **Never import Three.js from a module the entry chunk reaches.** `render/station.ts`'s dynamic `import("./stage.js")` is the boundary. `scripts/check-bundle.mjs` fails the build when it is crossed, which is the only thing that will tell you.
- **A sentinel guard is only as good as the number of ways a value can arrive.** The camera's "do not hold the building on the first room" guard tested `wasOn !== undefined`, and the lobby frame set it to `null` first, so every room shot in the first tour was the wide shot.

### The instruments that watch the game

- **A stale dev server is the most expensive bug in this repo and it does not look like a bug.** A `vite` from a previous session on 5173 and a Chrome on 9222 made a fresh tour report seven failures that existed in nobody's checkout. Check the ports and use `--strictPort`; Vite silently walking to 5175 is what makes this survivable-looking.
- **A number copied out of another module cannot hear it change** (D-056). The tour's screenshot wait was a hand-typed `WALK_MS + SHOT_MS` living in a different package from the constants, and it was already 400ms short. It now polls `data-settled`, which the stage sets from the easing itself.
- **A prop is not an error** (D-058). `NO TAPE` is what the monitor is *meant* to draw for a null recording, so a broken fetch produced a screen nothing reported and a check asking "is anything lit" passed on it. Assert the thing, never its brightness.
- **A check that matches substrings will fail on a word that contains one.** The mirror's glyph test tripped on `cross` inside `across`. Narrowing the match is the fix; widening what counts as a leak never is.
- **A key event without its `char` half does not activate a button.** A keyboard-accessibility check reported the drawer unreachable when the drawer was fine. Dispatch `rawKeyDown`, `char` and `keyUp`, or the harness is testing itself.

### The console

- **A CSS grid column defaults to `auto`, which floors at its content's min-content width.** The console is a grid and its rail is a flex row of nowrap parts, so with no `grid-template-columns` the rail sized itself to its contents and took the page with it - a horizontal scrollbar and the east tab rail off the edge of the window, the moment a room name grew by eight characters. `min-width: 0` on the shrinkable child cannot help: the column has already grown to give it room.
- **A drawer overlays the deck and must never push it.** The camera frames against the viewport's measured shape, so a panel that squeezed it would re-frame the shot every time somebody opened one, and the room would jump.
- **`display: flex` beats the user agent's `[hidden]`.** The first build of the drawers came up with both of them open and empty, because `drawer.hidden = true` did nothing against `display: flex`.
- **The palette was not what made the page feel flat** (D-052). Depth, layering and motion were. Check that what is being fixed is actually a colour before touching a set that carries the design law and the colourblind guarantee.
- **A body at rest must not be a body at zero.** Every walk term multiplies by speed, so a standing figure was perfectly still, which reads as a broken renderer rather than as a person waiting.

### The audio

- **A cue fires on `PilotView.seq`, never on a diff of the facts.** Two rotations that each register three clicks produce frames identical in every field, and PILOT has to hear six detents. In Chamber II the count *is* the puzzle, so hearing the second rotation as silence is a wrong answer, not a missed flourish.
- **The worker picks the cue, from the same branch that writes the subtitle.** Each chamber's `lastSound` returns both. Splitting them is how a cue ends up with no text equivalent, which deaf players depend on and doc 06 requires.
- **Nothing in `voices.ts` may decide anything.** Web Audio does not exist in the test environment, so a decision left in a node graph is a decision no test can reach. It goes in `plan.ts`.
- **`new AudioContext()` throws on a machine with no audio device, and a headless browser is one.** The screenshot tour clicks the same launch card the player does. `start()` catches and leaves the handle inert, and it must keep doing so.
- **The whole layer has been verified not to throw and never actually listened to.** Nothing in the pipeline can hear.

### The game

- **Alignment is a claim.** The renderer may not arrange two fixtures so that their arrangement asserts a relation it cannot know. The Blind Panel drew `DIAL n` directly beneath `GAUGE n` in the one chamber whose secret is that the wiring is a random permutation, and a playtester read the pairing off the frame and reported it to KEEPER as fact (D-049). Every test in that file was about a fixture's own fields; not one was about the relation between two, which is where the defect lived.
- **A caption that is only a value is not a name.** A gauge captioned `0/6` gave PILOT no word for *which* `0/6`, so the nearest handle was the dial caption beneath it - the wrong noun for the wrong object. Anything PILOT has to say out loud needs something to say it with.
- **A chamber's solve does not always change `machine.chamber`.** The Blind Panel's solve moves the phase to `ARCHIVE` and leaves the chamber name in place (D-025). Anything watching for "a chamber was cleared" has to watch the phase. `roomPlan` and `roomTitle` both check `ARCHIVE` before the chamber for this reason, and they must stay in step.
- **`pilotTrack` and `keeperEntries` are a matched pair and must be edited as one.** They are the Archive's whole mechanic. Widening either hands one party the other's half. Asserted in both directions in `archive.test.ts` and again on the wire in `pilot.test.ts`.
- **A default `getTools()` does not include a cross-origin frame's tools**, even when `allow="tools"` and `exposedTo` are both satisfied. The consumer has to pass `fromOrigins` (doc 11 section 4).
- **The archive frame's fetches need `ALLOWED_ORIGINS` in `apps/worker/.dev.vars`,** which is git-ignored, so every checkout writes its own - **and it must name the port you are actually serving the game on.** Without it the manual silently does not exist and the console says CORS, not "the game is broken".
- **A declarative tool leaves the registry only when its element leaves the DOM** (D-024, D-028). Aborting a signal will not do it.
- **One `AbortController` per delegated tool, never one per message** (D-033).
- **A read-only route must not take the semaphore** (D-019, D-027). The CONCORD meter is polled every 2.5 seconds.
- **`describe_chamber` must answer every phase, not just the chambers.**
- **Read-only calls are not in the session log.** Deliberate (D-019).
- **Nothing puzzle-critical goes into the DOM.** The console holds public copy, things KEEPER can obtain for itself, and `SHARED`/`AUDIBLE` facts. Everything `VISUAL` is a label sprite inside the canvas.
- **Nothing in `apps/game` outside `adapter.ts` may touch `modelContext`.** A grep that returns a second file is a defect.

### Instruments and proofs

- **A metric that does not separate the thing it claims to separate is not evidence.** Two have now been built and deleted rather than reported: the benchmark's grounding latency, and the glyph test's "most confusable pair". Check that a new metric moves across its axis before it goes in a table.
- **Adding a condition to `bench/session.ts` will silently move every published ablation number** unless it leaves the run's random stream alone. Diff `ablation.md` after any change here; the tests will not tell you.
- **A test with a fabricated input can protect a bug instead of catching it.** `roomTitle` had no `ARCHIVE` guard and a hand-written view found it, but only because the same test also asserted the shape the worker really sends.
- Never weaken an asymmetry check to go green. It is the one class of change that is never accepted.
- The possible-worlds proof is scoped, deliberately (D-009). If a chamber fails it, the chamber is wrong, not the test.
- **`tests/` is a workspace package** (`@semaphore/tests`); import `@semaphore/worker/chambers/airlock`, not a relative path.
- **D1 migrations are not automatic.** Run both the local and `--remote` `wrangler d1 execute` from `apps/worker/`. The local database in this checkout had **no `sessions` table at all** until this session applied it, which nothing noticed because the only writer swallows its failure on purpose so a finished session never breaks on a logging error.
- **D1 hands a BLOB back as an array of byte numbers**, not the `ArrayBuffer` the types say or the `Uint8Array` that was written. `new Blob([thatArray])` does not fail; it stringifies it, and the only symptom is `Decompression failed` from a line that looks right.
- **`base: "./"` means no route may be nested** (D-060). Relative asset paths resolve against the URL's directory, so `/replay/abc` asks for `/replay/assets/...` and comes up blank - in production only, since Vite serves an absolute entry in development. Any new page route is a query on an existing path, or it is a build-config decision.
- **A page and an API may not share a URL when the API sets `cache-control`.** A navigation to a URL the page had already fetched was served the cached JSON: one request, 200, no modules loaded.

---

## Waiting on

| Item | Owner | Note |
|---|---|---|
| Playtesters | Human | Doc 08 section 0.1 wants six. The one task that does not parallelise, and the interface is now the one worth testing. |
| Spike in ChatGPT's in-app browser | Human | Still the only thing keeping `ARCHIVE_ORIGIN` at `same`. Now also the only way to know whether the 3D renderer performs there. |
| A real agent session | Human | Doc 11 sections 6 and 7 stay empty until a model meets the page. |
| Doc 06 section 11 rewritten | Whoever holds the design | It still describes a chiptune score. The client plays a warm instrumental with chiptune tension over it (D-051), heard and signed off. The doc is the half that has to move. |
| A second Pages project for `apps/archive` | Human | Needs a Cloudflare project and preview-deploy wiring. |
| Socket behaviour through Cloudflare's edge | Human | Verified against local `workerd` only. |
| Chamber II's drift rate | Whoever holds the design | Blocked on doc 11 sections 6 and 7. Re-run `ablation` and `benchmark` after any change. |
| Per-model benchmark numbers | Human | Harness done and free to run. Needs a backend behind the tool surface. |
| A real screen reader | Human | The accessibility mirror is built and checked against the accessibility tree, never against NVDA or VoiceOver. Doc 08 phase 6's last line. |
| Repo made public | Human | Deliberately deferred to just before the deadline. |
| Doc 03 section 10 wording fix | Whoever writes submission copy | It claims "server-generated ID"; the real guarantee is zero PII (D-023). |
| Submission copy refresh | Whoever writes it | Doc 10 section 3.4 and doc 09's shot list both describe the pixel renderer and its files. The claims are unchanged; the file paths and the pictures are not. |

---

## How to leave this file

Before you stop working, rewrite **Status**, **Do this next** and **Waiting on** so they describe the repo as it is, not as you found it. Add to **Things that will bite you** only what genuinely cost you time. Keep the whole file readable in one sitting: a handoff nobody reads because it is long is worse than no handoff.
