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
  FLOOR_Y,
  GRATE_X,
  NATIVE_HEIGHT,
  NATIVE_WIDTH,
  ROOM_BOTTOM,
  ROOM_TOP,
  interlude,
  roomLayout,
  roomTitle,
  type Piece,
  type RoomLayout,
} from "./rooms.js";
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

/** Native pixels per second. Slow, because the room is 320 wide. */
const WALK_SPEED = 60;

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
    this.add.tileSprite(40, 84, 240, 76, TEXTURE.wall).setOrigin(0, 0);
    this.add.rectangle(160, 78, 128, 14, PALETTE.hullLight).setOrigin(0.5, 0.5);
    this.#glow = this.add.rectangle(160, 78, 22, 8, PALETTE.amber).setOrigin(0.5, 0.5);
    this.add.image(120, 156, TEXTURE.pilot).setOrigin(0.5, 1);
    this.add.image(200, 156, TEXTURE.keeper).setOrigin(0.5, 1).setTint(PALETTE.bone);

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

  override update(): void {
    this.#pool.begin();
    this.#pool.write(160, 18, "SEMAPHORE", PALETTE.bone, 0.5);
    this.#pool.write(160, 30, "A DERELICT SIGNAL STATION", PALETTE.boneDim, 0.5);
    const tools = this.#model.tools.length;
    this.#pool.write(
      160,
      162,
      tools > 0
        ? `KEEPER IS HERE. ${String(tools)} TOOL${tools === 1 ? "" : "S"} ON THE PLATE.`
        : "WAITING FOR KEEPER TO READ ITS TOOLS",
      tools > 0 ? PALETTE.cyan : PALETTE.boneDim,
      0.5,
    );
    this.#pool.write(160, 172, "PASTE THE PROMPT BELOW TO YOUR AGENT", PALETTE.amber, 0.5);
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
 */
export class ChamberScene extends Phaser.Scene {
  readonly #model: StationModel;
  #pool!: TextPool;
  #paint!: Phaser.GameObjects.Graphics;
  #avatar!: Phaser.GameObjects.Image;
  #keeperBody!: Phaser.GameObjects.Image;
  #wall!: Phaser.GameObjects.TileSprite;
  #floor!: Phaser.GameObjects.TileSprite;
  /** Reused glyph faces, one per piece that wants one. Never re-created. */
  readonly #faces: Phaser.GameObjects.Image[] = [];
  #facesUsed = 0;
  #keys!: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  /** The most ambiguity seen in the current room, for the meter's scale. */
  #peakBits = 0;
  #peakChamber: string | null = null;
  /**
   * This frame's layout, computed by `#drawRoom` and read by `#drawHud`.
   *
   * The audible strip sits below the room, in a band the HUD paints its
   * background over, so it has to be drawn after the HUD background and it
   * needs the room's answer to do it. Stashing beats calling `roomLayout`
   * twice, and makes it obvious the two are looking at the same frame.
   */
  #layout: RoomLayout | null = null;

  constructor(model: StationModel) {
    super("chamber");
    this.#model = model;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.void);
    installSprites(this);
    // The room's surfaces, under everything. Tile sprites rather than a
    // repeated draw call: the GPU repeats the texture and the scene owns two
    // objects instead of a hundred.
    this.#wall = this.add
      .tileSprite(0, ROOM_TOP, NATIVE_WIDTH, ROOM_BOTTOM - ROOM_TOP, TEXTURE.wall)
      .setOrigin(0, 0)
      .setDepth(0);
    this.#floor = this.add
      .tileSprite(0, FLOOR_Y, NATIVE_WIDTH, ROOM_BOTTOM - FLOOR_Y, TEXTURE.floor)
      .setOrigin(0, 0)
      .setDepth(0);

    this.#paint = this.add.graphics().setDepth(1);
    this.#pool = new TextPool(this);

    this.#avatar = this.add.image(60, FLOOR_Y, TEXTURE.pilot).setOrigin(0.5, 1).setDepth(5);
    // Behind the grate, which is drawn over it every frame.
    this.#keeperBody = this.add
      .image(GRATE_X + 30, FLOOR_Y, TEXTURE.keeper)
      .setOrigin(0.5, 1)
      .setDepth(2);

    // Arrow keys and WASD, because a player whose hands are on the keyboard
    // to talk to their agent should not have to find a different set to move.
    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error("The chamber needs a keyboard to move PILOT");
    this.#keys = {
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
    };
    keyboard.addKeys("A,D");
  }

  override update(_time: number, deltaMs: number): void {
    this.#movePilot(deltaMs);
    this.#paint.clear();
    this.#pool.begin();
    this.#facesUsed = 0;
    this.#drawRoom();
    this.#drawKeeper();
    this.#drawHud();
    this.#pool.end();
    for (let i = this.#facesUsed; i < this.#faces.length; i += 1) this.#faces[i]?.setVisible(false);
  }

  /**
   * PILOT walks. This is the whole of the human's physical agency in the
   * greybox: they can cross the room and look, and that is the point. Every
   * mechanism in the station is reachable only by KEEPER, through a tool.
   */
  #movePilot(deltaMs: number): void {
    const keyboard = this.input.keyboard;
    const left = this.#keys.left.isDown || keyboard?.keys[Phaser.Input.Keyboard.KeyCodes.A]?.isDown;
    const right =
      this.#keys.right.isDown || keyboard?.keys[Phaser.Input.Keyboard.KeyCodes.D]?.isDown;
    const direction = (right ? 1 : 0) - (left ? 1 : 0);
    if (direction === 0) return;
    const next = this.#avatar.x + direction * WALK_SPEED * (deltaMs / 1000);
    // Stops at the grate. KEEPER is on the other side of it and stays there.
    this.#avatar.x = Math.max(12, Math.min(GRATE_X - 12, next));
  }

  /** The floor, then whatever `rooms.ts` says is standing on it. */
  #drawRoom(): void {
    const view = this.#model.view;
    // Tiled hull rather than a flat fill: the station should look built, and
    // the tiles carry the rust marks that stop 96 pixels of wall reading as a
    // rectangle. Created once in `create()` and only positioned here.
    this.#wall.setVisible(true);
    this.#floor.setVisible(true);

    this.#layout = view ? roomLayout(view) : null;
    const layout = this.#layout;
    if (!layout) {
      if (!view) return;
      // Not dead air: the Archive is a designed beat and `ESCAPED` is the last
      // frame anybody sees. Both deserve better than a diagnostic.
      const [headline, instruction] = interlude(view);
      this.#pool.write(160, 58, headline, PALETTE.bone, 0.5);
      if (instruction) this.#pool.write(160, 72, instruction, PALETTE.boneDim, 0.5);
      return;
    }

    for (const piece of layout.pieces) this.#drawPiece(piece);

    // Success is a bone-white flash and a shape change, never green. There is
    // no green in the palette to reach for.
    if (layout.solved) {
      this.#paint.fillStyle(PALETTE.bone, 0.12);
      this.#paint.fillRect(0, ROOM_TOP, NATIVE_WIDTH, ROOM_BOTTOM - ROOM_TOP);
    }
  }

  /**
   * The `AUDIBLE` channel: the one fact PILOT never has to describe.
   *
   * Bone-white with the double ring the legend teaches, in a band of its own
   * below the room rather than inside it. It was inside it, and the captions
   * of anything standing on the floor landed on top of the sentence.
   */
  #drawSound(): void {
    const sound = this.#layout?.sound;
    if (!sound) return;
    this.#paint.lineStyle(1, PALETTE.bone, 1);
    this.#paint.strokeRect(6.5, AUDIBLE_Y + 1.5, NATIVE_WIDTH - 13, AUDIBLE_HEIGHT - 3);
    this.#paint.strokeRect(4.5, AUDIBLE_Y - 0.5, NATIVE_WIDTH - 9, AUDIBLE_HEIGHT + 1);
    this.#pool.write(
      160,
      AUDIBLE_Y + 1,
      truncate(sound.toUpperCase(), NATIVE_WIDTH - 20),
      PALETTE.bone,
      0.5,
    );
  }

  /** One piece: body, channel outline, glyph face, marker and caption. */
  #drawPiece(piece: Piece): void {
    const colour =
      PALETTE[piece.active ? CHANNEL_COLOUR[piece.channel] : CHANNEL_DIM[piece.channel]];
    // A piece wearing a glyph gets a dark plate to carry it; a bare piece is
    // filled in its channel colour as before. Filling under a glyph would
    // leave the shape fighting the field it sits on at eight pixels.
    this.#paint.fillStyle(piece.glyph ? PALETTE.void : colour, piece.active ? 1 : 0.55);
    this.#paint.fillRect(piece.x, piece.y, piece.w, piece.h);
    this.#paint.lineStyle(1, colour, 1);
    this.#paint.strokeRect(piece.x + 0.5, piece.y + 0.5, piece.w - 1, piece.h - 1);

    if (piece.glyph) this.#drawGlyph(piece, colour);

    // The marker rides on every channel-coded piece big enough to carry it, so
    // the colour is never the only thing saying who can perceive it. On a 6px
    // strike pip it is illegible noise, and those pips are captioned in the
    // channel colour anyway, so the shape cue is not lost.
    if (piece.w >= MARKER_MIN_WIDTH) {
      this.#pool.write(piece.x + 1, piece.y + 1, CHANNEL_MARKER[piece.channel], colour);
    }
    if (piece.label !== undefined) {
      this.#pool.write(piece.x + piece.w / 2, piece.y + piece.h + 1, piece.label, colour, 0.5);
    }
  }

  /**
   * The glyph on a piece's face, tinted to the piece's channel.
   *
   * The sprite is monochrome and the tint is applied here, so the same mark
   * that says "this is a spiral" also says "only PILOT can see this" and the
   * two cannot disagree. Faces come from a pool for the same reason the text
   * does: this runs sixty times a second.
   */
  #drawGlyph(piece: Piece, colour: number): void {
    const key = TEXTURE.glyph(piece.glyph ?? "");
    if (!this.textures.exists(key)) return;
    let face = this.#faces[this.#facesUsed];
    if (!face) {
      face = this.add.image(0, 0, key).setDepth(3);
      this.#faces.push(face);
    }
    // Scaled down to fit inside the piece, integer-snapped so the pixel art
    // never lands on a half pixel.
    const scale = Math.max(1, Math.floor(Math.min(piece.w - 4, piece.h - 4) / SPRITE_SIZE)) || 1;
    const fit = Math.min(piece.w - 2, piece.h - 2) / SPRITE_SIZE;
    face
      .setTexture(key)
      .setPosition(Math.round(piece.x + piece.w / 2), Math.round(piece.y + piece.h / 2))
      .setScale(fit >= 1 ? scale : fit)
      .setTint(colour)
      .setAlpha(piece.active ? 1 : 0.5)
      .setVisible(true);
    this.#facesUsed += 1;
  }

  /**
   * KEEPER, behind the grate, with a body made of its own registry.
   *
   * The limb count is `getTools().length` as the page actually reports it, not
   * a guess about what was just registered. That is the same rule the manifest
   * plate follows and for the same reason: if a registration silently fails,
   * KEEPER visibly loses a limb and the bug is found. The visor pulses while a
   * call is in flight, which is the only moment the agent is doing something
   * the human can see.
   */
  #drawKeeper(): void {
    const busy = performance.now() < this.#model.busyUntilMs;
    this.#paint.fillStyle(PALETTE.void, 1);
    this.#paint.fillRect(GRATE_X, ROOM_TOP, NATIVE_WIDTH - GRATE_X, FLOOR_Y - ROOM_TOP);

    // The visor brightens while a call is in flight. It is the human's only
    // cue that their partner is doing something right now.
    this.#keeperBody.setTint(busy ? PALETTE.cyanBright : PALETTE.bone).setVisible(true);

    // One limb segment per registered tool, brass, stacked down each side.
    // Read from `getTools()` rather than from a record of what was registered,
    // so a registration that silently failed costs KEEPER a visible limb.
    const torsoX = GRATE_X + 22;
    this.#paint.fillStyle(PALETTE.brass, 1);
    this.#model.tools.forEach((_tool, index) => {
      const y = FLOOR_Y - 22 + (index % 6) * 3;
      const x = index < 6 ? torsoX - 12 : torsoX + 14;
      this.#paint.fillRect(x, y, 6, 2);
    });

    // The grate itself, drawn over KEEPER: the pair can see each other and
    // cannot reach each other, which is the entire relationship.
    this.#paint.lineStyle(1, PALETTE.rust, 1);
    for (let x = GRATE_X; x < NATIVE_WIDTH; x += 6) {
      this.#paint.lineBetween(x + 0.5, ROOM_TOP, x + 0.5, FLOOR_Y);
    }
    // Right-aligned against the canvas edge rather than centred on the alcove:
    // centred, "KEEPER WORKING" ran off the right of the screen and the state
    // that matters most was the one that could not be read.
    this.#pool.write(
      NATIVE_WIDTH - 2,
      FLOOR_Y + 2,
      busy ? "KEEPER WORKING" : "KEEPER",
      busy ? PALETTE.cyanBright : PALETTE.cyan,
      1,
    );
  }

  /** The top bar, the meter, the log, the manifest plate and the legend. */
  #drawHud(): void {
    const view = this.#model.view;
    const state = this.#model.state;
    const remaining = view?.remainingMs ?? state?.remainingMs ?? null;

    this.#paint.fillStyle(PALETTE.void, 1);
    this.#paint.fillRect(0, 0, NATIVE_WIDTH, ROOM_TOP);
    this.#paint.fillRect(0, ROOM_BOTTOM, NATIVE_WIDTH, NATIVE_HEIGHT - ROOM_BOTTOM);

    this.#pool.write(4, 1, view ? roomTitle(view) : (state?.phase ?? "CONNECTING"), PALETTE.bone);
    const total = this.#model.chamberTimerMs;
    const urgent = total > 0 && remaining !== null && remaining / total < TIMER_URGENT_FRACTION;
    this.#pool.write(
      NATIVE_WIDTH - 4,
      1,
      formatTimer(remaining),
      urgent ? PALETTE.alarm : PALETTE.bone,
      1,
    );
    if (view && view.retries > 0) {
      this.#pool.write(160, 1, `RESETS ${String(view.retries)}`, PALETTE.alarm, 0.5);
    }

    this.#drawSound();
    this.#drawMeter();
    this.#drawLog();
    this.#drawPad();
    this.#drawManifest();
    this.#drawLegend();
  }

  /**
   * The CONCORD meter: how much of this room's opening ambiguity is left.
   *
   * Labelled REMAINING AMBIGUITY rather than anything warmer, because the
   * server cannot hear the pair talk and the meter therefore does not move
   * when PILOT merely explains something. Doc 02 section 5 requires that
   * limitation to be stated rather than papered over, and the label is where
   * it is stated.
   */
  #drawMeter(): void {
    const report = this.#model.concord;
    const chamber = this.#model.view?.chamber ?? null;
    if (chamber !== this.#peakChamber) {
      this.#peakChamber = chamber;
      this.#peakBits = 0;
    }
    // The route is polled, so for a couple of seconds after a chamber change
    // the last answer is about the room the pair has already left. Reporting
    // the Airlock's 1.58 bits in the Signal Room is not a stale number, it is
    // a wrong one, so a reading from another room is discarded rather than
    // drawn.
    const current = report?.chamber === chamber ? report : null;
    if (current?.bits != null) this.#peakBits = Math.max(this.#peakBits, current.bits);

    const track = NATIVE_WIDTH - 8;
    this.#paint.fillStyle(PALETTE.hull, 1);
    this.#paint.fillRect(4, METER_Y, track, METER_HEIGHT);
    const fill = meterFill(current?.bits ?? null, this.#peakBits);
    if (fill > 0) {
      this.#paint.fillStyle(PALETTE.brass, 1);
      this.#paint.fillRect(4, METER_Y, Math.max(1, Math.round(track * fill)), METER_HEIGHT);
    }
    this.#pool.write(
      4,
      METER_Y + METER_HEIGHT + 1,
      current?.bits == null
        ? "REMAINING AMBIGUITY -"
        : `REMAINING AMBIGUITY ${current.bits.toFixed(2)} BITS`,
      PALETTE.boneDim,
    );
  }

  /** What KEEPER has done, newest first. Tool names only, never arguments. */
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

  /**
   * The shared notepad, in both places it exists.
   *
   * On the wall, as a physical pad in the room's left margin, because it is an
   * object in the station and not an interface element: doc 03 section 8 puts
   * it there and the whole exhibit is that the two parties act on the same
   * physical thing. In the panel below, as readable lines, because 14 pixels
   * of wall cannot hold a sentence.
   *
   * Each line is drawn in its writer's channel colour. That is the only reason
   * `SubmitEvent.agentInvoked` is tracked at all, and it is the one surface in
   * the game where amber and cyan appear side by side rather than opposed.
   */
  #drawPad(): void {
    const notes = this.#model.view?.notes ?? [];

    // The pad on the wall. Brass corner, bone paper, one ruled line per note
    // it is holding, so a full pad reads as full from across the room.
    this.#paint.fillStyle(PALETTE.brass, 1);
    this.#paint.fillRect(WALL_PAD_X - 1, ROOM_TOP + 5, WALL_PAD_WIDTH + 2, 3);
    this.#paint.fillStyle(PALETTE.bone, notes.length > 0 ? 0.9 : 0.35);
    this.#paint.fillRect(WALL_PAD_X, ROOM_TOP + 8, WALL_PAD_WIDTH, 34);
    this.#paint.fillStyle(PALETTE.void, 1);
    notes.slice(-6).forEach((note, index) => {
      // The ruled lines are colour-coded too, so the wall pad shows at a
      // glance whether the last thing written was yours or your partner's.
      this.#paint.fillStyle(PALETTE[note.author === "KEEPER" ? "cyanDeep" : "amberDeep"], 1);
      this.#paint.fillRect(WALL_PAD_X + 2, ROOM_TOP + 12 + index * 5, WALL_PAD_WIDTH - 4, 2);
    });

    // The readable copy.
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
   * This is the visible half of the `toolchange` beat. It is drawn from the
   * page's own answer rather than from a record of what was registered, so
   * the animation cannot lie about a registration that did not take.
   */
  #drawManifest(): void {
    const tools = this.#model.tools;
    // The header carries the count, so the plate can show the most recently
    // registered few without needing a "+N more" line it has no room for. The
    // newest are the interesting ones: they are the ones that just changed.
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
      const x = 4 + index * 104;
      const colour = PALETTE[CHANNEL_COLOUR[row.channel]];
      this.#paint.fillStyle(colour, 1);
      this.#paint.fillRect(x, LEGEND_Y + 1, 5, 5);
      this.#pool.write(x + 8, LEGEND_Y, `${row.marker} ${row.text}`, colour);
    });
  }
}

/** The scene keys, so `station.ts` does not repeat the strings. */
export const SCENE_LANDING = "landing";
export const SCENE_CHAMBER = "chamber";
