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
  type Device,
  type RoomPlan,
} from "./room.js";
import { LOAD, SLICE, TILE, groundFrame, textureKey } from "./atlas.js";
import { CHANNEL_COLOUR, PALETTE } from "./palette.js";
import { TEXTURE, allSprites, toCanvas } from "./sprites.js";
import type { StationModel } from "./station.js";

/** Captions only. The room says everything else with sprites. */
const FONT = { fontFamily: "monospace", fontSize: "8px" } as const;

/** How far a device's caption sits below its tile. */
const CAPTION_DROP = 1;

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

    const plan: RoomPlan = { ...INTERLUDE_PLAN, cols: 12, rows: 9 };
    const origin = originFor(plan);
    paintFloor(this, plan, origin, 0.55);
    paintWalls(this, plan, origin, 0.75);

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

  override update(_time: number, deltaMs: number): void {
    const view = this.#model.view;
    const plan = view ? (roomPlan(view) ?? INTERLUDE_PLAN) : INTERLUDE_PLAN;
    const origin = originFor(plan);

    this.#movePilot(deltaMs);
    this.#paint.clear();
    this.#tiles.begin();
    this.#sprites.begin();
    this.#text.begin();

    paintFloor(this, plan, origin, 1, this.#tiles);
    paintWalls(this, plan, origin, 1, this.#tiles);
    for (const plate of plan.plates) {
      this.#tiles
        .next()
        .setTexture(textureKey("shared", "ground-special"))
        .setFrame(plate.frame)
        .setPosition(px(origin.col + plate.col), px(origin.row + plate.row))
        .setAlpha(0.85)
        .setVisible(true);
    }

    for (const device of plan.devices) this.#drawDevice(device, origin, plan);
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
  #drawDevice(device: Device, origin: Origin, plan: RoomPlan): void {
    const x = px(origin.col + device.col);
    const y = px(origin.row + device.row);
    const colour = PALETTE[CHANNEL_COLOUR[device.channel]];

    this.#sprites
      .next()
      .setTexture(textureKey(device.channel, device.sheet))
      .setFrame(device.frame)
      .setPosition(x, y)
      .setAlpha(device.dim === true ? 0.55 : 1)
      .setVisible(true);

    if (device.glyph) this.#drawGlyph(device.glyph, x, y - TILE, colour);
    if (device.label !== undefined) {
      this.#caption(device.label, x + TILE / 2, y + TILE + CAPTION_DROP, colour, origin, plan);
    }
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
 * The floor.
 *
 * Every tile is one of five interior frames, chosen from its own coordinates,
 * so the floor has rivets in different places without shimmering and without a
 * seed. A pool is passed in when the caller redraws every frame and omitted
 * when it draws once.
 */
function paintFloor(
  scene: Phaser.Scene,
  plan: RoomPlan,
  origin: Origin,
  alpha: number,
  pool?: Pool<Phaser.GameObjects.Image>,
): void {
  const key = textureKey("shared", "ground");
  for (let row = 0; row < plan.rows; row += 1) {
    for (let col = 0; col < plan.cols; col += 1) {
      const image =
        pool?.next() ?? scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(0);
      image
        .setTexture(key)
        .setFrame(groundFrame(col, row))
        .setPosition(px(origin.col + col), px(origin.row + row))
        .setAlpha(alpha)
        .setVisible(true);
    }
  }
}

/**
 * The wall around the room, as a nine-slice.
 *
 * Corners placed, edges repeated. The pack draws its walls as one framed box,
 * which is a nine-slice whether or not it was authored as one, and building
 * the ring from it is what lets each chamber declare its own size without any
 * of them needing art of their own.
 */
function paintWalls(
  scene: Phaser.Scene,
  plan: RoomPlan,
  origin: Origin,
  alpha: number,
  pool?: Pool<Phaser.GameObjects.Image>,
): void {
  const key = textureKey("shared", "walls-out");
  const left = origin.col - 1;
  const right = origin.col + plan.cols;
  const top = origin.row - 1;
  const bottom = origin.row + plan.rows;

  const place = (col: number, row: number, frame: number) => {
    const image = pool?.next() ?? scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(0);
    image
      .setTexture(key)
      .setFrame(frame)
      .setPosition(px(col), px(row))
      .setAlpha(alpha)
      .setVisible(true);
  };

  place(left, top, SLICE.topLeft);
  place(right, top, SLICE.topRight);
  place(left, bottom, SLICE.bottomLeft);
  place(right, bottom, SLICE.bottomRight);
  for (let col = origin.col; col < right; col += 1) {
    place(col, top, SLICE.top);
    place(col, bottom, SLICE.bottom);
  }
  for (let row = origin.row; row < bottom; row += 1) {
    place(left, row, SLICE.left);
    place(right, row, SLICE.right);
  }
}

/** The scene keys, so `station.ts` does not repeat the strings. */
export const SCENE_LANDING = "landing";
export const SCENE_CHAMBER = "chamber";
