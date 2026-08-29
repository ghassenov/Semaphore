/**
 * The two scenes, and the only files in the client that touch Phaser.
 *
 * They are deliberately thin. Every decision about what a frame contains is
 * made by `room.ts` and `atlas.ts`, which are pure and tested; these classes
 * turn those answers into sprites and do nothing else. If a question can be
 * answered without a canvas, it is not answered here.
 *
 * Two scenes rather than one per chamber. The chambers differ in what they
 * contain, not in how they are drawn, and a scene per room would mean four
 * transitions per session for a renderer that is already doing almost nothing
 * at this resolution. Doc 07 section 6 names listener accumulation across
 * transitions as the frame-time problem this project is actually likely to
 * have, and the cheapest way not to have it is not to transition.
 *
 * **The canvas is the room and nothing else** (D-036). The readouts that used
 * to be crammed above and below it - the clock, the meter, the log, the pad,
 * the manifest, the legend - are the DOM console now. What is left here is
 * what a canvas is genuinely the right surface for and a text node is the
 * wrong one: the room, the mechanism, the glyphs PILOT has to describe, and
 * the two bodies.
 */

import Phaser from "phaser";
import {
  CANVAS_TILES,
  INTERLUDE_PLAN,
  interlude,
  roomPlan,
  tilesFor,
  type Device,
  type RoomPlan,
} from "./room.js";
import { LOAD, TILE, textureKey } from "./atlas.js";
import { CHANNEL_COLOUR, PALETTE } from "./palette.js";
import { TEXTURE, allSprites, toCanvas } from "./sprites.js";
import type { StationModel } from "./station.js";

/** Captions only. The room says everything else with sprites. */
const FONT = { fontFamily: "monospace", fontSize: "8px" } as const;

/** How far a device's caption sits below its tile. */
const CAPTION_DROP = 1;

/**
 * Milliseconds a device spends on each frame of a state change.
 *
 * Twelve frames per second on game motion (doc 06 section 3), so a door's
 * three leaves take a quarter of a second to swing.
 */
const MOTION_MS = 1000 / 12;

/** How many frames the teleporter pad's flourish runs for. */
const VFX_FRAMES = 4;

/**
 * Load the art pack, and build the sprites that are still authored in source.
 *
 * Two mechanisms because there are two kinds of art. The pack arrives over the
 * network and needs a real `preload`; the glyphs and the bodies are pixel maps
 * in `sprites.ts` and become canvas textures with nothing to wait for. Both are
 * guarded on `exists` because both scenes call them and a texture key may only
 * be claimed once.
 */
function preloadArt(scene: Phaser.Scene): void {
  for (const sheet of LOAD) {
    if (scene.textures.exists(sheet.key)) continue;
    scene.load.spritesheet(sheet.key, sheet.url, { frameWidth: TILE, frameHeight: TILE });
  }
}

function installSprites(scene: Phaser.Scene): void {
  for (const [key, sprite] of allSprites()) {
    if (scene.textures.exists(key)) continue;
    scene.textures.addCanvas(key, toCanvas(sprite));
  }
}

/**
 * A pool of reused game objects of one kind.
 *
 * Phaser objects are expensive to create and this renderer redraws the whole
 * room every frame, so creating them per frame would allocate hundreds of
 * objects a second for a screen that changes a few times a minute. The pool
 * hands out the same objects in the same order each frame and hides whatever
 * this frame did not need.
 *
 * One generic class rather than three near-identical ones, because the room
 * now pools text, tiles and devices and the "hand out, then hide the surplus"
 * dance is the part that is easy to get subtly wrong in each copy.
 */
class Pool<T extends Phaser.GameObjects.GameObject & { setVisible(v: boolean): T }> {
  readonly #items: T[] = [];
  readonly #make: () => T;
  #used = 0;

  constructor(make: () => T) {
    this.#make = make;
  }

  begin(): void {
    this.#used = 0;
  }

  /** The next object, created only if this frame has outgrown the pool. */
  next(): T {
    let item = this.#items[this.#used];
    if (!item) {
      item = this.#make();
      this.#items.push(item);
    }
    this.#used += 1;
    return item;
  }

  /** Finish a frame. Hides the surplus rather than destroying it. */
  end(): void {
    for (let i = this.#used; i < this.#items.length; i += 1) this.#items[i]?.setVisible(false);
  }
}

/** Where a room's interior sits on the canvas, in tiles. */
interface Origin {
  readonly col: number;
  readonly row: number;
}

/**
 * Centre a room's interior on the canvas.
 *
 * Whole tiles, because a room offset by half a tile puts every sprite in it on
 * a half pixel, which is the fractional-scaling shimmer D-031 exists to
 * prevent arriving by the back door.
 */
export function originFor(plan: RoomPlan): Origin {
  return {
    col: Math.floor((CANVAS_TILES - plan.cols) / 2),
    row: Math.floor((CANVAS_TILES - plan.rows) / 2),
  };
}

/**
 * The screen before the shift begins.
 *
 * The station from outside: a dark room with its door shut and the two of them
 * waiting by it. The starter prompt card is *not* here. It lives in the DOM
 * console, because it has to be selectable and copyable and a canvas is
 * neither, and it is safe there because it is public copy holding no puzzle
 * fact.
 */
export class LandingScene extends Phaser.Scene {
  readonly #model: StationModel;
  #lamp!: Phaser.GameObjects.Image;

  constructor(model: StationModel) {
    super("landing");
    this.#model = model;
  }

  preload(): void {
    preloadArt(this);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.void);
    installSprites(this);

    const plan: RoomPlan = { ...INTERLUDE_PLAN, cols: 12, rows: 9, tiles: tilesFor(12, 9, []) };
    const origin = originFor(plan);
    paintTiles(this, plan, origin, 0.7);

    // The door they have not gone through yet, and the lamp above it.
    const doorCol = origin.col + Math.floor(plan.cols / 2) - 1;
    for (let i = 0; i < 2; i += 1) {
      this.add
        .image(px(doorCol + i), px(origin.row), textureKey("shared", "door"))
        .setOrigin(0, 0)
        .setFrame(0);
    }
    this.#lamp = this.add
      .image(px(doorCol + 1), px(origin.row + 1), textureKey("pilot", "led"))
      .setOrigin(0.5, 0)
      .setFrame(1);

    const midRow = origin.row + plan.rows - 3;
    this.add.image(px(origin.col + 2), px(midRow), TEXTURE.pilot).setOrigin(0, 0);
    this.add.image(px(origin.col + plan.cols - 3), px(midRow), TEXTURE.keeper).setOrigin(0, 0);

    // The lamp breathes so a page waiting for its first frame does not look
    // frozen. Twelve frames per second on game motion (doc 06 section 3).
    this.tweens.add({
      targets: this.#lamp,
      alpha: { from: 1, to: 0.3 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
    });
  }

  override update(): void {
    // KEEPER arrives when its tools do, which is the only thing on this screen
    // that moves for a reason. Read from the registry, never from a guess.
    this.#lamp.setFrame(this.#model.tools.length > 0 ? 1 : 0);
  }
}

/**
 * The room the pair is standing in, from above.
 *
 * One room at working size rather than the whole building at once. The station
 * used to be drawn as a section so that progress was visible and the phases
 * between chambers had something to show; both of those are the console's job
 * now (`floors.ts`), which is what freed the canvas for the room.
 */
export class ChamberScene extends Phaser.Scene {
  readonly #model: StationModel;
  #paint!: Phaser.GameObjects.Graphics;
  #tiles!: Pool<Phaser.GameObjects.Image>;
  #sprites!: Pool<Phaser.GameObjects.Image>;
  #text!: Pool<Phaser.GameObjects.Text>;
  #pilot!: Phaser.GameObjects.Image;
  #keeper!: Phaser.GameObjects.Image;
  /** Where PILOT is standing, as a fraction across the room they are in. */
  #walk = 0.15;
  /**
   * The frame each device is currently showing, and when it last changed.
   *
   * The pack draws its doors, levers and pads as short strips rather than as
   * two states, and snapping across one throws away the only motion in the
   * game: the moment the thing KEEPER just did visibly happens. Keyed by where
   * the device is rather than by the sprite drawing it, because the sprites
   * are pooled and a given object is a different device from one frame to the
   * next.
   */
  readonly #motion = new Map<string, { shown: number; at: number; vfx: number }>();
  /** The room the motion table describes, so a new one starts from rest. */
  #motionRoom: string | null = null;

  constructor(model: StationModel) {
    super("chamber");
    this.#model = model;
  }

  preload(): void {
    preloadArt(this);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.void);
    installSprites(this);

    this.#tiles = new Pool(() => this.add.image(0, 0, "").setOrigin(0, 0).setDepth(0));
    this.#paint = this.add.graphics().setDepth(1);
    this.#sprites = new Pool(() => this.add.image(0, 0, "").setOrigin(0, 0).setDepth(2));
    this.#text = new Pool(() => this.add.text(0, 0, "", FONT).setDepth(4));
    this.#pilot = this.add.image(0, 0, TEXTURE.pilot).setOrigin(0, 0).setDepth(3);
    this.#keeper = this.add.image(0, 0, TEXTURE.keeper).setOrigin(0, 0).setDepth(3);

    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error("The station needs a keyboard to move PILOT");
    keyboard.addKeys("A,D,LEFT,RIGHT");
  }

  override update(time: number, deltaMs: number): void {
    const view = this.#model.view;
    const plan = view ? (roomPlan(view) ?? INTERLUDE_PLAN) : INTERLUDE_PLAN;
    const origin = originFor(plan);

    // A device that has left the room has no state worth keeping, and a new
    // chamber that happens to put the same kind of device on the same tile
    // would otherwise inherit the old one's position and animate out of it.
    const room = view?.chamber ?? null;
    if (room !== this.#motionRoom) {
      this.#motion.clear();
      this.#motionRoom = room;
    }

    this.#movePilot(deltaMs);
    this.#paint.clear();
    this.#tiles.begin();
    this.#sprites.begin();
    this.#text.begin();

    paintTiles(this, plan, origin, 1, this.#tiles);
    for (const plate of plan.plates) {
      this.#tiles
        .next()
        .setTexture(textureKey("shared", "ground-special"))
        .setFrame(plate.frame)
        .setPosition(px(origin.col + plate.col), px(origin.row + plate.row))
        .setAlpha(0.85)
        .setVisible(true);
    }

    for (const device of plan.devices) this.#drawDevice(device, origin, plan, time);
    this.#drawBodies(plan, origin);
    if (!view || roomPlan(view) === null) this.#drawInterlude(plan, origin);
    if (plan.solved) this.#flash(plan, origin);

    this.#tiles.end();
    this.#sprites.end();
    this.#text.end();
  }

  /**
   * One device: its sprite, its caption, and the glyph plate above it.
   *
   * The channel picks the directory the sprite is loaded from, so the colour
   * and the meaning arrive together and cannot be made to disagree.
   */
  #drawDevice(device: Device, origin: Origin, plan: RoomPlan, now: number): void {
    const x = px(origin.col + device.col);
    const y = px(origin.row + device.row);
    const colour = PALETTE[CHANNEL_COLOUR[device.channel]];
    const motion = this.#stepFrame(device, now);

    this.#sprites
      .next()
      .setTexture(textureKey(device.channel, device.sheet))
      .setFrame(motion.shown)
      .setPosition(x, y)
      .setAlpha(device.dim === true ? 0.55 : 1)
      .setVisible(true);

    // The pad's flourish, over the pad, for the four frames after it lights.
    const since = now - motion.vfx;
    if (motion.vfx >= 0 && since < VFX_FRAMES * MOTION_MS) {
      this.#sprites
        .next()
        .setTexture(textureKey(device.channel, "pad-vfx"))
        .setFrame(Math.floor(since / MOTION_MS))
        .setPosition(x, y)
        .setAlpha(1)
        .setVisible(true);
    }

    if (device.glyph) this.#drawGlyph(device.glyph, x, y - TILE, colour);
    if (device.label !== undefined) {
      this.#caption(device.label, x + TILE / 2, y + TILE + CAPTION_DROP, colour, origin, plan);
    }
  }

  /**
   * The frame a device is showing, walked one step toward the one it should be.
   *
   * The server is the only authority on what state a device is in, and this
   * never argues with it: it converges on `device.frame` and stops. That is
   * the whole reason this is a stepper rather than a set of Phaser animations.
   * A played animation is a fixed sequence that has to be cancelled when the
   * state changes underneath it, and a door caught halfway by a second update
   * would either finish opening a door the server has shut or stall on a frame
   * nobody chose. A stepper cannot: whatever happens, it is walking toward the
   * truth, and the worst case is that it arrives a frame or two late.
   *
   * A device first seen is drawn at its real frame rather than animated up to
   * it, so entering a room with a lever already thrown shows a thrown lever
   * rather than one that throws itself on arrival.
   */
  #stepFrame(device: Device, now: number): { shown: number; vfx: number } {
    const key = `${device.channel}:${device.sheet}:${String(device.col)}:${String(device.row)}`;
    const state = this.#motion.get(key);
    if (!state) {
      const fresh = { shown: device.frame, at: now, vfx: -1 };
      this.#motion.set(key, fresh);
      return fresh;
    }
    if (state.shown === device.frame || now - state.at < MOTION_MS) return state;
    state.shown += Math.sign(device.frame - state.shown);
    state.at = now;
    // A pad coming up is the one transition in the game that gets a flourish.
    if (device.sheet === "pad" && state.shown === device.frame && device.frame > 0) {
      state.vfx = now;
    }
    return state;
  }

  /**
   * A device's caption, kept inside the room.
   *
   * Captions are centred under their tile and are routinely wider than it: a
   * lamp one tile from the wall wearing the word STRIKES puts half of it
   * through the wall and onto whatever is beyond. Clamping here rather than
   * choosing safer columns per chamber is the fix that holds for the next
   * caption too, and it is measured from the text object rather than estimated,
   * because the browser is the only thing that knows how wide 8px monospace
   * actually is.
   */
  #caption(
    label: string,
    centreX: number,
    y: number,
    colour: number,
    origin: Origin,
    plan: RoomPlan,
  ): void {
    const text = this.#write(centreX, y, label, colour, 0.5);
    const half = text.width / 2;
    const left = px(origin.col) + half;
    const right = px(origin.col + plan.cols) - half;
    // A caption wider than the room itself cannot be clamped into it, so it is
    // centred and allowed to overhang equally rather than pinned to one side.
    const x = left > right ? (left + right) / 2 : Math.min(Math.max(centreX, left), right);
    text.setPosition(Math.round(x), Math.round(y));
  }

  /**
   * The glyph a device wears, on a plate one tile above it.
   *
   * Above rather than on the face, because the pack's devices are shaded
   * objects rather than flat plates and a 16x16 mark drawn over one hides the
   * device it is supposed to identify. A plate of its own also gives the glyph
   * a dark ground, which is what it needs: the shape is the thing PILOT has to
   * get across in words, so it is the one sprite in the room that may not be
   * hard to see.
   *
   * The tint is the channel's, so the same mark that says "this is a spiral"
   * also says "only PILOT can perceive this", and the two cannot disagree.
   */
  #drawGlyph(glyph: string, x: number, y: number, colour: number): void {
    const key = TEXTURE.glyph(glyph);
    if (!this.textures.exists(key)) return;
    this.#paint.fillStyle(PALETTE.void, 0.85);
    this.#paint.fillRect(x, y, TILE, TILE);
    this.#paint.lineStyle(1, colour, 0.7);
    this.#paint.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
    this.#sprites
      .next()
      .setTexture(key)
      .setFrame(0)
      .setPosition(x, y)
      .setTint(colour)
      .setAlpha(1)
      .setVisible(true);
  }

  /**
   * PILOT on the floor, and KEEPER in the wall.
   *
   * KEEPER is drawn *in* the right-hand wall rather than in the room, because
   * it is not in the room: it is behind the station's panels, reaching into
   * every cavity at once. They can see each other and reach each other
   * nowhere, and putting the frame in the wall is the drawing that says so.
   */
  #drawBodies(plan: RoomPlan, origin: Origin): void {
    const col = origin.col + Math.round(this.#walk * (plan.cols - 1));
    this.#pilot.setPosition(px(col), px(origin.row + plan.rows - 1)).setVisible(true);

    const busy = performance.now() < this.#model.busyUntilMs;
    this.#keeper
      .setPosition(px(origin.col + plan.cols), px(origin.row + Math.floor(plan.rows / 2)))
      .setTint(busy ? PALETTE.cyanBright : PALETTE.bone)
      .setVisible(true);

    // One brass segment per registered tool, down the wall beside the frame.
    // Read from `getTools()` rather than from a record of what was registered,
    // so a registration that silently failed costs KEEPER a visible limb.
    this.#paint.fillStyle(PALETTE.brass, 1);
    this.#model.tools.forEach((_tool, index) => {
      this.#paint.fillRect(px(origin.col + plan.cols) + 13, px(origin.row) + 2 + index * 4, 3, 2);
    });
  }

  /** What the room says when there is no chamber in it. */
  #drawInterlude(plan: RoomPlan, origin: Origin): void {
    const view = this.#model.view;
    const [headline, instruction] = view
      ? interlude(view)
      : (["CONNECTING", ""] as readonly [string, string]);
    const midX = px(origin.col) + (plan.cols * TILE) / 2;
    const midY = px(origin.row) + (plan.rows * TILE) / 2;
    this.#write(midX, midY - 8, headline, PALETTE.bone, 0.5);
    if (instruction) this.#write(midX, midY + 4, instruction, PALETTE.boneDim, 0.5);
  }

  /**
   * The room, solved.
   *
   * A bone-white wash rather than a green one. There is no green in the
   * palette precisely so that success cannot be signalled with a colour one
   * player in twelve cannot separate from red.
   */
  #flash(plan: RoomPlan, origin: Origin): void {
    this.#paint.fillStyle(PALETTE.bone, 0.12);
    this.#paint.fillRect(px(origin.col), px(origin.row), plan.cols * TILE, plan.rows * TILE);
  }

  #write(
    x: number,
    y: number,
    content: string,
    colour: number,
    originX = 0,
  ): Phaser.GameObjects.Text {
    return this.#text
      .next()
      .setPosition(Math.round(x), Math.round(y))
      .setText(content)
      .setColor(`#${colour.toString(16).padStart(6, "0")}`)
      .setOrigin(originX, 0)
      .setVisible(true);
  }

  /**
   * PILOT walks the room they are standing in.
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
    // Stored as a fraction so PILOT keeps their place across a room change.
    this.#walk = Math.max(0, Math.min(1, this.#walk + direction * (deltaMs / 1000) * 0.35));
  }
}

/** A tile coordinate in canvas pixels. */
function px(tile: number): number {
  return tile * TILE;
}

/**
 * The building: the room's floor and the wall around it, in one pass.
 *
 * This was `paintFloor` plus `paintWalls`, one flat tile repeated inside a
 * nine-slice ring. Both are gone because both assumed the room was a
 * rectangle. `room.ts` resolves every tile from its neighbours now, so this
 * function no longer knows or cares what shape it is drawing, and a chamber
 * can be notched into an L without a line changing here.
 *
 * The floor is always neutral and the wall always wears the room's accent.
 * That is the channel law applied to the building rather than to a device: a
 * room only PILOT can read is walled in amber, and the floor stays out of it
 * because a floor is not a fact.
 */
function paintTiles(
  scene: Phaser.Scene,
  plan: RoomPlan,
  origin: Origin,
  alpha: number,
  pool?: Pool<Phaser.GameObjects.Image>,
): void {
  const floorKey = textureKey("shared", "ground");
  const wallKey = textureKey(plan.accent, "walls-out");
  for (const tile of plan.tiles) {
    const key = tile.wall ? wallKey : floorKey;
    const image = pool?.next() ?? scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(0);
    image
      .setTexture(key)
      .setFrame(tile.frame)
      .setPosition(px(origin.col + tile.col), px(origin.row + tile.row))
      .setAlpha(alpha)
      .setVisible(true);
  }
}

/** The scene keys, so `station.ts` does not repeat the strings. */
export const SCENE_LANDING = "landing";
export const SCENE_CHAMBER = "chamber";
