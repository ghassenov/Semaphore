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
  PANEL_Y,
  TIMER_URGENT_FRACTION,
  formatTimer,
  meterFill,
  truncate,
} from "./hud.js";
import type { StationModel } from "./station.js";

/** The greybox font. A bitmap font replaces this when art lands. */
const FONT = { fontFamily: "monospace", fontSize: "8px" } as const;

/** PILOT is a person, not a mascot: 16 wide, 24 tall (doc 06 section 3). */
const AVATAR_WIDTH = 16;
const AVATAR_HEIGHT = 24;
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
    this.#pool = new TextPool(this);

    // The station: a hull mass with one lit window. Greybox, and enough of a
    // silhouette to establish the place before anything is asked of anyone.
    this.add.rectangle(160, 122, 240, 76, PALETTE.hull).setOrigin(0.5, 0.5);
    this.add.rectangle(160, 84, 120, 24, PALETTE.hullLight).setOrigin(0.5, 0.5);
    this.#glow = this.add.rectangle(160, 84, 20, 10, PALETTE.amber).setOrigin(0.5, 0.5);

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
    this.#pool.write(160, 24, "SEMAPHORE", PALETTE.bone, 0.5);
    this.#pool.write(160, 38, "A DERELICT SIGNAL STATION", PALETTE.boneDim, 0.5);
    const tools = this.#model.tools.length;
    this.#pool.write(
      160,
      150,
      tools > 0
        ? `KEEPER IS HERE. ${String(tools)} TOOL${tools === 1 ? "" : "S"} ON THE PLATE.`
        : "WAITING FOR KEEPER TO READ ITS TOOLS",
      tools > 0 ? PALETTE.cyan : PALETTE.boneDim,
      0.5,
    );
    this.#pool.write(160, 162, "PASTE THE PROMPT BELOW TO YOUR AGENT", PALETTE.amber, 0.5);
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
  #avatar!: Phaser.GameObjects.Rectangle;
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
    this.#paint = this.add.graphics().setDepth(1);
    this.#pool = new TextPool(this);

    this.#avatar = this.add
      .rectangle(60, FLOOR_Y, AVATAR_WIDTH, AVATAR_HEIGHT, PALETTE.bone)
      .setOrigin(0.5, 1)
      .setDepth(5);

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
    this.#drawRoom();
    this.#drawKeeper();
    this.#drawHud();
    this.#pool.end();
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
    this.#paint.fillStyle(PALETTE.hull, 1);
    this.#paint.fillRect(0, ROOM_TOP, NATIVE_WIDTH, ROOM_BOTTOM - ROOM_TOP);
    this.#paint.fillStyle(PALETTE.hullLight, 1);
    this.#paint.fillRect(0, FLOOR_Y, NATIVE_WIDTH, ROOM_BOTTOM - FLOOR_Y);

    this.#layout = view ? roomLayout(view) : null;
    const layout = this.#layout;
    if (!layout) {
      if (view) this.#pool.write(160, 64, "NO ROOM HERE", PALETTE.boneDim, 0.5);
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

  /** One piece: filled body, channel outline, marker and caption. */
  #drawPiece(piece: Piece): void {
    const colour =
      PALETTE[piece.active ? CHANNEL_COLOUR[piece.channel] : CHANNEL_DIM[piece.channel]];
    this.#paint.fillStyle(colour, piece.active ? 1 : 0.55);
    this.#paint.fillRect(piece.x, piece.y, piece.w, piece.h);
    this.#paint.lineStyle(1, colour, 1);
    this.#paint.strokeRect(piece.x + 0.5, piece.y + 0.5, piece.w - 1, piece.h - 1);
    // The marker rides on every channel-coded piece, so the colour is never
    // the only thing saying who can perceive it.
    this.#pool.write(piece.x + 1, piece.y + 1, CHANNEL_MARKER[piece.channel], PALETTE.void);
    if (piece.label !== undefined) {
      this.#pool.write(piece.x + piece.w / 2, piece.y + piece.h + 1, piece.label, colour, 0.5);
    }
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

    const torsoX = GRATE_X + 18;
    this.#paint.fillStyle(PALETTE.cyanDeep, 1);
    this.#paint.fillRect(torsoX, FLOOR_Y - 34, 24, 34);
    this.#paint.fillStyle(busy ? PALETTE.cyanBright : PALETTE.cyan, 1);
    this.#paint.fillRect(torsoX + 4, FLOOR_Y - 30, 16, 5);

    // One limb segment per registered tool, brass, stacked down the torso.
    this.#paint.fillStyle(PALETTE.brass, 1);
    this.#model.tools.forEach((_tool, index) => {
      const y = FLOOR_Y - 22 + (index % 6) * 3;
      const x = index < 6 ? torsoX - 8 : torsoX + 26;
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
    if (report?.bits != null) this.#peakBits = Math.max(this.#peakBits, report.bits);

    const track = NATIVE_WIDTH - 8;
    this.#paint.fillStyle(PALETTE.hull, 1);
    this.#paint.fillRect(4, METER_Y, track, METER_HEIGHT);
    const fill = meterFill(report?.bits ?? null, this.#peakBits);
    if (fill > 0) {
      this.#paint.fillStyle(PALETTE.brass, 1);
      this.#paint.fillRect(4, METER_Y, Math.max(1, Math.round(track * fill)), METER_HEIGHT);
    }
    this.#pool.write(
      4,
      METER_Y + METER_HEIGHT + 1,
      report?.bits == null
        ? "REMAINING AMBIGUITY -"
        : `REMAINING AMBIGUITY ${report.bits.toFixed(2)} BITS`,
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
