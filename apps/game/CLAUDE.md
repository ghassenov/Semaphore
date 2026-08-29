# apps/game/

The client. It renders PILOT's world in real-time 3D and hosts the WebMCP tool director. It is a **view**, not an authority.

## Local rules

### The design law

- **The client never possesses the solution.** It renders `projectForPilot` frames pushed over the WebSocket and nothing else. No `HIDDEN` field, no puzzle answer, and no server-side derivation ever ships to the browser. If a feature seems to need one, the feature is wrong.
- **Puzzle-critical visuals render to the canvas, never to DOM.** There must be no text node holding a glyph, a gauge reading, or a cipher offset. In 3D those captions are **label sprites inside the WebGL canvas** (`render/kit.ts`), which is the same rule with a different mechanism, not a relaxation of it. The one deliberate exception is the accessibility mirror, which ships behind an explicit toggle and is documented as a trade-off.
- **The console is DOM and the room is the canvas, and a panel moves out only after it is checked against that rule one at a time** (D-036). A readout may be DOM for exactly three reasons: it is public copy, it is something KEEPER can obtain for itself, or it is `SHARED`/`AUDIBLE` by construction. `ui.ts`'s header carries the audit; extend it rather than reasoning afresh. The caption band over the viewport is covered by it: phase copy, derived from `view.phase`, which the rail already prints.
- **A glyph's name is KEEPER's half of the split and never appears on PILOT's side.** A lever captioned "spiral" deletes the chamber, because reading a label aloud is not describing a shape. Fixtures carry a lever's position or a key's number - what KEEPER can be told to act on - and wear the glyph as a drawing. `chamber.test.ts` asserts no caption anywhere contains a glyph id.

### WebMCP

- **All spec contact lives in `src/webmcp/adapter.ts`.** Nothing else in this app may touch `document.modelContext` or `navigator.modelContext`. Feature-detect `document` first, then `navigator`. A grep for `modelContext` that returns any other source file is a defect.
- **Tools are authored as data plus a `run` that returns a string** (`src/webmcp/tool.ts`). The spec's result envelope, the timing, and the never-throw-at-an-agent rule are applied once, by the director's instrumentation wrapper. A tool module never builds a `content` array.
- **Where a tool is registered may change; when it exists may not** (D-033). With `VITE_ARCHIVE_ORIGIN` set, `read_manual` and `read_station_log` are registered by a hidden cross-origin frame rather than by this page, and the director tells that frame which of them should exist right now. The tier tables stay the one place that decides lifetime. Both paths ship green, and the fallback is the default until delegation is verified in ChatGPT's in-app browser.
- **The manifest plate must ask for the archive origin's tools by name.** A default `getTools()` does not include a frame's tools even when both delegation gates are satisfied (doc 11 section 4), so `listToolNames` takes `fromOrigins`. A plate that under-reports KEEPER's faculties is worse than no plate, because the plate exists to prove the body is not a lie.
- **The registry follows the server, never a guess** (D-021). `ToolDirector.applyState` is the only thing that mounts or tears down a tier, and it reads the machine state the worker put on the response. Nothing infers a chamber from what it just called.
- **`toolchange` drives the UI from real registry state.** The manifest panel and KEEPER's body both render from an actual `await getTools()` call inside one listener. Never from a parallel guess about what was just registered.
- **`write_note` is declarative and `read_note` is imperative, and that is the rule, not an inconsistency** (doc 03 section 8, D-028). Declarative for a tool that is a form the human can also submit; imperative for pure agent capability. A declarative tool leaves the registry only when its element leaves the DOM, so the director owns that element and the ending needs both mechanisms.
- **No WebMCP means the gate screen, never a throw.** For some judges that screen is the entire submission. It carries the pitch, the split-lamp mark, the ablation chart, and setup steps for both browsers.
- Tool descriptions are agent-facing UI copy. Budgets are 500 characters per description, 150 per parameter description, 30 per name, 1500 per output, enforced by `src/webmcp/budgets.test.ts` over the tool objects rather than by a lint rule over the source (D-022). That test also pins the annotations, so adding a tool means adding it to the mutating or untrusted-content list there, deliberately.

### Colour

- **Colour is information architecture, and it never bends for a nice frame.** Lamplight: only PILOT perceives this. Tidewater: only KEEPER. Pearl: both. `AUDIBLE` is pearl with a double ring. Every channel-coded element also carries its shape marker, because colour alone must never carry information.
- **In three dimensions a channel is a light, not a fill** (D-043). A room whose puzzle is only PILOT's is lit warm, a room only KEEPER can act in is lit cold, a room both work in is lit neutral. That is the same law applied to the building, and it is the first thing on screen in a chamber.
- **The palette is locked at twenty colours in two sets** (D-043). Channel colours carry information; ground and material colours carry none and exist so the two channel hues are the only saturated things in a frame. Adding a twenty-first is a decision-log entry, not a judgement call. There is no green: success is a pearl flash and a shape change.
- **`style.css` restates every palette value and `scripts/check-palette.mjs` proves it, in both directions.** The console is styled by CSS and the station is rendered by WebGL and neither can read the other's source, so a colour changed in one and not the other is a console that has quietly stopped matching the room beside it. It fails the build.
- **Chroma is scarce, deliberately.** The ground is near-neutral and cold so the only saturated things in a frame are facts. A panel or a prop that takes a hue because it looked flat is a thing competing with the information. **Decoration that competes is not decoration.**

### The renderer

- **Three.js is imported only by `render/stage.ts` and the modules it pulls in, and `render/station.ts` reaches all of it through a dynamic `import()`** (D-026's rule, D-042's engine). The engine is 143KB gzipped and the gate screen must never fetch it. A static import from an eagerly loaded module undoes that silently; `scripts/check-bundle.mjs` fails the build when it does.
- **What a frame contains is decided in `render/chamber.ts`, `plan.ts`, `camera.ts`, `floors.ts`, `ghost.ts` and `hud.ts`, which are pure.** `stage.ts`, `fixtures.ts`, `keeper.ts` and `kit.ts` only build, light and move. Anything that can be decided without a renderer is decided in the pure half, because that is the half that can be wrong in a way nobody notices by looking, and it is the half with tests.
- **The station is a cutaway model: every room is open at the top and open on its south face, and the camera never leaves the south side** (D-042). The instant it does, a wall that was deliberately not built becomes a hole in the world. `camera.test.ts` asserts it at every window shape. This is also why **a door is never placed on a room's south wall**: it would hang in the opening the camera looks through.
- **A room does not know where it is** (D-035, and it still holds). `chamber.ts` emits fixture coordinates local to a room's own floor; `plan.ts` places the rooms. A chamber that reached for an absolute station coordinate could not be moved or resized.
- **Walls are resolved from the whole station's floor in one pass** (D-038). A corridor meeting a room is a junction, and walls built per-room each close an opening the other one wanted. `stationCells` rasterises every floor to a one-metre grid and a wall stands wherever a cell is not floor and touches floor, so a doorway is not a feature anybody places: it is the absence of a wall where two floors meet.
- **Devices step toward the state the server reports; they never play an animation** (D-037). A fixture eases toward `on` from wherever it is, every frame. A played sequence has to be cancelled when state changes underneath it, and a door caught halfway either finishes opening a door the server has shut or stalls on a frame nobody chose. A fixture seen for the first time is *placed* at its true state, not animated up to it.
- **Four lights, and no post-processing** (D-042). A hemisphere, a shadow-casting directional, one practical in the room the pair is in, and PILOT's lamp. Everything else that glows is an emissive material with an additive halo behind it, under an ACES filmic tone curve. A full-screen bloom pass at an uncontrolled resolution is the first thing that would drop the frame rate in ChatGPT's in-app browser on a phone.
- **Fog is squared in distance, so it is a wide-shot setting, not a room setting.** A density that is imperceptible at the twenty-five metres a room shot stands at is overwhelming at the hundred and ten a wide shot stands at. If the building comes back as a smudge, check the fog before the lights.
- **The wide shot is a parameter, not a phase** (D-038). `TRANSITIONING` is settled inside the worker's own `reduce()` call and never reaches a client as a frame, so a camera keyed on it is a beat that can never fire. The walk is driven by the pair's floor *changing*, and only between two real rooms: arriving in the first chamber is a move from nowhere. **M** is PILOT's - the human can step back and look at the building, and no tool lets KEEPER do the same.
- **Every material and generated texture comes from `render/kit.ts`.** There is no `new MeshStandardMaterial` anywhere else. That is what keeps the palette locked, and it is what makes a session's GPU resources disposable.

### Art

- **There are no asset files** (D-044). Geometry is built in code and every texture is drawn into a canvas at boot, so there is no loader, no atlas, no request, and **no third-party licence: the repository is MIT throughout.** Re-introducing a vendored pack means re-introducing a carve-out in `LICENSE`, which is a decision-log entry.
- **The twelve glyphs stay authored as pixel maps in `render/glyphs.ts`.** They carry meaning no pack could know: they are the shapes PILOT has to describe and `wave` and `knot` are deliberately confusable. They are drawn nearest-filtered and **unlit**, which is a puzzle decision rather than a style one - a glyph in shadow is a glyph nobody can describe, so the room may not decide whether the puzzle is legible.
- **PILOT is not lamplight-coloured and KEEPER has no eyes.** Warm means "only PILOT perceives this", and the human is not a fact only the human can perceive; a visor band rather than eyes is the silhouette saying *this thing cannot see*.
- **KEEPER is drawn in the wall, never on the floor.** It is not in the room: it is behind the station's panels, reaching into every cavity at once. They can see each other and reach each other nowhere.
- **KEEPER's body is the registry, and the mapping is authored but total** (doc 06 section 5). Persistent tools are rods on the spine; chamber tools are articulated arms with heads shaped like what they do. A tool with no shape entry gets a rod rather than vanishing, because a body that under-reports the registry is the animation telling the lie the manifest exists to catch. Fallen limbs stay on the floor for the rest of the session.
- **A caption is measured, never estimated.** Captions being wider than the thing they label has been the most repeated layout bug in this client across three renderers, and every fix that held asked the browser how wide the text actually was.

### Looking at it

- **Run the tour and look at the frames before calling a renderer change done.** `SHOTS=<dir> ARCHIVE="" node --experimental-strip-types tests/cross-origin-delegation.ts` plays a full session against live servers and writes a frame at every beat in about a minute. Every renderer this project has had shipped green and then produced defects in its first tour that six hundred unit tests could not see.
- **The tour's wait has to stay longer than `WALK_MS + SHOT_MS`.** A frame grabbed early is the previous room with the next room's name over it, or the whole building from four hundred metres up. Both have happened, once per renderer.

## Change Log

| Date | Author | What changed |
|---|---|---|
| 2026-08-27 | Ahmed Saad | Created. Client rules recorded ahead of the rewrite. |
| 2026-08-28 | Ahmed Saad | WebMCP tool layer landed: adapter, director, tool modules. Budgets enforced by test rather than lint (D-022); registry-follows-server rule added (D-021). |
| 2026-08-28 | Ahmed Saad | The view feed landed (`net/socket.ts`, D-025). No rule change: the no-puzzle-values-in-DOM rule already governed it. |
| 2026-08-28 | Ahmed Saad | Phaser and the scenes landed (plan 1.4). Rules added for the dynamic import (D-026), the pure-layout split, and the grate boundary. |
| 2026-08-28 | Ahmed Saad | The declarative notepad landed and the ending drains to empty again (D-028). First art: twelve drawn glyphs, both bodies, authored in source (D-029). |
| 2026-08-28 | Ahmed Saad | The station became a cutaway section at 320x320 (D-031). |
| 2026-08-29 | Ahmed Saad | The document tools can now be delegated to `apps/archive` (D-033). Rules added for what delegation may and may not change, and for the manifest reading `fromOrigins`. |
| 2026-08-29 | Ahmed Saad | The interface was rebuilt on a vendored art pack, one top-down room, and a DOM console (D-034 to D-036). |
| 2026-08-29 | Ahmed Saad | Rooms became shapes resolved from their neighbours, with channel-coloured walls and stepped device motion (D-037). |
| 2026-08-29 | Ahmed Saad | The station became one connected floor plan with a camera over it (D-038). |
| 2026-08-29 | Ahmed Saad | The Archive's monitor landed (D-039). |
| 2026-08-29 | Ahmed Saad | **The interface was rebuilt in real-time 3D on Three.js (D-042 to D-045).** This file was reorganised into sections rather than one list, because the rule count outgrew it. The Phaser, tile, 320x320, art-pack and licence rules are superseded; the design law, the WebMCP rules and the pure/impure split are unchanged. New rules for the cutaway camera, the four-light budget, fog as a wide-shot setting, materials coming only from `kit.ts`, the palette's two locked sets and `check-palette.mjs`, and for running the tour before calling a rendering change done. |
