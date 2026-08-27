# apps/game/

The Phaser client. It renders PILOT's world and hosts the WebMCP tool director. It is a **view**, not an authority.

## Local rules

- **The client never possesses the solution.** It renders `projectForPilot` deltas pushed over the WebSocket and nothing else. No `HIDDEN` field, no puzzle answer, and no server-side derivation ever ships to the browser. If a feature seems to need one, the feature is wrong.
- **Puzzle-critical visuals render to canvas, never to DOM.** There must be no text node holding a glyph, a needle value, or a cipher offset. The one deliberate exception is the accessibility mirror, which ships behind an explicit toggle and is documented as a trade-off.
- **All spec contact lives in `src/webmcp/adapter.ts`.** Nothing else in this app may touch `document.modelContext` or `navigator.modelContext`. Feature-detect `document` first, then `navigator`.
- **No WebMCP means the gate screen, never a throw.** For some judges that screen is the entire submission. It carries the pitch, the mark, the ablation chart, SPECTATE, and setup steps for both browsers.
- **`toolchange` drives the UI from real registry state.** The manifest panel and KEEPER's body both render from an actual `await getTools()` call inside one listener. Never from a parallel guess about what was just registered. The panel exists to prove the animation is not a lie.
- **Colour is information architecture, and it never bends for a nice frame.** Amber: only PILOT perceives this. Cyan: only KEEPER perceives this. Bone-white: both. `AUDIBLE` is bone-white with a double ring. Every channel-coded element also carries its shape marker, because colour alone must never carry information.
- **The palette is locked at 14 colours** (doc 06 section 2). Adding a fifteenth is a decision-log entry, not a judgement call. There is no green: success is a bone-white flash and a shape change.
- **Native resolution is 320x180, integer scaling only.** Fractional scaling produces half-pixel shimmer that reads as carelessness.
- **Greybox before art.** Every chamber ships as flat rectangles in palette colours and is playtested before a single final sprite is drawn.
- Tool descriptions are agent-facing UI copy. Budgets are enforced by lint: 500 characters per description, 150 per parameter description, 30 per name, 1500 per output.

## Change Log

| Date | Author | What changed |
|---|---|---|
| 2026-08-27 | Ahmed Saad | Created. Client rules recorded ahead of the rewrite. |
