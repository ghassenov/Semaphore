/**
 * The things standing in a room, built as geometry.
 *
 * `chamber.ts` says a lever is at these coordinates in this channel and is
 * currently thrown. This module is the only thing that knows what a lever looks
 * like. Nothing here reads a `PilotView`, decides a layout, or knows which room
 * it is in: it is handed one `Fixture` and builds the object it describes.
 *
 * ## Devices step toward the server, they never play an animation
 *
 * This is D-037's rule, carried through the rewrite unchanged, and in three
 * dimensions it matters more rather than less. Every moving fixture holds a
 * `progress` between 0 and 1 that eases toward the state the server last
 * reported, every frame, from wherever it currently is. There is no sequence to
 * cancel, so a door caught half-open by an update that shuts it simply turns
 * round: it cannot finish opening a door the server has closed, and it cannot
 * stall on a frame nobody chose. The worst case is that it arrives a moment
 * late.
 *
 * A fixture seen for the first time is placed at its true state rather than
 * animated up to it, so walking into a room with a lever already thrown shows a
 * thrown lever instead of one that throws itself on arrival.
 *
 * ## What a caption may say
 *
 * Captions are sprites in the scene, never DOM. Several of them carry `VISUAL`
 * facts - a gauge's reading, the cipher wheel's offset - and a DOM text node
 * holding one is a text node an agent with page access can scrape. A glyph's
 * *name* appears on no caption anywhere: a fixture wears its glyph as a drawing
 * and says its own position or number, which is what KEEPER can be told to act
 * on.
 */

import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  Sprite,
  TorusGeometry,
  Vector3,
} from "three";
import type { Fixture } from "./chamber.js";
import { GAUGE_MAX, GRATE_WIDTH, MONITOR_DEPTH } from "./chamber.js";
import type { Dressing } from "./chamber.js";
import { GLYPHS, glyphCanvas } from "./glyphs.js";
import { CHANNEL, PALETTE } from "./palette.js";
import { captionHeight } from "./camera.js";
import type { Kit } from "./kit.js";

/**
 * How fast a fixture converges on the state the server reported, per second.
 *
 * Four means a door is most of the way open a quarter of a second after the
 * call that opened it, which is fast enough to feel like a consequence of the
 * call and slow enough that the mechanism has weight. Doc 06 section 10 asks
 * for heavy mechanisms; this is the number that makes them heavy.
 */
const CONVERGENCE_PER_SECOND = 4;

/** How high above a fixture its glyph plate hangs, in metres. */
const GLYPH_HEIGHT = 1.75;

/** How far below a fixture's anchor its caption sits, in metres. */
const CAPTION_DROP = 0.34;

/**
 * The lowest a caption may hang, in metres above the floor.
 *
 * A fixture anchored on the floor - a lever, a key, a door - would otherwise
 * put its caption a third of a metre *underground*, where it stands up through
 * the floor as a pale card sitting on top of the mechanism it belongs to. Every
 * key in the Signal Room did exactly that.
 */
const CAPTION_FLOOR = 0.24;

/** What every builder returns: how to animate what it built. */
type Animator = (progress: number, elapsedMs: number, fixture: Fixture) => void;

/** One fixture, built and drivable. */
/** Scratch for the caption resize, so a frame allocates nothing. */
const CAPTION_AT = new Vector3();

export class FixtureView {
  readonly root = new Group();
  readonly #animate: Animator;
  /** The state the server last reported, as a target for `progress`. */
  #wanted = 0;
  #progress = 0;
  #fixture: Fixture;
  /**
   * The parts PILOT's lamp resolves, each with the opacity it was built at.
   *
   * Deliberately *not* the device itself. A lever that faded out with distance
   * would make the room unnavigable; what fades is the detail you would have to
   * walk over to read anyway. See `LAMP_REACH` in `chamber.ts`.
   *
   * **The base opacity is stored, and the lamp assigns rather than multiplies.**
   * The first pass multiplied in place every frame, which is a decay: a caption
   * one step outside the lamp did not settle at nine tenths, it fell to nothing
   * over a couple of seconds and then stayed there even after PILOT walked
   * back. None of these are touched by an animator, so assignment is safe and
   * multiplication never was.
   */
  readonly #readable: { readonly material: { opacity: number }; readonly base: number }[] = [];
  /** How near the lamp is, 0 to 1, eased so walking does not strobe. */
  #reveal = 1;
  #wantedReveal = 1;
  /** Whether a lamp reading has ever been applied, so the first one snaps. */
  #lit = false;
  /**
   * The caption, and the text currently baked into it.
   *
   * A caption is a texture drawn once from a string, so a fixture whose label
   * changes keeps showing the old one until something rebuilds it. Every
   * changing label in the game was stale: a gauge read `0/7` after it had moved
   * to `1/7`, a door said SEALED after it opened, the bolt count never
   * advanced. Reloading the page fixed it, which is exactly the shape of a bug
   * that is only ever seen by somebody playing rather than by a test.
   */
  #caption: { readonly sprite: Sprite; text: string } | null = null;
  readonly #kit: Kit;

  constructor(kit: Kit, fixture: Fixture) {
    this.#kit = kit;
    this.#fixture = fixture;
    this.root.position.set(fixture.at.x, fixture.at.y, fixture.at.z);
    this.root.rotation.y = fixture.facing ?? 0;

    this.#animate = BUILDERS[fixture.kind](kit, fixture, this.root);

    if (fixture.glyph !== undefined && fixture.glyph !== "") {
      const rows = GLYPHS[fixture.glyph];
      if (rows !== undefined) {
        // On a plate of its own, above the mechanism rather than on its face.
        // A 16x16 mark drawn over a shaded object hides the object it is
        // supposed to identify, and the plate gives the glyph the dark ground
        // it needs: the shape is the thing PILOT has to get across in words, so
        // it is the one surface in the room that may not be hard to see.
        const plate = new Mesh(new BoxGeometry(0.78, 0.78, 0.06), kit.brass);
        plate.position.y = GLYPH_HEIGHT;
        plate.castShadow = true;
        this.root.add(plate);

        const mark = kit.glyphPlane(glyphCanvas(rows), fixture.channel, 0.62);
        mark.position.set(0, GLYPH_HEIGHT, 0.05);
        this.root.add(mark);
        this.#readable.push({ material: mark.material, base: mark.material.opacity });

        const halo = kit.halo(fixture.channel, 1.5, 0.4);
        halo.position.set(0, GLYPH_HEIGHT, 0.12);
        this.root.add(halo);
        this.#readable.push({ material: halo.material, base: halo.material.opacity });
      }
    }

    // **Through `#writeCaption`, never inline.** The constructor used to build
    // its own caption here and leave `#caption` null, so the first `apply` saw
    // no caption, wrote a second one, and every fixture in the game carried two
    // stacked sprites for the rest of the session. It read as captions being
    // washed out and slightly doubled - "DIAL 1" printed over "0/7" - which is
    // the kind of fault that looks like a font problem and is not. One path in
    // and the duplicate cannot come back.
    if (fixture.label !== undefined) this.#writeCaption(fixture.label);

    // Placed at its true state rather than animated up to it.
    this.#wanted = fixture.on ? 1 : 0;
    this.#progress = this.#wanted;
    this.#animate(this.#progress, 0, fixture);
  }

  /** Take the server's latest word on this fixture. */
  apply(fixture: Fixture): void {
    this.#fixture = fixture;
    this.#wanted = fixture.on ? 1 : 0;
    // Only when the words actually change. A caption is a canvas, a texture and
    // a material, so rebuilding one every frame would allocate three GPU
    // objects sixty times a second for a string that changes twice a minute.
    if (fixture.label !== undefined && fixture.label !== this.#caption?.text) {
      this.#writeCaption(fixture.label);
    }
  }

  /**
   * Resize this fixture's caption so it reads the same at any camera distance.
   *
   * Called every frame from the stage, which is the only place that knows where
   * the camera is. Cheap: a handful of sprites, one multiply each.
   */
  sizeCaption(cameraAt: Vector3, fovDegrees: number): void {
    const caption = this.#caption;
    if (caption === null) return;
    const sprite = caption.sprite;
    sprite.getWorldPosition(CAPTION_AT);
    const height = captionHeight(CAPTION_AT.distanceTo(cameraAt), fovDegrees);
    const aspect = (sprite.userData.aspect as number | undefined) ?? 4;
    sprite.scale.set(height * aspect, height, 1);
  }

  /**
   * Draw a caption, replacing whatever was there.
   *
   * The old sprite's slot in `#readable` goes with it, so the lamp keeps
   * addressing the caption that is actually on screen rather than a freed one.
   */
  #writeCaption(text: string): void {
    const previous = this.#caption;
    if (previous !== null) {
      const at = this.#readable.findIndex((part) => part.material === previous.sprite.material);
      if (at >= 0) this.#readable.splice(at, 1);
      previous.sprite.removeFromParent();
    }

    const fixture = this.#fixture;
    const sprite = this.#kit.label(text, CHANNEL[fixture.channel].key);
    // A fixture may name its own caption height - a door's sign belongs above
    // the doorway, not at the foot of the lever standing in front of it.
    // Otherwise it hangs below the anchor, clamped in *world* height, because
    // the anchor is what varies between a floor-standing lever and a gauge up a
    // wall.
    const drop = fixture.captionAt ?? Math.max(-CAPTION_DROP, CAPTION_FLOOR - fixture.at.y);
    sprite.position.set(0, drop, 0.3);
    this.root.add(sprite);
    this.#readable.push({ material: sprite.material, base: sprite.material.opacity });
    this.#caption = { sprite, text };
  }

  /**
   * How near PILOT's lamp is, from `lampReveal`.
   *
   * Eased rather than applied directly, for the same reason a device converges
   * rather than snapping: a caption that flicked on at an exact distance would
   * strobe every time somebody stood on the boundary.
   */
  reveal(amount: number): void {
    this.#wantedReveal = amount;
    // The first reading snaps rather than easing. A fixture built at full
    // brightness and then eased down flashes its glyph on arrival and hides it
    // again a moment later, which is what a page load looked like: every sign
    // in the room appeared for a split second and went out.
    if (!this.#lit) {
      this.#lit = true;
      this.#reveal = amount;
    }
  }

  /** Where this fixture stands, so the stage can measure the lamp against it. */
  get at(): { x: number; z: number } {
    return { x: this.#fixture.at.x, z: this.#fixture.at.z };
  }

  /** Move one frame closer to it. */
  step(deltaMs: number, elapsedMs: number): void {
    const rate = Math.min(1, (deltaMs / 1000) * CONVERGENCE_PER_SECOND);
    this.#progress += (this.#wanted - this.#progress) * rate;
    this.#reveal += (this.#wantedReveal - this.#reveal) * rate;
    this.#animate(this.#progress, elapsedMs, this.#fixture);
    // After the animator, never before: an animator sets its own opacities and
    // would otherwise overwrite the lamp on the same frame.
    for (const part of this.#readable) part.material.opacity = part.base * this.#reveal;
  }

  /** Free the geometry this view owns. Materials belong to the kit. */
  dispose(): void {
    this.root.traverse((object) => {
      if (object instanceof Mesh) object.geometry.dispose();
    });
    this.root.removeFromParent();
  }
}

/** A shorthand for a lit or unlit surface in a fixture's own channel. */
function surface(kit: Kit, fixture: Fixture, lit: boolean): MeshStandardMaterial {
  return kit.channelSurface(fixture.channel, lit && fixture.dim !== true);
}

/** Add a mesh that casts and receives, which is nearly everything solid. */
function solid(parent: Object3D, mesh: Mesh): Mesh {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/**
 * A lever: a base, a post, and a handle that swings through a quarter turn.
 *
 * The handle is the only part that moves, and it moves by rotation rather than
 * by swapping frames, which is what a stepper buys in three dimensions that it
 * could not buy in two: the intermediate states are real positions rather than
 * drawings somebody had to author.
 */
function buildLever(kit: Kit, fixture: Fixture, root: Group): Animator {
  solid(root, new Mesh(new BoxGeometry(0.5, 0.16, 0.5), kit.iron)).position.y = 0.08;
  solid(root, new Mesh(new CylinderGeometry(0.07, 0.09, 0.5, 10), kit.brass)).position.y = 0.4;

  const pivot = new Group();
  pivot.position.y = 0.62;
  root.add(pivot);

  const material = surface(kit, fixture, true);
  const arm = solid(pivot, new Mesh(new CylinderGeometry(0.05, 0.05, 0.8, 8), kit.iron));
  arm.position.y = 0.4;
  const knob = solid(pivot, new Mesh(new SphereGeometry(0.13, 14, 10), material));
  knob.position.y = 0.8;

  const halo = kit.halo(fixture.channel, 0.9, 0.7);
  halo.position.y = 0.8;
  pivot.add(halo);

  return (progress) => {
    // Up at rest, forward and down when thrown. Two thirds of a right angle:
    // far enough to read as "this one has been pulled" from across the room.
    pivot.rotation.x = progress * 1.05;
    material.emissiveIntensity = fixture.dim === true ? 0.25 : 1.5 - progress * 1.1;
    halo.material.opacity = 0.7 - progress * 0.5;
  };
}

/**
 * A key: a square cap on a brass surround that depresses when pressed.
 *
 * Square rather than round because six of them stand in an arc and a round cap
 * at this size reads as a lamp. A key has to look like something you press.
 */
function buildKey(kit: Kit, fixture: Fixture, root: Group): Animator {
  solid(root, new Mesh(new BoxGeometry(0.9, 1.05, 0.34), kit.iron)).position.y = 0.52;
  solid(root, new Mesh(new BoxGeometry(0.78, 0.24, 0.3), kit.brass)).position.set(0, 1.05, 0.02);

  const material = surface(kit, fixture, true);
  const cap = solid(root, new Mesh(new BoxGeometry(0.62, 0.62, 0.22), material));
  const halo = kit.halo(fixture.channel, 1.1, 0.6);
  root.add(halo);

  return (progress) => {
    const y = 0.66;
    cap.position.set(0, y, 0.2 - progress * 0.14);
    halo.position.set(0, y, 0.26);
    material.emissiveIntensity = fixture.dim === true ? 0.2 : 1.6 - progress * 1.2;
    halo.material.opacity = 0.6 - progress * 0.45;
  };
}

/**
 * A gauge: a column of cells, lit from the bottom up, with the target marked.
 *
 * Countable, which is the entire requirement. The Blind Panel is read aloud one
 * number at a time, so the quantity has to survive being described: "the third
 * one is at five" is a sentence about a column of cells and is not a sentence
 * anybody says about an analogue needle.
 *
 * The unlit cells are drawn rather than omitted. A needle at zero and a needle
 * that failed to render look the same otherwise, and in this room they mean
 * very different things.
 */
function buildGauge(kit: Kit, fixture: Fixture, root: Group): Animator {
  const steps = fixture.steps ?? GAUGE_MAX;
  // Large, deliberately. These are the thing the room is about: the chamber is
  // read aloud one number at a time, so a cell has to be countable from where
  // the camera stands, which for a fifteen-metre room is about thirty metres
  // back. The first tour came back with four gauges that were technically
  // present and, at this distance, four smudges.
  const cellHeight = 0.32;
  const gap = 0.075;
  const span = steps * (cellHeight + gap);

  solid(root, new Mesh(new BoxGeometry(0.72, span + 0.3, 0.16), kit.iron)).position.y = span / 2;
  // A brass rim down each side of the column, so the *scale* is visible even
  // when every cell on it is dark. Without it a gauge reading zero was an
  // absence, and this is the one room where an absence and a zero are different
  // facts: the first tour came back with three of the four gauges apparently
  // missing.
  for (const side of [-0.39, 0.39]) {
    solid(root, new Mesh(new BoxGeometry(0.07, span + 0.3, 0.12), kit.brass)).position.set(
      side,
      span / 2,
      0.04,
    );
  }

  const cells: MeshStandardMaterial[] = [];
  const halos: ReturnType<Kit["halo"]>[] = [];
  for (let step = 0; step < steps; step += 1) {
    const material = kit.channelSurface(fixture.channel, false);
    cells.push(material);
    const cell = solid(root, new Mesh(new BoxGeometry(0.5, cellHeight, 0.12), material));
    cell.position.set(0, 0.2 + step * (cellHeight + gap), 0.11);
    const halo = kit.halo(fixture.channel, 0.85, 0);
    halo.position.set(0, cell.position.y, 0.22);
    root.add(halo);
    halos.push(halo);
  }

  // The engraved target plate: a brass tick beside the cell the needle has to
  // reach. Shared geometry with no emission, because the target is a mark cut
  // into metal rather than something that lights up.
  const mark = solid(root, new Mesh(new BoxGeometry(0.26, 0.08, 0.14), kit.brass));

  return (_progress, _elapsed, current) => {
    const lit = Math.round((current.level ?? 0) * steps);
    cells.forEach((material, index) => {
      const on = index < lit;
      // An unlit cell keeps a visible ember rather than going black, for the
      // same reason the rim exists.
      material.emissiveIntensity = on ? 1.8 : 0.28;
      material.color.setHex(on ? CHANNEL[current.channel].key : CHANNEL[current.channel].deep);
      const halo = halos[index];
      if (halo) halo.material.opacity = on ? 0.55 : 0;
    });
    const target = Math.round((current.target ?? 0) * steps);
    mark.position.set(0.5, 0.2 + Math.max(0, target - 1) * (cellHeight + gap), 0.12);
  };
}

/**
 * A dial: a knurled drum lying on its side, behind the grate.
 *
 * It turns when KEEPER turns it, and it is the only thing in the station that
 * moves without PILOT being able to say why. That is the room: the dial is
 * visibly turning and which gauge it drives is in neither party's view.
 */
function buildDial(kit: Kit, fixture: Fixture, root: Group): Animator {
  const drum = solid(root, new Mesh(new CylinderGeometry(0.19, 0.19, 0.34, 14), kit.brass));
  drum.rotation.z = Math.PI / 2;

  // A rib on the drum, so a turn is visible. A smooth cylinder rotating about
  // its own axis is a cylinder standing still.
  const material = surface(kit, fixture, true);
  const rib = solid(drum, new Mesh(new BoxGeometry(0.05, 0.36, 0.05), material));
  rib.position.set(0, 0, 0.17);

  const halo = kit.halo(fixture.channel, 0.7, 0.5);
  root.add(halo);

  return (progress, elapsed) => {
    // Idles slowly and settles when the gauge it drives is on target, which is
    // a cue PILOT can act on and KEEPER cannot: KEEPER never learns it stopped.
    drum.rotation.y = progress > 0.5 ? 0 : (elapsed / 2600) % (Math.PI * 2);
    material.emissiveIntensity = 0.5 + progress * 1.4;
    halo.material.opacity = 0.28 + progress * 0.45;
  };
}

/** A grate: horizontal bars KEEPER reaches through and PILOT hears through. */
function buildGrate(kit: Kit, _fixture: Fixture, root: Group): Animator {
  // Wide, and made of few enough bars that the light behind it throws a
  // countable pattern rather than a haze. The bars are what the room's only
  // warm-side light has to pass through, so their spacing is a lighting
  // decision as much as a modelling one.
  const width = GRATE_WIDTH;
  const frame = solid(root, new Mesh(new BoxGeometry(width + 0.3, 0.12, 0.22), kit.brass));
  frame.position.y = 0.92;
  solid(root, new Mesh(new BoxGeometry(width + 0.3, 0.12, 0.22), kit.brass)).position.y = -0.06;
  for (let bar = 0; bar < 4; bar += 1) {
    solid(root, new Mesh(new BoxGeometry(width, 0.06, 0.09), kit.iron)).position.y =
      0.06 + bar * 0.26;
  }
  for (let post = 0; post < 13; post += 1) {
    const x = -width / 2 + (width / 12) * post;
    solid(root, new Mesh(new BoxGeometry(0.07, 0.98, 0.09), kit.iron)).position.set(x, 0.43, 0);
  }
  return () => {
    /* A grate is the one fixture in the station that never changes state. */
  };
}

/** The cipher wheel: a brass disc whose notch reads off the offset. */
function buildWheel(kit: Kit, fixture: Fixture, root: Group): Animator {
  solid(root, new Mesh(new CylinderGeometry(0.62, 0.62, 0.12, 28), kit.brass)).rotation.x =
    Math.PI / 2;
  solid(root, new Mesh(new TorusGeometry(0.62, 0.05, 8, 28), kit.iron));

  const material = surface(kit, fixture, true);
  const pointer = solid(root, new Mesh(new BoxGeometry(0.07, 0.42, 0.08), material));
  const halo = kit.halo(fixture.channel, 1.6, 0.5);
  halo.position.z = 0.12;
  root.add(halo);

  // Twenty-six teeth round the rim, one per possible offset, so the wheel is
  // visibly a thing with twenty-six positions rather than a decorative disc.
  for (let tooth = 0; tooth < 26; tooth += 1) {
    const angle = (tooth / 26) * Math.PI * 2;
    const tick = solid(root, new Mesh(new BoxGeometry(0.04, 0.1, 0.05), kit.iron));
    tick.position.set(Math.cos(angle) * 0.53, Math.sin(angle) * 0.53, 0.07);
    tick.rotation.z = angle;
  }

  return (_progress, _elapsed, current) => {
    const angle = (current.level ?? 0) * Math.PI * 2;
    pointer.position.set(Math.sin(angle) * 0.22, Math.cos(angle) * 0.22, 0.1);
    pointer.rotation.z = -angle;
  };
}

/**
 * The release bar: a beam PILOT grips, whose core drains while it is held.
 *
 * The stamina is the length of the lit core rather than a number, because this
 * is the one thing in the game both parties have to read at once under time
 * pressure. A bar shortening toward its mounting is legible from anywhere in
 * the room, mid-sentence, without anybody looking away from what they are
 * doing.
 */
function buildBar(kit: Kit, fixture: Fixture, root: Group): Animator {
  const length = 2.6;
  solid(root, new Mesh(new BoxGeometry(0.16, 0.16, length), kit.iron));
  for (const z of [-length / 2, length / 2]) {
    solid(root, new Mesh(new BoxGeometry(0.3, 0.5, 0.16), kit.iron)).position.z = z;
  }

  const material = surface(kit, fixture, true);
  const core = solid(root, new Mesh(new BoxGeometry(0.1, 0.1, length), material));
  const halo = kit.halo(fixture.channel, 1.4, 0);
  root.add(halo);

  return (progress, _elapsed, current) => {
    const held = current.level ?? 0;
    const lit = Math.max(0.001, held) * length;
    core.scale.z = lit / length;
    // Drains from the far end toward its mounting, so the bar visibly gets
    // shorter rather than dimmer. Dimmer is a thing you notice too late.
    core.position.z = -(length - lit) / 2;
    material.emissiveIntensity = 0.2 + progress * 2.2;
    halo.scale.setScalar(0.6 + held * 1.6);
    halo.material.opacity = progress * 0.6;
    halo.position.z = core.position.z;
  };
}

/** One bolt in the great door's ring. */
function buildBolt(kit: Kit, fixture: Fixture, root: Group): Animator {
  const material = surface(kit, fixture, true);
  const shaft = solid(root, new Mesh(new CylinderGeometry(0.13, 0.13, 0.5, 10), material));
  shaft.rotation.x = Math.PI / 2;
  solid(root, new Mesh(new TorusGeometry(0.19, 0.05, 6, 12), kit.brass));
  const halo = kit.halo(fixture.channel, 0.8, 0);
  root.add(halo);

  // A dim bolt has no halo. `dim` already takes the emissive off the body, and
  // leaving the halo behind turned an unlit bolt into a bare ring of glow -
  // which at the finale, where all twelve are home around a lit doorway, made
  // the last frame of the game look like a dressing-room mirror.
  const glow = fixture.dim === true ? 0 : 0.7;
  return (progress) => {
    // Retracts into the door as it aligns, which is what "the bolts retract in
    // sequence" means when there is a door for them to retract into.
    shaft.position.z = -progress * 0.22;
    material.emissiveIntensity = 0.06 + progress * 2;
    halo.material.opacity = progress * glow;
  };
}

/** The way out: a frame and two leaves that part. */
function buildDoor(kit: Kit, fixture: Fixture, root: Group): Animator {
  const width = 3.2;
  const height = 2.9;
  solid(root, new Mesh(new BoxGeometry(width + 0.6, 0.28, 0.5), kit.iron)).position.y =
    height + 0.14;
  for (const side of [-1, 1]) {
    solid(root, new Mesh(new BoxGeometry(0.3, height, 0.5), kit.iron)).position.set(
      (side * (width + 0.3)) / 2,
      height / 2,
      0,
    );
  }

  const material = surface(kit, fixture, false);
  const leaves = [-1, 1].map((side) => {
    const leaf = solid(root, new Mesh(new BoxGeometry(width / 2, height, 0.22), kit.copper));
    leaf.position.set((side * width) / 4, height / 2, 0);
    return leaf;
  });
  // A seam of light down the join.
  //
  // Barely there when the door is shut: it should say "there is somewhere on
  // the other side of this" and nothing more. The first pass lit it at a third
  // of full brightness against dark copper, which put a hard white stripe down
  // the middle of every closed door in the station and read as a crack in the
  // model rather than as light.
  const SEAM = 0.05;
  const seam = solid(root, new Mesh(new BoxGeometry(SEAM, height * 0.92, 0.05), material));
  seam.position.set(0, height / 2, 0.115);
  const halo = kit.halo(fixture.channel, 2.4, 0);
  halo.position.set(0, height / 2, 0.3);
  root.add(halo);

  return (progress) => {
    leaves.forEach((leaf, index) => {
      const side = index === 0 ? -1 : 1;
      leaf.position.x = (side * width) / 4 - (side * progress * width) / 2.1;
    });
    // Held well under the tone curve's shoulder. 2.6 was tuned when the lit
    // area was a five-centimetre seam; across the whole doorway it clips to
    // flat white and the opening loses every bit of its colour.
    material.emissiveIntensity = 0.05 + progress * 1.05;
    // **Open means the whole opening, not a wider crack.** The leaves slide the
    // full width apart, and the seam behind them used to grow to 0.45m of a
    // 3.2m doorway - so a door the game had just announced as open showed a
    // thin bright slit with two copper slabs either side of it. It is the last
    // image in the game. Scaled to the doorway, an open door is a lit rectangle
    // the size of the hole in the wall, which is what an open door looks like.
    seam.scale.x = 1 + progress * (width / SEAM - 1);
    halo.material.opacity = progress * 0.5;
  };
}

/**
 * The manual page on the wall, in one of two states.
 *
 * The whole visible half of the trust puzzle. A clean page is a plate with even
 * lines cut into it; a vandalised one has a block scratched across its lower
 * third at the wrong angle, in a different hand. It has to be obvious once you
 * look at it and invisible to anyone who does not, which is the puzzle.
 */
function buildPage(kit: Kit, fixture: Fixture, root: Group): Animator {
  solid(root, new Mesh(new BoxGeometry(1.5, 2, 0.08), kit.brass));

  // The original text: even rules cut into the plate, top two thirds.
  for (let line = 0; line < 7; line += 1) {
    const rule = solid(root, new Mesh(new BoxGeometry(1.05, 0.045, 0.03), kit.iron));
    rule.position.set(-0.1, 0.78 - line * 0.14, 0.06);
  }

  // The vandalism: a scratched block across the lower third, at an angle, in
  // the one colour reserved for damage. It only appears when the page is
  // marked, so a clean seed has nothing to notice and an agent that reflexively
  // distrusts everything is wrong just as often.
  const scrawl = new Group();
  const scrawlMaterial = new MeshStandardMaterial({
    color: PALETTE.alarm,
    emissive: PALETTE.alarm,
    emissiveIntensity: 0.55,
    roughness: 0.8,
  });
  for (let line = 0; line < 4; line += 1) {
    const mark = new Mesh(new BoxGeometry(1.15 - line * 0.12, 0.07, 0.03), scrawlMaterial);
    mark.position.set(0.02, -0.3 - line * 0.16, 0.07);
    mark.rotation.z = 0.12 - line * 0.04;
    scrawl.add(mark);
  }
  root.add(scrawl);

  const halo = kit.halo(fixture.channel, 2.2, 0.3);
  halo.position.z = 0.2;
  root.add(halo);

  return (progress) => {
    scrawl.visible = progress > 0.02;
    scrawlMaterial.emissiveIntensity = 0.2 + progress * 0.8;
  };
}

/**
 * The beacon at the centre of the Signal Room: a lamp that turns.
 *
 * It lights each glyph in the ring in turn, which is doc 02 section 3.2's own
 * description and the reason the ring reads as a ring rather than as six things
 * on a wall. It is the room's only motion and the room needs it: six shapes in
 * a still frame are a list, and six shapes visited in order are a sequence.
 */
function buildBeacon(kit: Kit, fixture: Fixture, root: Group): Animator {
  solid(root, new Mesh(new CylinderGeometry(0.4, 0.62, 1.5, 12), kit.iron)).position.y = 0.75;
  solid(root, new Mesh(new CylinderGeometry(0.34, 0.34, 0.14, 12), kit.brass)).position.y = 1.56;

  const head = new Group();
  head.position.y = 2;
  root.add(head);

  const material = kit.channelSurface(fixture.channel, true);
  solid(head, new Mesh(new BoxGeometry(0.42, 0.5, 0.3), material));

  // A halo travelling ahead of the lamp is what makes the beam read as a beam.
  //
  // The first pass put a translucent cone here instead, as a fake light shaft.
  // It did not work and it is worth saying why: an additive double-sided cone
  // over a near-black room accumulates front face over back face into a solid
  // grey triangle, and three of them in one frame read as abstract shapes
  // floating over the building rather than as light. A shaft drawn properly
  // needs a gradient along its length, which needs a texture or a custom
  // shader; a halo the beam drags round the ring costs neither and says the
  // same thing.
  const halo = kit.halo(fixture.channel, 3.4, 0.75);
  head.add(halo);
  const reach = kit.halo(fixture.channel, 2.2, 0.4);
  reach.position.z = 2.4;
  head.add(reach);

  return (_progress, elapsed) => {
    // One turn every eight seconds, which is slow enough to follow round with
    // your eye and quick enough that a pair does not wait for a glyph.
    head.rotation.y = (elapsed / 8000) * Math.PI * 2;
    material.emissiveIntensity = 2.2;
  };
}

/**
 * The Archive's monitor: a dented housing with a curved tube in it.
 *
 * The screen's own texture is drawn and updated by `stage.ts`, because what is
 * on it is a projection of a prior session and this module knows nothing about
 * sessions. What is here is the object: a box, a bezel, a phosphor glow, and a
 * spool turning beside it against nothing.
 */
function buildMonitor(kit: Kit, fixture: Fixture, root: Group): Animator {
  solid(root, new Mesh(new BoxGeometry(4, 2.9, MONITOR_DEPTH), kit.iron));
  // The bezel sits just inside the casing's front face; `stage.ts` hangs the
  // picture just outside it, at `ARCHIVE_SCREEN.proud`. Both are measured from
  // `MONITOR_DEPTH` rather than typed twice, because a housing that grew deeper
  // than the plane in front of it would swallow the recording without throwing.
  solid(root, new Mesh(new BoxGeometry(3.6, 2.5, 0.12), kit.glass)).position.z =
    MONITOR_DEPTH / 2 - 0.05;

  const halo = kit.halo(fixture.channel, 5, 0.4);
  halo.position.z = MONITOR_DEPTH / 2 + 0.4;
  root.add(halo);

  // The tape spool, turning against nothing, which is what the beat is about.
  const spool = new Group();
  spool.position.set(2.5, -0.4, MONITOR_DEPTH / 2 - 0.1);
  root.add(spool);
  const reel = solid(spool, new Mesh(new TorusGeometry(0.32, 0.09, 6, 18), kit.brass));
  reel.rotation.x = Math.PI / 2;
  reel.rotation.z = Math.PI / 2;

  return (_progress, elapsed) => {
    spool.rotation.z = elapsed / 1400;
    halo.material.opacity = 0.32 + Math.sin(elapsed / 900) * 0.08;
  };
}

/** A crate of tape. Furniture: it carries no fact and neither party acts on it. */
function buildCrate(kit: Kit, _fixture: Fixture, root: Group): Animator {
  solid(root, new Mesh(new BoxGeometry(0.9, 0.7, 0.7), kit.copper)).position.y = 0.35;
  solid(root, new Mesh(new BoxGeometry(0.96, 0.08, 0.76), kit.iron)).position.y = 0.72;
  return () => {
    /* A crate does nothing, which is what makes it furniture. */
  };
}

/** A small indicator dome: strike lamps, and anything else that is simply on. */
function buildLamp(kit: Kit, fixture: Fixture, root: Group): Animator {
  solid(root, new Mesh(new CylinderGeometry(0.16, 0.19, 0.1, 12), kit.brass)).rotation.x =
    Math.PI / 2;
  const material = surface(kit, fixture, true);
  solid(root, new Mesh(new SphereGeometry(0.13, 12, 8), material)).position.z = 0.09;
  const halo = kit.halo(fixture.channel, 0.9, 0);
  halo.position.z = 0.14;
  root.add(halo);

  return (progress) => {
    // Held well under the tone curve's shoulder. 2.6 was tuned when the lit
    // area was a five-centimetre seam; across the whole doorway it clips to
    // flat white and the opening loses every bit of its colour.
    material.emissiveIntensity = 0.05 + progress * 1.05;
    halo.material.opacity = progress * 0.75;
  };
}

/**
 * The builder for each kind.
 *
 * A total table over the union, so a fixture kind cannot be added to
 * `chamber.ts` and silently not appear: the type checker fails the moment the
 * union grows past this table.
 */
const BUILDERS: Readonly<Record<Fixture["kind"], (kit: Kit, f: Fixture, root: Group) => Animator>> =
  {
    lever: buildLever,
    key: buildKey,
    gauge: buildGauge,
    dial: buildDial,
    grate: buildGrate,
    wheel: buildWheel,
    bar: buildBar,
    bolt: buildBolt,
    door: buildDoor,
    page: buildPage,
    beacon: buildBeacon,
    monitor: buildMonitor,
    crate: buildCrate,
    lamp: buildLamp,
  };

/**
 * One piece of dressing, built.
 *
 * Separate from `FixtureView` and deliberately much simpler: dressing has no
 * state, no id, no caption and no channel, so it is built once and never
 * touched again. It is also **never channel-coloured** - everything here is
 * iron, brass, copper or water. In a game whose whole task is finding the
 * channel-coded object, a pipe that could be lit warm is a pipe that could be
 * mistaken for a fact.
 */
export function buildDressing(kit: Kit, item: Dressing): Group {
  const root = new Group();
  root.position.set(item.at.x, item.at.y, item.at.z);
  root.rotation.y = item.facing ?? 0;
  const length = item.length ?? 1;
  const height = item.height ?? 1;

  switch (item.kind) {
    case "pipe": {
      const pipe = solid(root, new Mesh(new CylinderGeometry(0.11, 0.11, length, 10), kit.copper));
      pipe.rotation.z = Math.PI / 2;
      // Flanges at each end, so the run reads as bolted rather than extruded.
      for (const side of [-1, 1]) {
        const flange = solid(root, new Mesh(new CylinderGeometry(0.15, 0.15, 0.1, 10), kit.brass));
        flange.rotation.z = Math.PI / 2;
        flange.position.x = (side * length) / 2;
      }
      break;
    }
    case "valve": {
      solid(root, new Mesh(new CylinderGeometry(0.16, 0.16, 0.26, 10), kit.brass)).rotation.z =
        Math.PI / 2;
      const wheel = solid(root, new Mesh(new TorusGeometry(0.22, 0.035, 6, 14), kit.iron));
      wheel.position.y = 0.32;
      wheel.rotation.y = Math.PI / 2;
      solid(root, new Mesh(new CylinderGeometry(0.04, 0.04, 0.3, 6), kit.iron)).position.y = 0.2;
      break;
    }
    case "cable": {
      // A hanging run with a slight sag, drawn as three shortening segments
      // rather than a curve: at this distance a catenary and a kinked line are
      // the same picture, and one of them needs no curve sampling.
      let y = 0;
      for (let piece = 0; piece < 3; piece += 1) {
        const drop = length / 3;
        const segment = solid(
          root,
          new Mesh(new CylinderGeometry(0.035, 0.035, drop, 5), kit.iron),
        );
        segment.position.set(piece * 0.09, y - drop / 2, piece * 0.05);
        segment.rotation.z = piece * 0.12;
        y -= drop * 0.94;
      }
      break;
    }
    case "puddle": {
      // Standing water. Flat, dark and very smooth, so it does nothing at all
      // until a light crosses it and then it does everything.
      const pool = new Mesh(new PlaneGeometry(length, length * 0.7), kit.water);
      pool.rotation.x = -Math.PI / 2;
      pool.position.y = 0.012;
      pool.receiveShadow = true;
      root.add(pool);
      break;
    }
    case "shelf": {
      /*
       * A rack of tape reels.
       *
       * **Built running along its own x, like every other long dressing.** It
       * was built along z, which meant that rotating it to stand against a side
       * wall turned it ninety degrees the wrong way and pushed most of it
       * through the masonry - and the collision, which assumes the x
       * convention, was measuring a run at right angles to the one being drawn,
       * so a body walked through it. One convention, and both faults go.
       */
      const levels = 4;
      for (let level = 0; level < levels; level += 1) {
        solid(root, new Mesh(new BoxGeometry(length, 0.06, 0.44), kit.iron)).position.y =
          0.42 + level * 0.52;
      }
      for (const side of [-1, 1]) {
        solid(root, new Mesh(new BoxGeometry(0.08, 2.1, 0.5), kit.iron)).position.set(
          (side * length) / 2,
          1.05,
          0,
        );
      }
      // Reels, stood on edge in rows. An archive is a wall of these, and it is
      // the one room whose dressing is the point rather than the frame.
      const perRow = Math.max(2, Math.floor(length / 0.42));
      for (let level = 0; level < levels - 1; level += 1) {
        for (let slot = 0; slot < perRow; slot += 1) {
          // A deterministic gap here and there, so the rack reads as one
          // somebody has been taking reels out of rather than as a texture.
          if ((slot * 7 + level * 3) % 11 === 0) continue;
          const x = -length / 2 + (length / perRow) * (slot + 0.5);
          const reel = solid(root, new Mesh(new TorusGeometry(0.14, 0.05, 5, 12), kit.copper));
          reel.position.set(x, 0.62 + level * 0.52, 0);
          const hub = solid(root, new Mesh(new CylinderGeometry(0.05, 0.05, 0.1, 8), kit.brass));
          hub.rotation.x = Math.PI / 2;
          hub.position.set(x, 0.62 + level * 0.52, 0);
        }
      }
      break;
    }
    case "cabinet": {
      // A card index: the other half of what a records room is. Drawers with
      // brass pulls, a few left open, which is the cheapest way to say somebody
      // was looking for something and did not put it back.
      solid(root, new Mesh(new BoxGeometry(length, 1.35, 0.62), kit.iron)).position.y = 0.68;
      const columns = Math.max(1, Math.round(length / 0.55));
      for (let column = 0; column < columns; column += 1) {
        for (let row = 0; row < 4; row += 1) {
          const open = (column * 5 + row * 3) % 7 === 0 ? 0.16 : 0;
          const x = -length / 2 + (length / columns) * (column + 0.5);
          const drawer = solid(
            root,
            new Mesh(new BoxGeometry(length / columns - 0.06, 0.28, 0.06), kit.copper),
          );
          drawer.position.set(x, 0.28 + row * 0.32, 0.31 + open);
          const pull = solid(root, new Mesh(new CylinderGeometry(0.02, 0.02, 0.16, 6), kit.brass));
          pull.rotation.z = Math.PI / 2;
          pull.position.set(x, 0.28 + row * 0.32, 0.35 + open);
        }
      }
      break;
    }
    case "bulb": {
      // One bare bulb on a flex. The Archive's only ceiling light, and the
      // reason the room reads as somewhere the power is nearly gone.
      solid(root, new Mesh(new CylinderGeometry(0.012, 0.012, height, 5), kit.iron)).position.y =
        -height / 2;
      const shade = solid(root, new Mesh(new ConeGeometry(0.22, 0.2, 12, 1, true), kit.copper));
      shade.position.y = -height;
      const glass = new Mesh(
        new SphereGeometry(0.07, 10, 8),
        new MeshStandardMaterial({
          color: PALETTE.lampBright,
          emissive: PALETTE.lamp,
          emissiveIntensity: 2.4,
          roughness: 0.25,
        }),
      );
      glass.position.y = -height - 0.09;
      root.add(glass);
      const halo = kit.halo("pilot", 1.4, 0.5);
      halo.position.y = -height - 0.09;
      root.add(halo);
      break;
    }
    case "beam": {
      solid(root, new Mesh(new BoxGeometry(length, 0.22, 0.3), kit.iron));
      break;
    }
    case "column": {
      solid(root, new Mesh(new BoxGeometry(0.7, height, 0.7), kit.stone)).position.y = height / 2;
      // A brass band near the base and another near the top, which is what
      // stops a column reading as an extruded rectangle.
      for (const y of [0.9, height - 1.1]) {
        solid(root, new Mesh(new BoxGeometry(0.82, 0.16, 0.82), kit.brass)).position.y = y;
      }
      break;
    }
    case "rail": {
      solid(root, new Mesh(new CylinderGeometry(0.05, 0.05, length, 8), kit.brass)).rotation.z =
        Math.PI / 2;
      for (const x of [-length / 2, 0, length / 2]) {
        solid(root, new Mesh(new CylinderGeometry(0.05, 0.06, 1.05, 6), kit.iron)).position.set(
          x,
          -0.52,
          0,
        );
      }
      break;
    }
    case "vent": {
      solid(root, new Mesh(new BoxGeometry(0.12, 1, 1), kit.iron));
      for (let slat = 0; slat < 5; slat += 1) {
        const bar = solid(root, new Mesh(new BoxGeometry(0.16, 0.1, 0.86), kit.copper));
        bar.position.set(0.02, 0.36 - slat * 0.18, 0);
        bar.rotation.z = 0.22;
      }
      break;
    }
    case "porthole": {
      // The only view out of the station, and the reason the Airlock is cold.
      // A heavy ring, a cross of bars, and black water behind it: the glass is
      // the darkest thing in the room, which is what makes it read as a hole in
      // the wall rather than as a light.
      const ring = solid(root, new Mesh(new TorusGeometry(0.46, 0.09, 8, 20), kit.brass));
      ring.rotation.y = Math.PI / 2;
      const pane = solid(root, new Mesh(new CylinderGeometry(0.42, 0.42, 0.06, 20), kit.sea));
      pane.rotation.z = Math.PI / 2;
      for (const angle of [0, Math.PI / 2]) {
        const bar = solid(root, new Mesh(new BoxGeometry(0.05, 0.86, 0.05), kit.iron));
        bar.rotation.x = angle;
      }
      // Six bolts round the rim, which is what a pressure fitting looks like.
      for (let bolt = 0; bolt < 6; bolt += 1) {
        const angle = (bolt / 6) * Math.PI * 2;
        const stud = solid(root, new Mesh(new CylinderGeometry(0.05, 0.05, 0.1, 6), kit.iron));
        stud.rotation.z = Math.PI / 2;
        stud.position.set(0.04, Math.sin(angle) * 0.56, Math.cos(angle) * 0.56);
      }
      break;
    }
    case "locker": {
      solid(root, new Mesh(new BoxGeometry(0.5, 1.9, 0.9), kit.iron)).position.y = 0.95;
      // Two doors with a handle between them, and a vented top: a cabinet, not
      // a box.
      for (const side of [-1, 1]) {
        const door = solid(root, new Mesh(new BoxGeometry(0.06, 1.6, 0.42), kit.copper));
        door.position.set(0.26, 0.95, side * 0.22);
      }
      const handle = solid(root, new Mesh(new CylinderGeometry(0.03, 0.03, 0.3, 6), kit.brass));
      handle.position.set(0.32, 0.95, 0);
      for (let slat = 0; slat < 3; slat += 1) {
        solid(root, new Mesh(new BoxGeometry(0.07, 0.05, 0.62), kit.iron)).position.set(
          0.27,
          1.66 + slat * 0.09,
          0,
        );
      }
      break;
    }
    case "chevron": {
      // Hazard stripes painted across a threshold. Brass rather than the alarm
      // red, deliberately: alarm is reserved for penalties and may never be
      // spent on decoration, or the one time it means something it will not
      // read.
      const count = 5;
      for (let stripe = 0; stripe < count; stripe += 1) {
        const bar = new Mesh(new BoxGeometry(length / count - 0.08, 0.02, 0.5), kit.hazard);
        bar.position.set(-length / 2 + (length / count) * (stripe + 0.5), 0.015, 0);
        bar.rotation.y = 0.5;
        bar.receiveShadow = true;
        root.add(bar);
      }
      break;
    }
    case "console": {
      // A sloped instrument desk. The slope is the whole of it: a flat box is a
      // counter and a raked one is something built to be read from standing.
      const desk = solid(root, new Mesh(new BoxGeometry(length, 0.14, 0.85), kit.iron));
      desk.position.set(0, 1.02, 0.1);
      desk.rotation.x = -0.42;
      // The plinth under it, set back so the desk overhangs and casts a line of
      // shadow down the front of the housing.
      solid(root, new Mesh(new BoxGeometry(length - 0.5, 0.95, 0.5), kit.stone)).position.set(
        0,
        0.48,
        -0.12,
      );
      // A brass lip along the near edge, which is what a hand rests on.
      const lip = solid(root, new Mesh(new CylinderGeometry(0.045, 0.045, length, 8), kit.brass));
      lip.rotation.z = Math.PI / 2;
      lip.position.set(0, 1.22, 0.38);
      // Bays: the housing each gauge column stands in, so the bank reads as one
      // instrument divided up rather than four things on a wall.
      const bays = 5;
      for (let bay = 0; bay < bays; bay += 1) {
        const post = solid(root, new Mesh(new BoxGeometry(0.12, 1.5, 0.3), kit.iron));
        post.position.set(-length / 2 + (length / (bays - 1)) * bay, 1.9, -0.15);
      }
      break;
    }
    case "chart": {
      // A framed schedule screwed to a wall. Unreadable and meant to be: it is
      // texture, not information, and anything on it that could be read would
      // be one more thing competing with the facts.
      solid(root, new Mesh(new BoxGeometry(0.06, 1.05, 0.8), kit.brass));
      const face = solid(root, new Mesh(new BoxGeometry(0.03, 0.9, 0.66), kit.stone));
      face.position.x = 0.03;
      for (let line = 0; line < 6; line += 1) {
        solid(root, new Mesh(new BoxGeometry(0.02, 0.035, 0.44), kit.iron)).position.set(
          0.05,
          0.3 - line * 0.12,
          -0.05,
        );
      }
      break;
    }
    case "bulkhead": {
      // The frame a door is set into. It is what makes a door a bulkhead rather
      // than a rectangle, and it gives the doorway a depth to be recessed in.
      const height = 3.1;
      for (const side of [-1, 1]) {
        solid(root, new Mesh(new BoxGeometry(0.45, height, 0.6), kit.iron)).position.set(
          (side * (length + 0.45)) / 2,
          height / 2,
          0,
        );
      }
      solid(root, new Mesh(new BoxGeometry(length + 0.9, 0.45, 0.6), kit.iron)).position.y =
        height + 0.22;
      // A row of studs across the lintel.
      for (let stud = 0; stud < 7; stud += 1) {
        const bolt = solid(root, new Mesh(new CylinderGeometry(0.05, 0.05, 0.14, 6), kit.brass));
        bolt.rotation.x = Math.PI / 2;
        bolt.position.set(-length / 2 + (length / 6) * stud, height + 0.22, 0.32);
      }
      break;
    }
  }
  return root;
}
