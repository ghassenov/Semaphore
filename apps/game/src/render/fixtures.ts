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
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
} from "three";
import type { Fixture } from "./chamber.js";
import { GAUGE_MAX, MONITOR_DEPTH } from "./chamber.js";
import { GLYPHS, glyphCanvas } from "./glyphs.js";
import { CHANNEL, PALETTE } from "./palette.js";
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

/** How far below a fixture its caption sits, in metres. */
const CAPTION_DROP = 0.34;

/** What every builder returns: how to animate what it built. */
type Animator = (progress: number, elapsedMs: number, fixture: Fixture) => void;

/** One fixture, built and drivable. */
export class FixtureView {
  readonly root = new Group();
  readonly #animate: Animator;
  /** The state the server last reported, as a target for `progress`. */
  #wanted = 0;
  #progress = 0;
  #fixture: Fixture;

  constructor(kit: Kit, fixture: Fixture) {
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

        const halo = kit.halo(fixture.channel, 1.5, 0.4);
        halo.position.set(0, GLYPH_HEIGHT, 0.12);
        this.root.add(halo);
      }
    }

    if (fixture.label !== undefined) {
      const caption = kit.label(fixture.label, CHANNEL[fixture.channel].key);
      caption.position.set(0, -CAPTION_DROP, 0.2);
      this.root.add(caption);
    }

    // Placed at its true state rather than animated up to it.
    this.#wanted = fixture.on ? 1 : 0;
    this.#progress = this.#wanted;
    this.#animate(this.#progress, 0, fixture);
  }

  /** Take the server's latest word on this fixture. */
  apply(fixture: Fixture): void {
    this.#fixture = fixture;
    this.#wanted = fixture.on ? 1 : 0;
  }

  /** Move one frame closer to it. */
  step(deltaMs: number, elapsedMs: number): void {
    const rate = Math.min(1, (deltaMs / 1000) * CONVERGENCE_PER_SECOND);
    this.#progress += (this.#wanted - this.#progress) * rate;
    this.#animate(this.#progress, elapsedMs, this.#fixture);
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
  for (let bar = 0; bar < 5; bar += 1) {
    solid(root, new Mesh(new BoxGeometry(6.4, 0.07, 0.07), kit.iron)).position.y = bar * 0.17;
  }
  for (const x of [-3.2, -1.6, 0, 1.6, 3.2]) {
    solid(root, new Mesh(new BoxGeometry(0.08, 0.85, 0.08), kit.iron)).position.set(x, 0.34, 0);
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

  return (progress) => {
    // Retracts into the door as it aligns, which is what "the bolts retract in
    // sequence" means when there is a door for them to retract into.
    shaft.position.z = -progress * 0.22;
    material.emissiveIntensity = 0.06 + progress * 2;
    halo.material.opacity = progress * 0.7;
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
  // A seam of the room's own light down the join, so a shut door still says
  // there is somewhere on the other side of it.
  const seam = solid(root, new Mesh(new BoxGeometry(0.08, height, 0.06), material));
  seam.position.set(0, height / 2, 0.12);
  const halo = kit.halo(fixture.channel, 2.4, 0);
  halo.position.set(0, height / 2, 0.3);
  root.add(halo);

  return (progress) => {
    leaves.forEach((leaf, index) => {
      const side = index === 0 ? -1 : 1;
      leaf.position.x = (side * width) / 4 - (side * progress * width) / 2.1;
    });
    material.emissiveIntensity = 0.35 + progress * 2.4;
    seam.scale.x = 1 + progress * 6;
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
    material.emissiveIntensity = 0.05 + progress * 2.6;
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
