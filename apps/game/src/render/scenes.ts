/**
 * The two scenes, and the only files in the client that touch Phaser.
 *
 * They are deliberately thin. Every decision about what a frame contains is
 * made by `rooms.ts` and `hud.ts`, which are pure and tested; these classes
 * turn those answers into rectangles and text and do nothing else. If a
 * question can be answered without a canvas, it is not answered here.
 *
 * Two scenes rather than one per chamber. The chambers differ in what they
 * contain, not in how they are drawn, and a scene per room would mean four
 * transitions per session for a renderer that is already doing almost nothing
 * at this resolution. Doc 07 section 6 names listener accumulation across
 * transitions as the frame-time problem this project is actually likely to
 * have, and the cheapest way not to have it is not to transition.
 */

import Phaser from "phaser";
import { CHANNEL_COLOUR, CHANNEL_DIM, CHANNEL_MARKER, PALETTE } from "./palette.js";
import {
  SILHOUETTE,
  floorLine,
  interlude,
  roomLayout,
  roomTitle,
  type Piece,
  type RoomLayout,
} from "./rooms.js";
import {
  CANVAS,
  DECK_WIDTH,
  DECK_X,
  FRAME,
  ROOM_LEFT,
  ROOM_WIDTH,
  SECTION_BOTTOM,
  SECTION_TOP,
  cutaway,
  type Floor,
} from "./cutaway.js";
import {
  AUDIBLE_HEIGHT,
  AUDIBLE_Y,
  LEGEND,
  LEGEND_Y,
  LINE_HEIGHT,
  LOG_LINES,
  LOG_WIDTH,
  LOG_X,
  MANIFEST_LINES,
  MANIFEST_WIDTH,
  MANIFEST_X,
  METER_HEIGHT,
  METER_Y,
  PAD_LINES,
  PAD_WIDTH,
  PAD_X,
  PANEL_Y,
  TIMER_URGENT_FRACTION,
  WALL_PAD_WIDTH,
  WALL_PAD_X,
  formatNote,
  formatTimer,
  meterFill,
  truncate,
} from "./hud.js";
import { SPRITE_SIZE, TEXTURE, allSprites, toCanvas } from "./sprites.js";
import type { StationModel } from "./station.js";

/** The interface font. Pixel art carries the room; text carries the readouts. */
const FONT = { fontFamily: "monospace", fontSize: "8px" } as const;

/**
 * Build every sprite's texture, once per scene that needs them.
 *
 * The art is authored as pixels in `sprites.ts` rather than loaded as files
 * (see that module for why), so there is no preload step and nothing to wait
 * for: the textures exist by the end of `create()`. Guarded on `exists`
 * because both scenes call it and a texture key may only be claimed once.
 */
function installSprites(scene: Phaser.Scene): void {
  for (const [key, sprite] of allSprites()) {
    if (scene.textures.exists(key)) continue;
    scene.textures.addCanvas(key, toCanvas(sprite));
  }
}

/** Below this width a piece cannot legibly carry its channel marker. */
const MARKER_MIN_WIDTH = 12;

/**
 * A reused pool of text objects.
 *
 * Phaser text is expensive to create and every one of these is redrawn on
 * every frame, so creating them per frame would allocate several hundred
 * objects a second for a screen that changes a few times a minute. The pool
 * hands out the same objects in the same order each frame and hides whatever
 * this frame did not need.
 */
class TextPool {
  readonly #scene: Phaser.Scene;
  readonly #items: Phaser.GameObjects.Text[] = [];
  #used = 0;

  constructor(scene: Phaser.Scene) {
    this.#scene = scene;
  }

  /** Start a frame. Everything handed out last frame becomes available. */
  begin(): void {
    this.#used = 0;
  }

  /** One line of text at a position, in a colour. */
  write(x: number, y: number, content: string, colour: number, originX = 0): void {
    let item = this.#items[this.#used];
    if (!item) {
      item = this.#scene.add.text(x, y, content, FONT).setDepth(10);
      this.#items.push(item);
    }
    item
      .setPosition(Math.round(x), Math.round(y))
      .setText(content)
      .setColor(`#${colour.toString(16).padStart(6, "0")}`)
      .setOrigin(originX, 0)
      .setVisible(true);
    this.#used += 1;
  }

  /** Finish a frame. Hides the surplus rather than destroying it. */
  end(): void {
    for (let i = this.#used; i < this.#items.length; i += 1) this.#items[i]?.setVisible(false);
  }
}

/**
 * The screen before the shift begins.
 *
 * It draws the station from outside and says who is missing. The starter
 * prompt card is *not* here: it lives in the DOM alongside the canvas, because
 * it has to be selectable and copyable and a canvas cannot be either. That is
 * the one piece of the interface where the DOM is the right surface, and it is
 * safe there because the prompt is public copy and holds no puzzle fact.
 */
export class LandingScene extends Phaser.Scene {
  readonly #model: StationModel;
  #pool!: TextPool;
  #glow!: Phaser.GameObjects.Rectangle;

  constructor(model: StationModel) {
    super("landing");
    this.#model = model;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.void);
    installSprites(this);
    this.#pool = new TextPool(this);

    // The station from outside, built from the same hull the rooms are made
    // of, with one lit window and the two of them already in it.
    // The station from outside, as a section with its floors dark: the same
    // building the shift is about to open up, seen before anybody is in it.
    this.add.tileSprite(48, 96, 224, 150, TEXTURE.wall).setOrigin(0, 0);
    this.#paintFloors();
    this.add.rectangle(160, 88, 128, 14, PALETTE.hullLight).setOrigin(0.5, 0.5);
    this.#glow = this.add.rectangle(160, 88, 22, 8, PALETTE.amber).setOrigin(0.5, 0.5);
    this.add.image(112, 242, TEXTURE.pilot).setOrigin(0.5, 1);
    this.add.image(208, 242, TEXTURE.keeper).setOrigin(0.5, 1).setTint(PALETTE.bone);

    // The lamp breathes so a page waiting for a first frame does not look
    // frozen. Twelve frames per second on game motion (doc 06 section 3).
    this.tweens.add({
      targets: this.#glow,
      alpha: { from: 1, to: 0.35 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
    });
  }

  /** The floor slabs, so the closed station already reads as a building. */
  #paintFloors(): void {
    const slabs = this.add.graphics();
    slabs.fillStyle(PALETTE.rust, 1);
    for (let i = 1; i < 5; i += 1) slabs.fillRect(48, 96 + i * 30, 224, 3);
  }

  override update(): void {
    this.#pool.begin();
    this.#pool.write(160, 30, "SEMAPHORE", PALETTE.bone, 0.5);
    this.#pool.write(160, 44, "A DERELICT SIGNAL STATION", PALETTE.boneDim, 0.5);
    const tools = this.#model.tools.length;
    this.#pool.write(
      160,
      272,
      tools > 0
        ? `KEEPER IS HERE. ${String(tools)} TOOL${tools === 1 ? "" : "S"} ON THE PLATE.`
        : "WAITING FOR KEEPER TO READ ITS TOOLS",
      tools > 0 ? PALETTE.cyan : PALETTE.boneDim,
      0.5,
    );
    this.#pool.write(160, 288, "PASTE THE PROMPT BELOW TO YOUR AGENT", PALETTE.amber, 0.5);
    this.#pool.end();
  }
}

/**
 * The station interior: the room, both bodies, and the HUD over the top.
 *
 * This scene runs from the moment the shift begins until the session ends,
 * including the phases with no room in them. In those it draws the HUD and an
 * empty floor rather than going blank, because a blank canvas during the
 * Archive reads as a crash rather than as an interlude.
/**
 * The station interior, drawn as a section: every floor at once.
 *
 * This scene runs from the moment the shift begins until the session ends. It
 * draws the whole building, the floor the pair is standing in at working size
 * and the rest as silhouette strips, with KEEPER's machine deck as a column
 * down the right of all of them. Where a floor sits is `cutaway.ts`'s answer
 * and what is in it is `rooms.ts`'s; this class only paints.
 */
export class ChamberScene extends Phaser.Scene {
  readonly #model: StationModel;
  #pool!: TextPool;
  #paint!: Phaser.GameObjects.Graphics;
  #avatar!: Phaser.GameObjects.Image;
  #keeperBody!: Phaser.GameObjects.Image;
  /** Reused glyph faces, one per piece that wants one. Never re-created. */
  readonly #faces: Phaser.GameObjects.Image[] = [];
  #facesUsed = 0;
  /** The most ambiguity seen in the current room, for the meter's scale. */
  #peakBits = 0;
  #peakChamber: string | null = null;
  /** This frame's active floor and its contents, shared between passes. */
  #floor: Floor | null = null;
  #layout: RoomLayout | null = null;
  /** Where PILOT is standing, as a fraction across the active floor. */
  #walk = 0.1;

  constructor(model: StationModel) {
    super("chamber");
    this.#model = model;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.void);
    installSprites(this);

    // The hull behind every floor. One tile sprite for the whole section
    // rather than one per floor: the building is continuous and the slabs are
    // drawn over it.
    this.add
      .tileSprite(
        FRAME,
        SECTION_TOP,
        CANVAS - FRAME * 2,
        SECTION_BOTTOM - SECTION_TOP,
        TEXTURE.wall,
      )
      .setOrigin(0, 0)
      .setDepth(0);

    this.#paint = this.add.graphics().setDepth(1);
    this.#pool = new TextPool(this);

    this.#avatar = this.add.image(60, 100, TEXTURE.pilot).setOrigin(0.5, 1).setDepth(5);
    this.#keeperBody = this.add
      .image(DECK_X + 24, 120, TEXTURE.keeper)
      .setOrigin(0.5, 1)
      .setDepth(2);

    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error("The station needs a keyboard to move PILOT");
    keyboard.addKeys("A,D,LEFT,RIGHT");
  }

  override update(_time: number, deltaMs: number): void {
    const view = this.#model.view;
    const section = view ? cutaway(view) : null;
    this.#floor = section?.active ?? null;
    this.#layout = view && this.#floor ? roomLayout(view, this.#floor.height) : null;

    this.#movePilot(deltaMs);
    this.#paint.clear();
    this.#pool.begin();
    this.#facesUsed = 0;

    this.#drawFrame();
    if (section) for (const floor of section.floors) this.#drawFloor(floor);
    else this.#pool.write(CANVAS / 2, 120, "CONNECTING", PALETTE.boneDim, 0.5);
    this.#drawDeck();
    this.#drawHud();

    this.#pool.end();
    for (let i = this.#facesUsed; i < this.#faces.length; i += 1) this.#faces[i]?.setVisible(false);
  }

  /** The border, in the manner of a cutaway drawing. */
  #drawFrame(): void {
    this.#paint.fillStyle(PALETTE.void, 1);
    this.#paint.fillRect(0, 0, CANVAS, SECTION_TOP);
    this.#paint.fillRect(0, SECTION_BOTTOM, CANVAS, CANVAS - SECTION_BOTTOM);
    this.#paint.fillRect(0, 0, FRAME, CANVAS);
    this.#paint.fillRect(CANVAS - FRAME, 0, FRAME, CANVAS);
    this.#paint.lineStyle(1, PALETTE.rust, 1);
    this.#paint.strokeRect(1.5, 1.5, CANVAS - 3, CANVAS - 3);
    this.#paint.lineStyle(1, PALETTE.hullLight, 1);
    this.#paint.strokeRect(
      FRAME - 0.5,
      SECTION_TOP - 0.5,
      CANVAS - FRAME * 2 + 1,
      SECTION_BOTTOM - SECTION_TOP + 1,
    );
  }

  /**
   * One floor: its slab, its contents, and its name.
   *
   * The floor the pair is in gets the room proper. Every other floor gets a
   * silhouette, dimmed, which is enough to say "a room, not this one" without
   * competing with the one that matters. In a game where finding the
   * channel-coded object is the whole task, decoration that competes is not
   * decoration.
   */
  #drawFloor(floor: Floor): void {
    const bottom = floor.y + floor.height;
    // The slab under every floor, which is what makes it a building.
    this.#paint.fillStyle(PALETTE.rust, 1);
    this.#paint.fillRect(FRAME, bottom, CANVAS - FRAME * 2, 3);
    // The floor's own deck, lighter than the wall behind it.
    this.#paint.fillStyle(PALETTE.hullLight, floor.active ? 1 : 0.5);
    const deckY = floor.active ? floor.y + floorLine(floor.height) : bottom - 6;
    this.#paint.fillRect(FRAME, deckY, ROOM_RIGHT_EDGE - FRAME, bottom - deckY);

    if (floor.active) this.#drawActiveFloor(floor);
    else this.#drawStrip(floor);
  }

  /** The room the pair is standing in, at working size. */
  #drawActiveFloor(floor: Floor): void {
    this.#pool.write(ROOM_LEFT + 16, floor.y + 1, floor.name, PALETTE.bone);
    const layout = this.#layout;
    if (!layout) {
      const view = this.#model.view;
      if (!view) return;
      const [headline, instruction] = interlude(view);
      const mid = floor.y + floor.height / 2;
      this.#pool.write(CANVAS / 2 - 20, mid - 8, headline, PALETTE.bone, 0.5);
      if (instruction)
        this.#pool.write(CANVAS / 2 - 20, mid + 4, instruction, PALETTE.boneDim, 0.5);
      return;
    }
    for (const piece of layout.pieces) this.#drawPiece(piece, floor);
    if (layout.solved) {
      this.#paint.fillStyle(PALETTE.bone, 0.12);
      this.#paint.fillRect(FRAME, floor.y, ROOM_RIGHT_EDGE - FRAME, floor.height);
    }
    this.#drawWallPad(floor);
    this.#drawPilot(floor);
  }

  /** A floor the pair is not in: a shape, a name, and nothing readable. */
  #drawStrip(floor: Floor): void {
    const bottom = floor.y + floor.height;
    // Cleared floors are lit; floors not reached yet are barely there. Both
    // need to separate from the hull behind them, which a first pass drawing
    // them in `hullLight` did not: the building read as one dark box.
    const shapes = floor.cleared ? PALETTE.boneDim : PALETTE.rust;
    this.#paint.fillStyle(shapes, floor.cleared ? 0.7 : 0.9);
    for (const [x, w, h] of SILHOUETTE[floor.id] ?? []) {
      this.#paint.fillRect(ROOM_LEFT + x, bottom - 6 - h, w, h);
    }
    // The name is always legible. A floor the pair has not reached is still a
    // floor they can see from the stairwell, and knowing the station has a
    // Concord Lock in it from the first minute is the point of a section.
    this.#pool.write(
      ROOM_LEFT + 2,
      floor.y + 2,
      floor.name,
      floor.cleared ? PALETTE.bone : PALETTE.boneDim,
    );
    if (floor.cleared)
      this.#pool.write(ROOM_RIGHT_EDGE - 4, floor.y + 2, "CLEARED", PALETTE.brass, 1);
  }

  /**
   * PILOT walks the floor they are standing on.
   *
   * The whole of the human's physical agency: they can cross the room and
   * look. Every mechanism in the station is reachable only by KEEPER, through
   * a tool, and that is the game rather than an unfinished control scheme.
   */
  #movePilot(deltaMs: number): void {
    const keys = this.input.keyboard?.keys;
    const down = (code: number) => keys?.[code]?.isDown === true;
    const left =
      down(Phaser.Input.Keyboard.KeyCodes.LEFT) || down(Phaser.Input.Keyboard.KeyCodes.A);
    const right =
      down(Phaser.Input.Keyboard.KeyCodes.RIGHT) || down(Phaser.Input.Keyboard.KeyCodes.D);
    const direction = (right ? 1 : 0) - (left ? 1 : 0);
    if (direction === 0) return;
    // Stored as a fraction so PILOT keeps their place across a floor change.
    this.#walk = Math.max(0.02, Math.min(0.96, this.#walk + direction * (deltaMs / 1000) * 0.35));
  }

  #drawPilot(floor: Floor): void {
    this.#avatar
      .setPosition(
        Math.round(ROOM_LEFT + 12 + this.#walk * (ROOM_WIDTH - 24)),
        Math.round(floor.y + floorLine(floor.height)),
      )
      .setVisible(true);
  }

  /** One piece of the active floor's mechanism, offset into place. */
  #drawPiece(piece: Piece, floor: Floor): void {
    const x = ROOM_LEFT + piece.x;
    const y = floor.y + piece.y;
    const colour =
      PALETTE[piece.active ? CHANNEL_COLOUR[piece.channel] : CHANNEL_DIM[piece.channel]];
    this.#paint.fillStyle(piece.glyph ? PALETTE.void : colour, piece.active ? 1 : 0.55);
    this.#paint.fillRect(x, y, piece.w, piece.h);
    this.#paint.lineStyle(1, colour, 1);
    this.#paint.strokeRect(x + 0.5, y + 0.5, piece.w - 1, piece.h - 1);

    if (piece.glyph) this.#drawGlyph(piece, x, y, colour);
    if (piece.w >= MARKER_MIN_WIDTH) {
      this.#pool.write(x + 1, y + 1, CHANNEL_MARKER[piece.channel], colour);
    }
    if (piece.label !== undefined) {
      this.#pool.write(x + piece.w / 2, y + piece.h + 1, piece.label, colour, 0.5);
    }
  }

  /**
   * The glyph on a piece's face, tinted to the piece's channel.
   *
   * The sprite is monochrome and the tint is applied here, so the same mark
   * that says "this is a spiral" also says "only PILOT can see this" and the
   * two cannot disagree.
   */
  #drawGlyph(piece: Piece, x: number, y: number, colour: number): void {
    const key = TEXTURE.glyph(piece.glyph ?? "");
    if (!this.textures.exists(key)) return;
    let face = this.#faces[this.#facesUsed];
    if (!face) {
      face = this.add.image(0, 0, key).setDepth(3);
      this.#faces.push(face);
    }
    const fit = Math.min(piece.w - 2, piece.h - 2) / SPRITE_SIZE;
    const scale = fit >= 1 ? Math.floor(fit) : fit;
    face
      .setTexture(key)
      .setPosition(Math.round(x + piece.w / 2), Math.round(y + piece.h / 2))
      .setScale(scale)
      .setTint(colour)
      .setAlpha(piece.active ? 1 : 0.5)
      .setVisible(true);
    this.#facesUsed += 1;
  }

  /** The shared notepad, on the wall of the floor the pair is standing in. */
  #drawWallPad(floor: Floor): void {
    const notes = this.#model.view?.notes ?? [];
    const x = ROOM_LEFT + WALL_PAD_X;
    const top = floor.y + 10;
    this.#paint.fillStyle(PALETTE.brass, 1);
    this.#paint.fillRect(x - 1, top - 3, WALL_PAD_WIDTH + 2, 3);
    this.#paint.fillStyle(PALETTE.bone, notes.length > 0 ? 0.9 : 0.35);
    this.#paint.fillRect(x, top, WALL_PAD_WIDTH, 30);
    notes.slice(-6).forEach((note, index) => {
      this.#paint.fillStyle(PALETTE[note.author === "KEEPER" ? "cyanDeep" : "amberDeep"], 1);
      this.#paint.fillRect(x + 2, top + 3 + index * 4, WALL_PAD_WIDTH - 4, 2);
    });
  }

  /**
   * The machine deck: KEEPER's column, down the whole building.
   *
   * A column rather than an alcove, because KEEPER is not in a room. It is
   * behind the station, reaching into every chamber's cavities at once, and
   * the section is the first drawing that could say so. The grate runs the
   * full height for the same reason: they can see each other on every floor
   * and reach each other on none of them.
   */
  #drawDeck(): void {
    const busy = performance.now() < this.#model.busyUntilMs;
    this.#paint.fillStyle(PALETTE.void, 1);
    this.#paint.fillRect(DECK_X, SECTION_TOP, DECK_WIDTH, SECTION_BOTTOM - SECTION_TOP);

    // KEEPER stands beside the floor the pair is on, so the pair can see each
    // other through the grate wherever they are in the building.
    const y = this.#floor
      ? this.#floor.y + Math.min(this.#floor.height, floorLine(this.#floor.height))
      : SECTION_BOTTOM - 20;
    this.#keeperBody
      .setPosition(DECK_X + Math.round(DECK_WIDTH / 2), Math.round(y))
      .setTint(busy ? PALETTE.cyanBright : PALETTE.bone)
      .setVisible(true);

    // One brass segment per registered tool, read from `getTools()` rather
    // than from a record of what was registered, so a registration that
    // silently failed costs KEEPER a visible limb.
    this.#paint.fillStyle(PALETTE.brass, 1);
    this.#model.tools.forEach((_tool, index) => {
      this.#paint.fillRect(DECK_X + 2, SECTION_TOP + 6 + index * 4, 8, 2);
    });

    this.#paint.lineStyle(1, PALETTE.rust, 1);
    for (let x = DECK_X; x < CANVAS - FRAME; x += 5) {
      this.#paint.lineBetween(x + 0.5, SECTION_TOP, x + 0.5, SECTION_BOTTOM);
    }
    this.#pool.write(
      DECK_X + 1,
      SECTION_BOTTOM - 9,
      busy ? "WORK" : "DECK",
      busy ? PALETTE.cyanBright : PALETTE.cyan,
    );
  }

  /** The top bar, the meter, the audible strip, the three panels, the legend. */
  #drawHud(): void {
    const view = this.#model.view;
    const state = this.#model.state;
    const remaining = view?.remainingMs ?? state?.remainingMs ?? null;

    this.#pool.write(
      FRAME + 4,
      FRAME,
      view ? roomTitle(view) : (state?.phase ?? "CONNECTING"),
      PALETTE.bone,
    );
    const total = this.#model.chamberTimerMs;
    const urgent = total > 0 && remaining !== null && remaining / total < TIMER_URGENT_FRACTION;
    this.#pool.write(
      CANVAS - FRAME - 4,
      FRAME,
      formatTimer(remaining),
      urgent ? PALETTE.alarm : PALETTE.bone,
      1,
    );
    if (view && view.retries > 0) {
      this.#pool.write(CANVAS / 2, FRAME, `RESETS ${String(view.retries)}`, PALETTE.alarm, 0.5);
    }
    this.#drawMeter();
    this.#drawSound();
    this.#drawLog();
    this.#drawPad();
    this.#drawManifest();
    this.#drawLegend();
  }

  /** The `AUDIBLE` channel: the one fact PILOT never has to describe. */
  #drawSound(): void {
    const sound = this.#layout?.sound;
    if (!sound) return;
    this.#paint.lineStyle(1, PALETTE.bone, 1);
    this.#paint.strokeRect(
      FRAME + 2.5,
      AUDIBLE_Y + 1.5,
      CANVAS - FRAME * 2 - 5,
      AUDIBLE_HEIGHT - 3,
    );
    this.#paint.strokeRect(
      FRAME + 0.5,
      AUDIBLE_Y - 0.5,
      CANVAS - FRAME * 2 - 1,
      AUDIBLE_HEIGHT + 1,
    );
    this.#pool.write(
      CANVAS / 2,
      AUDIBLE_Y + 1,
      truncate(sound.toUpperCase(), CANVAS - 24),
      PALETTE.bone,
      0.5,
    );
  }

  /**
   * The CONCORD meter: how much of this room's opening ambiguity is left.
   *
   * Labelled REMAINING AMBIGUITY rather than anything warmer, because the
   * server cannot hear the pair talk and the meter therefore does not move
   * when PILOT merely explains something (doc 02 section 5).
   */
  #drawMeter(): void {
    const report = this.#model.concord;
    const chamber = this.#model.view?.chamber ?? null;
    if (chamber !== this.#peakChamber) {
      this.#peakChamber = chamber;
      this.#peakBits = 0;
    }
    // A reading from a room the pair has already left is not stale, it is
    // wrong, so it is discarded rather than drawn.
    const current = report?.chamber === chamber ? report : null;
    if (current?.bits != null) this.#peakBits = Math.max(this.#peakBits, current.bits);

    const track = CANVAS - FRAME * 2 - 8;
    this.#paint.fillStyle(PALETTE.hull, 1);
    this.#paint.fillRect(FRAME + 4, METER_Y, track, METER_HEIGHT);
    const fill = meterFill(current?.bits ?? null, this.#peakBits);
    if (fill > 0) {
      this.#paint.fillStyle(PALETTE.brass, 1);
      this.#paint.fillRect(FRAME + 4, METER_Y, Math.max(1, Math.round(track * fill)), METER_HEIGHT);
    }
    this.#pool.write(
      FRAME + 4,
      METER_Y + METER_HEIGHT + 1,
      current?.bits == null
        ? "REMAINING AMBIGUITY -"
        : `REMAINING AMBIGUITY ${current.bits.toFixed(2)} BITS`,
      PALETTE.boneDim,
    );
  }

  /** What KEEPER did, newest first. Tool names only, never arguments. */
  #drawLog(): void {
    this.#pool.write(LOG_X, PANEL_Y, "ACTIVITY", PALETTE.boneDim);
    this.#model.log.slice(0, LOG_LINES).forEach((line, index) => {
      this.#pool.write(
        LOG_X,
        PANEL_Y + LINE_HEIGHT + 2 + index * LINE_HEIGHT,
        truncate(line, LOG_WIDTH),
        PALETTE.bone,
      );
    });
  }

  /** The pad's readable copy, each line in its writer's channel colour. */
  #drawPad(): void {
    const notes = this.#model.view?.notes ?? [];
    this.#pool.write(PAD_X, PANEL_Y, `NOTEPAD ${String(notes.length)}`, PALETTE.bone);
    if (notes.length === 0) {
      this.#pool.write(PAD_X, PANEL_Y + LINE_HEIGHT + 2, "BLANK", PALETTE.boneDim);
      return;
    }
    notes.slice(-PAD_LINES).forEach((note, index) => {
      this.#pool.write(
        PAD_X,
        PANEL_Y + LINE_HEIGHT + 2 + index * LINE_HEIGHT,
        formatNote(note.author, note.text, PAD_WIDTH),
        PALETTE[note.author === "KEEPER" ? "cyan" : "amber"],
      );
    });
  }

  /**
   * The manifest plate: the registry, as `getTools()` reports it right now.
   *
   * Drawn from the page's own answer rather than from a record of what was
   * registered, so the animation cannot lie about a registration that did not
   * take. That is the whole reason the plate exists.
   */
  #drawManifest(): void {
    const tools = this.#model.tools;
    this.#pool.write(MANIFEST_X, PANEL_Y, `MANIFEST ${String(tools.length)}`, PALETTE.brass);
    if (tools.length === 0) {
      this.#pool.write(MANIFEST_X, PANEL_Y + LINE_HEIGHT + 2, "EMPTY", PALETTE.boneDim);
      return;
    }
    tools.slice(-MANIFEST_LINES).forEach((tool, index) => {
      this.#pool.write(
        MANIFEST_X,
        PANEL_Y + LINE_HEIGHT + 2 + index * LINE_HEIGHT,
        truncate(tool, MANIFEST_WIDTH),
        PALETTE.cyan,
      );
    });
  }

  /** The colour law, permanently on screen. */
  #drawLegend(): void {
    LEGEND.forEach((row, index) => {
      const x = FRAME + 4 + index * 104;
      const colour = PALETTE[CHANNEL_COLOUR[row.channel]];
      this.#paint.fillStyle(colour, 1);
      this.#paint.fillRect(x, LEGEND_Y + 1, 5, 5);
      this.#pool.write(x + 8, LEGEND_Y, `${row.marker} ${row.text}`, colour);
    });
  }
}

/** The right edge of a floor's interior, where the machine deck begins. */
const ROOM_RIGHT_EDGE = DECK_X - 2;

/** The scene keys, so `station.ts` does not repeat the strings. */
export const SCENE_LANDING = "landing";
export const SCENE_CHAMBER = "chamber";
