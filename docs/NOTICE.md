# Notice

## Everything here is ours, except one typeface

The [LICENSE](../LICENSE) at the repository root is the plain, unmodified MIT license text, so that
GitHub's own license detector reads it correctly — it did not, when this file's content used to
live appended below the license text itself, because the detector matches against the canonical
template and anything appended after it drops the match below its threshold. This file carries
the one thing worth saying about the license that the license text itself should not.

**This MIT licence covers the whole repository, with one carve-out: the display typeface.**

That was not true between D-034 and D-042 either, for a different reason. The client's art was
then a vendored third-party pixel pack whose terms permit use in a game and withhold
redistribution, so a section here had to say which half of the tree the licence did not reach.
The 3D rework removed it: every surface in the station is geometry built in code and every
texture is drawn into a canvas at runtime, and the twelve glyphs and both bodies were always
authored in this repository. That remains true without exception.

**The one deliberate re-introduction (D-068).** `apps/game/public/fonts/` holds Fraunces, a
variable typeface by the Fraunces Project Authors, used for the landing screen's display type. It
is licensed under the SIL Open Font License 1.1, which is copied in full beside the font files
(`apps/game/public/fonts/FRAUNCES-OFL.txt`) and permits exactly this use: embedding, modification
and redistribution as part of a larger work, so long as the font is not sold on its own and the
reserved font name is not used to imply endorsement. Nothing else in the repository requires this
exception. No puzzle-critical value, no gameplay geometry and no game texture depends on it, and
removing the two font files leaves every system font stack this project already used as the
fallback.

Getting a second carve-out back is therefore a decision somebody would have to make deliberately,
which is the point of writing this one down.
