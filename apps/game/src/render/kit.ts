/**
 * The station's art supplies: materials, generated textures, labels and glow.
 *
 * Everything in this module exists so that the geometry builders beside it can
 * ask for "brass" or "a lamplight glow" rather than each inventing a set of
 * shading numbers. Three reasons that matters here more than it usually would.
 *
 * **The palette stays locked.** A colour reaches a surface through one of these
 * factories or it does not reach a surface. There is no `new MeshStandard...`
 * anywhere else in the client, so a fifteenth colour cannot arrive inside a
 * material the way it used to be able to arrive inside a PNG (D-029's rule,
 * kept through D-042's rewrite).
 *
 * **Materials are shared.** A station is a few hundred meshes made of about ten
 * substances. Building a material per mesh would compile a shader per mesh, and
 * the first frame is the one a judge is waiting through.
 *
 * **Nothing is loaded.** Every texture here is drawn into a canvas at boot:
 * grain, glow, the labels, the monitor's phosphor. There are no image files in
 * this game (D-044), so there is no loader, no atlas, no request, no licence to
 * track, and the whole repository is MIT again.
 */

import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  PlaneGeometry,
  RepeatWrapping,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector2,
  type Texture,
} from "three";
import { CHANNEL, PALETTE, hex, type RenderChannel } from "./palette.js";

/**
 * A canvas of value noise, used to break up flat surfaces.
 *
 * Stone that is one exact colour across four metres reads as a computer
 * drawing, and the fix that costs nothing is a roughness map: the surface stays
 * one colour and stops being one *sheen*, so a light moving across it finds
 * something to catch. Two octaves is enough at this scale; more looks like
 * gravel.
 */
function grainCanvas(size = 256): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("A 2D context is needed to draw the station's grain");

  const image = context.createImageData(size, size);
  // A cheap deterministic hash rather than Math.random, so the station looks
  // the same on every load and a screenshot tour is comparable with the last.
  const noise = (x: number, y: number, seed: number): number => {
    const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
    return n - Math.floor(n);
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const coarse = noise(Math.floor(x / 8), Math.floor(y / 8), 1);
      const fine = noise(x, y, 2);
      const value = Math.round(150 + coarse * 70 + fine * 35);
      const at = (y * size + x) * 4;
      image.data[at] = value;
      image.data[at + 1] = value;
      image.data[at + 2] = value;
      image.data[at + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

/**
 * A soft radial falloff, drawn once and used for every glow in the game.
 *
 * This is the whole of the bloom pipeline, and that is a deliberate choice
 * (D-042). A real post-processing chain would look marginally better on a
 * desktop GPU and costs a full-screen pass at a resolution nobody controls, on
 * a target list that includes ChatGPT's in-app browser on a phone. An additive
 * sprite behind every emissive surface gives the same read - the hue lives in
 * the halo, the source blows out to white under the tone curve - for the price
 * of one draw call per lit thing.
 *
 * The curve is squared rather than linear because a linear falloff has a
 * visible edge where it reaches zero, and the edge is what gives a fake glow
 * away.
 */
function glowCanvas(size = 128): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("A 2D context is needed to draw the station's glow");

  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  for (let stop = 0; stop <= 10; stop += 1) {
    const t = stop / 10;
    gradient.addColorStop(t, `rgba(255,255,255,${String((1 - t) * (1 - t))})`);
  }
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return canvas;
}

/**
 * The console's typeface, restated for the textures drawn in the scene.
 *
 * Large, because the texture is the resolution ceiling: a caption drawn at
 * 34px and then stretched across half a metre of wall is a blurred caption
 * however big the wall is, and the first build shipped exactly that. Drawing it
 * at 72 and letting it scale *down* is the only way round it that does not
 * involve a font file.
 */
const LABEL_FONT = '700 72px ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/** How many pixels of padding a label texture keeps around its text. */
const LABEL_PAD = 26;

/** The drawn height of a caption's canvas, before its padding. */
const LABEL_LINE = 96;

/**
 * Draw a caption into a canvas, sized to the text.
 *
 * Measured rather than estimated. Captions being wider than the thing they
 * label has been the single most repeated layout bug in this client across
 * three renderers, and every fix that held was a fix that asked the browser how
 * wide the text actually was.
 */
function labelCanvas(text: string, colour: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("A 2D context is needed to draw a label");

  context.font = LABEL_FONT;
  const width = Math.ceil(context.measureText(text).width) + LABEL_PAD * 2;
  const height = LABEL_LINE + LABEL_PAD;
  canvas.width = width;
  canvas.height = height;

  // Setting the size clears the context, so the font has to be set again.
  const draw = canvas.getContext("2d");
  if (!draw) throw new Error("A 2D context is needed to draw a label");
  draw.font = LABEL_FONT;
  draw.textAlign = "center";
  draw.textBaseline = "middle";

  // An engraved plate rather than a wash: a filled ground, a bright top edge
  // and a dark bottom one, so the caption reads as something bolted to the
  // equipment rather than as text floating in front of it. It also guarantees
  // contrast without needing the wall behind it to cooperate.
  draw.fillStyle = "rgba(6,9,13,0.86)";
  draw.fillRect(0, 0, width, height);
  draw.fillStyle = "rgba(255,255,255,0.10)";
  draw.fillRect(0, 0, width, 2);
  draw.fillStyle = "rgba(0,0,0,0.55)";
  draw.fillRect(0, height - 2, width, 2);

  draw.fillStyle = hex(colour);
  draw.fillText(text, width / 2, height / 2);
  return canvas;
}

/**
 * The shared substances the station is built from.
 *
 * Held on one object rather than as module-level constants because they own GPU
 * resources: a session that ends has to be able to hand them back, and a set of
 * loose `const`s cannot be disposed.
 */
/**
 * A normal map of shallow overlapping waves.
 *
 * Encoded the way a normal map is - the surface's tilt as a colour, with flat
 * as the pale blue at (0.5, 0.5, 1) - so a stock material can use it with no
 * shader of our own. Two wave trains at different angles and wavelengths,
 * because one is a corrugated roof and two is water.
 */
function rippleCanvas(size = 128): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("A 2D context is needed to draw the water");

  const image = context.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      // The height field's slope in each direction. Kept shallow: a steep
      // normal map on a near-mirror surface scatters every reflection into
      // noise, which is exactly what water does not look like.
      const slopeX = Math.cos(u * 3 + v) * 0.5 + Math.cos(u * 5 - v * 2) * 0.25;
      const slopeY = Math.cos(v * 4 - u) * 0.5 + Math.cos(v * 6 + u * 3) * 0.2;
      const at = (y * size + x) * 4;
      image.data[at] = Math.round(128 + slopeX * 42);
      image.data[at + 1] = Math.round(128 + slopeY * 42);
      image.data[at + 2] = 255;
      image.data[at + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

export class Kit {
  readonly grain: Texture;
  readonly glow: Texture;

  /** Wall and floor stone. Rough, cold, and nearly matte. */
  readonly stone: MeshStandardMaterial;
  /** The floor. Slightly less rough than the walls: the station is damp. */
  readonly floor: MeshStandardMaterial;
  /** Structural metal: frames, rails, the grate, KEEPER's alcove. */
  readonly iron: MeshStandardMaterial;
  /** Mechanism metal: joints, plates, handles. */
  readonly brass: MeshStandardMaterial;
  /** Corroded pipework and the wear on everything. */
  readonly copper: MeshStandardMaterial;
  /**
   * PILOT's coat, and PILOT's face.
   *
   * Neither is lamplight-coloured, and that is a rule rather than a palette
   * choice (doc 06 section 4): warm means "only PILOT can perceive this", and
   * the human is not a fact only the human can perceive. The lamp is the one
   * warm thing on the figure, and it is a lamp.
   */
  readonly coat: MeshStandardMaterial;
  readonly skin: MeshStandardMaterial;
  /** The sea, seen through a porthole. The darkest surface in the station. */
  readonly sea: MeshStandardMaterial;
  /** Painted hazard stripes. Brass, never alarm: alarm is for penalties. */
  readonly hazard: MeshStandardMaterial;
  /** A dead screen, and anything glazed. */
  readonly glass: MeshStandardMaterial;
  /**
   * Standing water.
   *
   * Nearly a mirror and nearly black, so it does nothing at all until a light
   * crosses it and then it does everything. The normal map scrolls, which is
   * the whole of the animation: a still puddle in a room with a moving lamp
   * reads as painted-on floor, and a moving one reads as somewhere the sea gets
   * in.
   */
  readonly water: MeshStandardMaterial;
  readonly ripple: Texture;

  /** Every material this kit has handed out, so all of them can be disposed. */
  readonly #owned: { dispose(): void }[] = [];

  constructor() {
    this.grain = new CanvasTexture(grainCanvas());
    this.grain.wrapS = RepeatWrapping;
    this.grain.wrapT = RepeatWrapping;
    this.grain.repeat.set(4, 4);

    this.glow = new CanvasTexture(glowCanvas());
    this.glow.colorSpace = SRGBColorSpace;

    this.stone = this.#keep(
      new MeshStandardMaterial({
        color: PALETTE.stone,
        roughness: 0.94,
        metalness: 0.04,
        roughnessMap: this.grain,
      }),
    );
    this.floor = this.#keep(
      new MeshStandardMaterial({
        color: PALETTE.stone,
        // Low enough to catch a highlight from every practical in the room,
        // which is what makes the station read as wet rather than as dusty.
        roughness: 0.42,
        metalness: 0.22,
        roughnessMap: this.grain,
      }),
    );
    this.iron = this.#keep(
      new MeshStandardMaterial({ color: PALETTE.iron, roughness: 0.55, metalness: 0.75 }),
    );
    this.brass = this.#keep(
      new MeshStandardMaterial({ color: PALETTE.brass, roughness: 0.33, metalness: 0.92 }),
    );
    this.copper = this.#keep(
      new MeshStandardMaterial({ color: PALETTE.copper, roughness: 0.62, metalness: 0.7 }),
    );
    this.glass = this.#keep(
      new MeshStandardMaterial({ color: PALETTE.glass, roughness: 0.14, metalness: 0.3 }),
    );
    this.coat = this.#keep(
      new MeshStandardMaterial({ color: PALETTE.stone, roughness: 0.9, metalness: 0.02 }),
    );
    this.skin = this.#keep(
      new MeshStandardMaterial({ color: PALETTE.pearlDim, roughness: 0.72, metalness: 0 }),
    );
    this.sea = this.#keep(
      new MeshStandardMaterial({ color: PALETTE.abyss, roughness: 0.22, metalness: 0.55 }),
    );
    this.hazard = this.#keep(
      new MeshStandardMaterial({ color: PALETTE.brass, roughness: 0.75, metalness: 0.15 }),
    );

    this.ripple = new CanvasTexture(rippleCanvas());
    this.ripple.wrapS = RepeatWrapping;
    this.ripple.wrapT = RepeatWrapping;
    this.ripple.repeat.set(3, 3);
    this.water = this.#keep(
      new MeshStandardMaterial({
        // Lighter than the floor it lies on, not darker. Water over a wet floor
        // is shinier than the floor, and the first pass made every puddle read
        // as a hole cut in it.
        color: PALETTE.slate,
        // Low metalness, deliberately. A near-mirror metal with no environment
        // map to reflect renders **black**, which is what the first pass did:
        // every puddle in the station came out as a hole in the floor. A dark
        // dielectric with a tight specular highlight catches the room's own
        // lamps instead, which is the only thing there is here to catch.
        roughness: 0.07,
        metalness: 0.1,
        normalMap: this.ripple,
        normalScale: new Vector2(0.6, 0.6),
        transparent: true,
        opacity: 0.58,
      }),
    );
  }

  /**
   * Advance the water.
   *
   * Two scrolls at different rates rather than one, because a single scrolling
   * normal map reads as a sheet of plastic being dragged across the floor; two
   * that disagree read as a surface.
   */
  tideStep(elapsedMs: number): void {
    this.ripple.offset.set((elapsedMs / 26000) % 1, (elapsedMs / 41000) % 1);
  }

  #keep<T extends { dispose(): void }>(item: T): T {
    this.#owned.push(item);
    return item;
  }

  /**
   * A surface that emits its channel's colour.
   *
   * `lit` is the whole difference between a fact that is currently true and one
   * that is not: an unlit fixture keeps its shape and its material and loses
   * only its emission, so a lamp at zero and a lamp that is missing never look
   * the same. That distinction is load-bearing in the Blind Panel, where a
   * needle at zero and a needle that failed to render mean very different
   * things.
   */
  channelSurface(channel: RenderChannel, lit: boolean): MeshStandardMaterial {
    const tones = CHANNEL[channel];
    return this.#keep(
      new MeshStandardMaterial({
        color: lit ? tones.key : tones.deep,
        emissive: tones.key,
        emissiveIntensity: lit ? 1.5 : 0.04,
        roughness: 0.4,
        metalness: 0.25,
      }),
    );
  }

  /**
   * An additive halo, in a channel's colour.
   *
   * Sized in world metres, so a glow is as big as the thing it belongs to
   * rather than as big as it happens to look at one camera distance.
   */
  halo(channel: RenderChannel, metres: number, strength = 0.85): Sprite {
    const material = this.#keep(
      new SpriteMaterial({
        map: this.glow,
        color: new Color(CHANNEL[channel].key),
        blending: AdditiveBlending,
        transparent: true,
        opacity: strength,
        depthWrite: false,
        // Fog would eat the halo of a lamp at the far end of the building,
        // which is exactly the lamp whose halo is doing the most work.
        fog: false,
      }),
    );
    const sprite = new Sprite(material);
    sprite.scale.set(metres, metres, 1);
    return sprite;
  }

  /**
   * A caption that faces the camera, in world metres of cap height.
   *
   * A sprite rather than DOM, and that is a rule rather than a preference. Some
   * of these carry `VISUAL` facts - a gauge's reading, the cipher wheel's
   * offset - and a DOM text node holding one is a text node an agent with page
   * access can scrape. The console beside the canvas may hold public copy and
   * things KEEPER can obtain for itself; it may not hold these.
   */
  label(text: string, colour: number, height = 0.42): Sprite {
    const canvas = labelCanvas(text, colour);
    const texture = this.#keep(new CanvasTexture(canvas));
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    const material = this.#keep(
      new SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        // **Never depth-tested.** A caption is a flat card that always faces
        // the camera, so any caption near a wall intersects it and is sliced in
        // half by it - "PAGE MARKED" went straight through the Signal Room's
        // west wall, and every caption beside a mechanism had the same problem
        // waiting. Drawing it over everything is safe here for a reason
        // specific to this game: captions belong to the room the pair is
        // standing in, and PILOT's lamp has already faded the distant ones to
        // nothing, so there is never a caption in front of you that belongs
        // behind you.
        depthTest: false,
      }),
    );
    const sprite = new Sprite(material);
    sprite.renderOrder = 10;
    sprite.scale.set((height * canvas.width) / canvas.height, height, 1);
    return sprite;
  }

  /**
   * A glyph, as an unlit mark tinted with the channel it belongs to.
   *
   * Nearest filtering, deliberately: the glyphs are the one thing in the
   * station with hard pixel edges, which is what makes the shape PILOT has to
   * describe the sharpest thing in the frame. See `glyphs.ts`.
   */
  glyphPlane(
    canvas: HTMLCanvasElement,
    channel: RenderChannel,
    metres: number,
  ): Mesh<PlaneGeometry, MeshBasicMaterial> {
    const texture = this.#keep(new CanvasTexture(canvas));
    texture.colorSpace = SRGBColorSpace;
    texture.magFilter = NearestFilter;
    texture.minFilter = LinearFilter;
    const material = this.#keep(
      new MeshBasicMaterial({
        map: texture,
        color: new Color(CHANNEL[channel].bright),
        transparent: true,
        side: DoubleSide,
        depthWrite: false,
        // A glyph in shadow is a glyph nobody can describe, so it is unlit and
        // it ignores fog: the room may not decide whether the puzzle is legible.
        fog: false,
      }),
    );
    const mesh = new Mesh(new PlaneGeometry(metres, metres), material);
    this.#keep(mesh.geometry);
    return mesh;
  }

  /** A texture the caller draws into and updates, for the Archive's monitor. */
  screenTexture(canvas: HTMLCanvasElement): CanvasTexture {
    const texture = this.#keep(new CanvasTexture(canvas));
    texture.colorSpace = SRGBColorSpace;
    return texture;
  }

  /** Hand every GPU resource back. Called when a session's stage is torn down. */
  dispose(): void {
    for (const item of this.#owned) item.dispose();
    this.#owned.length = 0;
    this.grain.dispose();
    this.glow.dispose();
    this.ripple.dispose();
  }
}
