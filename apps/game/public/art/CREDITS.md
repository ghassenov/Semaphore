# Art credits and licence

Every PNG in this directory comes from **[FREE] 16x16 Top Down Puzzle System -
Asset Pack** by **LorisC**, <https://lorisc.itch.io/puzzle-system-asset-pack>.

## Why this is here and not in `src/render/sprites.ts`

The client authored its art as pixel arrays in source until D-034, on the rule
that no third-party art enters a repository whose provenance has to be clean.
D-034 supersedes that. The reasoning, and what replaced the rule, is in
`docs/decision-log.md`.

## What was taken

The pack ships the same objects in six colours. Semaphore's colour law is its
information architecture - amber is what only PILOT perceives, cyan is what
only KEEPER perceives, bone-white is shared - so exactly three of the six are
used, one per channel, and the other three are not in this repository:

| Directory | Pack colour | Channel |
|---|---|---|
| `shared/` | Neutral | `SHARED`, and every surface neither party owns |
| `pilot/` | Yellow | `VISUAL`: only PILOT perceives it |
| `keeper/` | Blue | `TACTILE`: only KEEPER perceives it |

Files are the pack's `Separated_Assets`, renamed to the name the game calls the
thing. The pack's `Full_SpriteSheets` are documentation with labels drawn into
them and are not shipped. `PuzzleSystem.aseprite`, the editable source, is not
shipped either.

## Licence

The pack's own terms, quoted from its itch.io page:

> **You can:** Use the assets in commercial and non-commercial games. Modify the
> assets to fit your game.
>
> **You can't:** Resell, repackage or redistribute the assets (even if
> modified). Include these assets in game-making tools or code templates. Claim
> the assets or the pack as your own. [...]
>
> Credit is appreciated but not required. License is non-exclusive.

**Semaphore's MIT licence covers the source code in this repository and does not
extend to these files.** That distinction is deliberate and it matters: MIT
grants redistribution, the pack's terms withhold it, and a reader who assumed
one licence covered the whole tree would be wrong about the half that is not
ours to grant. `LICENSE` at the repository root carries the same note.

What is here is the subset this game draws with, shipped inside the game the
way any game ships the art it was built from. It is not the pack: the source
file, the documentation sheets and three of the six colours are absent, and
nothing here is offered for reuse. Anyone who wants these assets should get
them from LorisC, at the link above, for free.
