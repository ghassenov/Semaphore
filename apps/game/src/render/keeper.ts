/**
 * KEEPER's body, which *is* the tool registry.
 *
 * This is the project's signature visual idea (doc 01 section 1, doc 06 section
 * 5) and the one thing doc 08's cut order says may never be cut. Doc 01 says
 * the agent's *hands have been swapped out* when a chamber is cleared. This
 * module is where that stops being a metaphor.
 *
 * Every tool in the live registry is a visible part of a body standing in the
 * wall. The two tiers of the `AbortController` lifecycle are two kinds of part:
 *
 * - **Persistent tools** - the ones that survive every chamber transition - are
 *   short rods racked down the torso. They are the body. They never move.
 * - **Chamber tools** are long articulated arms on the upper hardpoints, each
 *   ending in a head shaped like the thing it does. They unfold when their
 *   chamber begins and unlatch and fall when it is solved.
 *
 * So a player glancing at KEEPER knows what their partner can do without
 * reading a word, and the two-tier lifecycle is legible as body architecture.
 *
 * ## Where the names come from, and where they do not
 *
 * This module is handed a list of tool names. That list is `getTools()` as the
 * page reports it, passed down from the one `toolchange` listener, never a
 * record of what somebody meant to register. That rule is the whole reason the
 * body is honest: a registration that silently fails costs KEEPER a visible
 * limb, which is a bug you can see from across the room.
 *
 * **The mapping from a name to a shape is authored, and it is total.** The
 * table below covers every chamber tool the game registers. A tool that is not
 * in it is not dropped: it gets a rod on the spine, so it is still present and
 * still counted. A body that under-reports the registry would be worse than no
 * body at all, because it would be the animation telling a lie the manifest
 * plate is there to catch.
 */

import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
} from "three";
import { CHANNEL, PALETTE } from "./palette.js";
import type { Kit } from "./kit.js";

/** How tall the body stands, in metres. Taller and thinner than PILOT. */
const BODY_HEIGHT = 2.5;

/** How many arms the upper hardpoints can carry at once. */
const HARDPOINTS = 4;

/** How long an arm takes to unfold or to unlatch, in milliseconds. */
const LIMB_MS = 620;

/**
 * How many fallen limbs stay on the floor.
 *
 * They accumulate across the whole session, which is doc 06 section 5's small
 * cumulative detail: by the Concord Lock there is a heap of everything the
 * agent used to be able to do. Capped so a long session with many retries
 * cannot grow the scene without bound.
 */
const DEBRIS_CAP = 24;

/** What an arm's head looks like, which is what the tool does. */
type HeadShape = "hook" | "comb" | "socket" | "clamp" | "stylus" | "horn" | "key" | "paddle";

/**
 * Which chamber tool gets which arm, from doc 06 section 5's own table.
 *
 * Two entries are not in that table because it predates them: `reset_sequence`
 * and `get_lock_state` are chamber tools the build added. They are given shapes
 * here rather than left to the spine, because they belong to a chamber and
 * would otherwise be the only chamber tools that do not visibly arrive and
 * leave with their room.
 */
const ARM_SHAPES: Readonly<Record<string, HeadShape>> = {
  pull_lever: "hook",
  press_key: "comb",
  reset_sequence: "paddle",
  rotate_dial: "socket",
  read_ciphertext: "stylus",
  get_lock_state: "stylus",
  align_bolt: "clamp",
  speak_passphrase: "horn",
  open_the_door: "key",
};

/** One part of the body, and how far through arriving or leaving it is. */
interface Limb {
  readonly tool: string;
  readonly root: Group;
  readonly arm: boolean;
  /** 0 folded away, 1 fully extended. */
  progress: number;
  /** Which way `progress` is travelling. */
  leaving: boolean;
}

/**
 * The head on the end of an arm, drawn to look like what the tool does.
 *
 * Each is a handful of primitives. They are not meant to be legible as tools at
 * a glance from across a room - nothing in the game requires that - they are
 * meant to be visibly *different from each other*, so that a chamber change
 * reads as the hands being swapped rather than as the same hand moving.
 */
function buildHead(kit: Kit, shape: HeadShape, tint: MeshStandardMaterial): Object3D {
  const head = new Group();
  const add = (mesh: Mesh): Mesh => {
    mesh.castShadow = true;
    head.add(mesh);
    return mesh;
  };

  switch (shape) {
    case "hook": {
      add(new Mesh(new TorusGeometry(0.13, 0.045, 6, 12, Math.PI * 1.3), tint)).rotation.set(
        Math.PI / 2,
        0,
        0,
      );
      break;
    }
    case "comb": {
      for (let tooth = 0; tooth < 6; tooth += 1) {
        add(new Mesh(new BoxGeometry(0.03, 0.2, 0.03), tint)).position.set(
          -0.11 + tooth * 0.045,
          -0.08,
          0,
        );
      }
      add(new Mesh(new BoxGeometry(0.3, 0.05, 0.06), kit.brass));
      break;
    }
    case "socket": {
      const drum = add(new Mesh(new CylinderGeometry(0.11, 0.11, 0.16, 12), tint));
      drum.rotation.x = Math.PI / 2;
      add(new Mesh(new TorusGeometry(0.12, 0.02, 5, 12), kit.brass));
      break;
    }
    case "clamp": {
      for (const side of [-1, 1]) {
        const jaw = add(new Mesh(new BoxGeometry(0.05, 0.22, 0.05), tint));
        jaw.position.set(side * 0.07, -0.06, 0);
        jaw.rotation.z = side * 0.28;
      }
      add(new Mesh(new BoxGeometry(0.2, 0.06, 0.08), kit.brass));
      break;
    }
    case "stylus": {
      const point = add(new Mesh(new ConeGeometry(0.045, 0.32, 8), tint));
      point.position.y = -0.14;
      point.rotation.x = Math.PI;
      break;
    }
    case "horn": {
      const bell = add(new Mesh(new ConeGeometry(0.16, 0.3, 12, 1, true), kit.brass));
      bell.rotation.x = -Math.PI / 2;
      add(new Mesh(new SphereGeometry(0.06, 8, 6), tint));
      break;
    }
    case "key": {
      add(new Mesh(new BoxGeometry(0.05, 0.44, 0.05), tint)).position.y = -0.16;
      add(new Mesh(new BoxGeometry(0.16, 0.05, 0.05), tint)).position.y = -0.34;
      break;
    }
    case "paddle": {
      add(new Mesh(new BoxGeometry(0.26, 0.18, 0.03), tint)).position.y = -0.1;
      break;
    }
  }
  return head;
}

/**
 * KEEPER: a maintenance frame set into the wall, wearing its registry.
 *
 * One instance per session rather than one per room. The body follows the pair
 * from chamber to chamber, which is the truth of it - the same agent, the same
 * registry, a different alcove - and it is why the debris on the floor
 * accumulates instead of being swept away at every door.
 */
export class KeeperBody {
  readonly root = new Group();
  readonly #kit: Kit;
  readonly #limbs = new Map<string, Limb>();
  readonly #arms = new Group();
  readonly #spine = new Group();
  readonly #debris = new Group();
  readonly #visor: MeshStandardMaterial;
  readonly #visorHalo: ReturnType<Kit["halo"]>;
  /** Which hardpoints are taken, so two arms never grow from one shoulder. */
  readonly #taken = new Set<number>();
  #busy = false;

  constructor(kit: Kit) {
    this.#kit = kit;

    const alcove = new Mesh(new BoxGeometry(1.9, BODY_HEIGHT + 0.7, 0.8), kit.stone);
    alcove.position.y = (BODY_HEIGHT + 0.7) / 2 - 0.2;
    alcove.receiveShadow = true;
    this.root.add(alcove);

    // The recess behind the body, lit in KEEPER's own channel.
    //
    // Without it the body is dark iron standing in a dark niche and simply does
    // not read: the first tour found the debris on the floor and not the thing
    // that had shed it. A lit back panel is also the better image, and the one
    // doc 02 section 1 actually asks for - KEEPER is a *shadow behind a grate*,
    // never a co-present body, and a silhouette needs something behind it.
    const recess = new Mesh(
      new BoxGeometry(1.5, BODY_HEIGHT + 0.2, 0.06),
      new MeshStandardMaterial({
        color: CHANNEL.keeper.deep,
        emissive: CHANNEL.keeper.key,
        emissiveIntensity: 0.5,
        roughness: 0.9,
      }),
    );
    recess.position.set(0, (BODY_HEIGHT + 0.2) / 2, -0.36);
    this.root.add(recess);
    const wash = kit.halo("keeper", 3.2, 0.3);
    wash.position.set(0, BODY_HEIGHT / 2, -0.2);
    this.root.add(wash);

    const torso = new Mesh(new BoxGeometry(0.72, 1.55, 0.44), kit.iron);
    torso.position.y = 1.15;
    torso.castShadow = true;
    this.root.add(torso);

    const shoulders = new Mesh(new BoxGeometry(1.05, 0.22, 0.4), kit.brass);
    shoulders.position.y = 1.92;
    shoulders.castShadow = true;
    this.root.add(shoulders);

    // A visor band across the eyes rather than eyes. The silhouette has to say
    // *this thing cannot see* before anybody is told, and a pair of eyes on the
    // one character in the game who is blind would be the model contradicting
    // the premise.
    const head = new Mesh(new BoxGeometry(0.5, 0.42, 0.42), kit.iron);
    head.position.y = 2.22;
    head.castShadow = true;
    this.root.add(head);

    this.#visor = new MeshStandardMaterial({
      color: CHANNEL.keeper.deep,
      emissive: CHANNEL.keeper.key,
      emissiveIntensity: 0.8,
      roughness: 0.3,
      metalness: 0.4,
    });
    const band = new Mesh(new BoxGeometry(0.52, 0.1, 0.44), this.#visor);
    band.position.y = 2.26;
    this.root.add(band);

    this.#visorHalo = kit.halo("keeper", 2.2, 0.35);
    this.#visorHalo.position.set(0, 2.26, 0.3);
    this.root.add(this.#visorHalo);

    this.root.add(this.#arms, this.#spine, this.#debris);
  }

  /**
   * The visor pulses for the whole duration of an in-flight tool call.
   *
   * The cheapest possible fix for the "is it frozen or is it thinking" problem
   * (doc 06 section 5.2), and the only cue PILOT has that their partner is
   * doing something. It is not derived from the registry: it is the director
   * telling the stage that a call is out.
   */
  setBusy(busy: boolean): void {
    this.#busy = busy;
  }

  /**
   * Take the registry.
   *
   * Diffed rather than rebuilt, because rebuilding would restart every limb's
   * animation on every `toolchange` and the whole point of the sequence is that
   * the limbs that survive a transition visibly do not move.
   */
  setTools(tools: readonly string[]): void {
    const wanted = new Set(tools);

    for (const [tool, limb] of this.#limbs) {
      // Already leaving, or still wanted: nothing to start.
      if (wanted.has(tool)) {
        limb.leaving = false;
        continue;
      }
      limb.leaving = true;
    }

    for (const tool of wanted) {
      const existing = this.#limbs.get(tool);
      if (existing !== undefined) continue;
      this.#grow(tool);
    }
  }

  /** Build one limb for a tool that has just arrived. */
  #grow(tool: string): void {
    const shape = ARM_SHAPES[tool];
    const limb: Limb = {
      tool,
      root: new Group(),
      arm: shape !== undefined,
      progress: 0,
      leaving: false,
    };

    if (shape !== undefined) {
      const hardpoint = this.#claim();
      this.#buildArm(limb.root, shape, hardpoint);
      this.#arms.add(limb.root);
      limb.root.userData.hardpoint = hardpoint;
    } else {
      this.#buildRod(limb.root, this.#spine.children.length);
      this.#spine.add(limb.root);
    }

    this.#limbs.set(tool, limb);
  }

  /** The lowest free hardpoint, so arms fill from the top down. */
  #claim(): number {
    for (let point = 0; point < HARDPOINTS; point += 1) {
      if (!this.#taken.has(point)) {
        this.#taken.add(point);
        return point;
      }
    }
    // More chamber tools than hardpoints is not a state the game reaches, but a
    // limb with nowhere to go must still exist rather than vanish, so it
    // doubles up on the last shoulder.
    return HARDPOINTS - 1;
  }

  /**
   * An articulated arm: shoulder, upper, elbow, forearm, head.
   *
   * Built folded against the torso, at `progress` zero. Unfolding is the
   * animation, and it is expressed as joint angles rather than as a scale,
   * because an arm that grows out of nothing reads as a spawn and an arm that
   * unfolds reads as a machine.
   */
  #buildArm(root: Group, shape: HeadShape, hardpoint: number): void {
    const side = hardpoint % 2 === 0 ? -1 : 1;
    const tier = Math.floor(hardpoint / 2);
    root.position.set(side * 0.44, 1.86 - tier * 0.52, 0.1);

    const tint = new MeshStandardMaterial({
      color: CHANNEL.keeper.deep,
      emissive: CHANNEL.keeper.key,
      emissiveIntensity: 1.1,
      roughness: 0.35,
      metalness: 0.6,
    });
    root.userData.tint = tint;

    const shoulder = new Mesh(new SphereGeometry(0.11, 10, 8), this.#kit.brass);
    shoulder.castShadow = true;
    root.add(shoulder);

    const upper = new Group();
    root.add(upper);
    const upperArm = new Mesh(new BoxGeometry(0.11, 0.5, 0.11), this.#kit.iron);
    upperArm.position.y = -0.25;
    upperArm.castShadow = true;
    upper.add(upperArm);

    const elbow = new Group();
    elbow.position.y = -0.5;
    upper.add(elbow);
    const joint = new Mesh(new SphereGeometry(0.085, 10, 8), this.#kit.brass);
    joint.castShadow = true;
    elbow.add(joint);

    const forearm = new Mesh(new BoxGeometry(0.085, 0.42, 0.085), this.#kit.iron);
    forearm.position.y = -0.21;
    forearm.castShadow = true;
    elbow.add(forearm);

    const head = buildHead(this.#kit, shape, tint);
    head.position.y = -0.44;
    elbow.add(head);

    const halo = this.#kit.halo("keeper", 0.7, 0.5);
    halo.position.y = -0.5;
    elbow.add(halo);

    root.userData.upper = upper;
    root.userData.elbow = elbow;
    root.userData.side = side;
  }

  /**
   * A rod on the spine: one persistent tool.
   *
   * Short, fixed, and identical to its neighbours, because that is what these
   * tools are. `read_manual` is not a different capability in the Signal Room
   * than it was in the Airlock, and drawing the persistent tier as a rack of
   * matching parts is the clearest statement available that this half of the
   * registry does not change.
   */
  #buildRod(root: Group, index: number): void {
    const side = index % 2 === 0 ? -1 : 1;
    const tier = Math.floor(index / 2);
    root.position.set(side * 0.38, 1.5 - tier * 0.26, 0.22);

    const rod = new Mesh(new CylinderGeometry(0.035, 0.035, 0.3, 8), this.#kit.brass);
    rod.rotation.z = Math.PI / 2;
    rod.castShadow = true;
    root.add(rod);

    const tip = new Mesh(
      new SphereGeometry(0.05, 8, 6),
      new MeshStandardMaterial({
        color: CHANNEL.keeper.deep,
        emissive: CHANNEL.keeper.key,
        emissiveIntensity: 1.4,
        roughness: 0.3,
      }),
    );
    tip.position.x = side * 0.17;
    root.add(tip);
  }

  /**
   * Advance every limb, and retire the ones that have finished leaving.
   *
   * An arriving limb unfolds; a leaving one droops, dims and unlatches, and
   * when it is gone a piece of it is dropped on the floor and stays there.
   */
  step(deltaMs: number, elapsedMs: number): void {
    const stride = deltaMs / LIMB_MS;

    for (const [tool, limb] of this.#limbs) {
      limb.progress = Math.max(0, Math.min(1, limb.progress + (limb.leaving ? -stride : stride)));

      if (limb.arm) this.#poseArm(limb);
      else limb.root.scale.setScalar(Math.max(0.001, limb.progress));

      if (limb.leaving && limb.progress <= 0) {
        this.#drop(limb);
        this.#limbs.delete(tool);
      }
    }

    // The thinking pulse. Bright and steady while a call is out, a slow breath
    // when it is not, so the difference between working and waiting is legible
    // without anything having to say so.
    const idle = 0.55 + Math.sin(elapsedMs / 1300) * 0.25;
    this.#visor.emissiveIntensity = this.#busy ? 3.2 : idle;
    this.#visorHalo.material.opacity = this.#busy ? 0.75 : 0.22;
  }

  /** Put one arm at its unfolded fraction. */
  #poseArm(limb: Limb): void {
    const upper = limb.root.userData.upper as Group | undefined;
    const elbow = limb.root.userData.elbow as Group | undefined;
    const tint = limb.root.userData.tint as MeshStandardMaterial | undefined;
    const side = (limb.root.userData.side as number | undefined) ?? 1;
    const t = limb.progress;
    if (upper) {
      // Folded flat against the torso at zero, out and down at one.
      upper.rotation.z = side * (1.5 - t * 1.05);
      upper.rotation.x = -0.25 * t;
    }
    if (elbow) elbow.rotation.x = 0.85 - t * 0.6;
    if (tint) tint.emissiveIntensity = 0.1 + t * 1.6;
    limb.root.scale.setScalar(0.35 + t * 0.65);
  }

  /**
   * Leave a piece of a departed limb on the floor.
   *
   * They stay for the rest of the session. It is the cheapest cumulative detail
   * in the game and the only one: by the Concord Lock the floor around KEEPER
   * is littered with everything the agent used to be able to do, and nobody has
   * to be told what the heap is.
   */
  #drop(limb: Limb): void {
    limb.root.removeFromParent();
    limb.root.traverse((object) => {
      if (object instanceof Mesh) object.geometry.dispose();
    });
    const hardpoint = limb.root.userData.hardpoint as number | undefined;
    if (hardpoint !== undefined) this.#taken.delete(hardpoint);

    const piece = new Mesh(new BoxGeometry(0.16, 0.06, 0.16), this.#kit.copper);
    const count = this.#debris.children.length;
    // Scattered by a deterministic hash rather than at random, so a screenshot
    // tour is comparable with the last one.
    const spin = Math.sin(count * 12.9898) * 43758.5453;
    piece.position.set(-0.9 + (spin - Math.floor(spin)) * 1.8, 0.03, 0.5 + ((count * 0.37) % 0.7));
    piece.rotation.set(0, spin % Math.PI, 0.12);
    piece.castShadow = true;
    piece.receiveShadow = true;
    this.#debris.add(piece);

    while (this.#debris.children.length > DEBRIS_CAP) {
      const oldest = this.#debris.children[0];
      if (!oldest) break;
      if (oldest instanceof Mesh) oldest.geometry.dispose();
      oldest.removeFromParent();
    }
  }

  /** How many parts the body is currently wearing. Equals the registry's size. */
  get limbCount(): number {
    return this.#limbs.size;
  }

  dispose(): void {
    this.root.traverse((object) => {
      if (object instanceof Mesh) object.geometry.dispose();
    });
    this.#visor.dispose();
    this.root.removeFromParent();
  }
}

/**
 * PILOT: a figure in a heavy coat with a lamp held up.
 *
 * The read is the raised lamp: this is someone whose whole job is looking. It
 * casts a real light, so moving changes what is lit, which is what makes
 * walking a room worth doing rather than a control scheme nobody finished.
 *
 * Bone and iron, not lamplight-gold. Warm means "only PILOT can perceive this",
 * and PILOT is not a fact only PILOT can perceive: the human is looking at
 * themselves. Painting the body in the channel colour would make the legend lie
 * the first time somebody checked it against the screen. The lamp is the one
 * warm thing, and it is a lamp.
 */
export function buildPilot(kit: Kit): { readonly root: Group; readonly lamp: Object3D } {
  const root = new Group();

  const coat = new Mesh(new CylinderGeometry(0.2, 0.34, 1.1, 10), kit.stone);
  coat.position.y = 0.55;
  coat.castShadow = true;
  root.add(coat);

  const shoulders = new Mesh(new CylinderGeometry(0.24, 0.2, 0.28, 10), kit.iron);
  shoulders.position.y = 1.2;
  shoulders.castShadow = true;
  root.add(shoulders);

  const head = new Mesh(new SphereGeometry(0.15, 12, 10), kit.stone);
  head.position.y = 1.48;
  head.castShadow = true;
  root.add(head);

  // The raised arm, and the lamp on the end of it.
  const arm = new Mesh(new BoxGeometry(0.08, 0.5, 0.08), kit.iron);
  arm.position.set(0.24, 1.32, 0.06);
  arm.rotation.z = -0.5;
  arm.castShadow = true;
  root.add(arm);

  const lamp = new Group();
  lamp.position.set(0.46, 1.62, 0.06);
  root.add(lamp);

  const housing = new Mesh(new CylinderGeometry(0.09, 0.11, 0.2, 8), kit.brass);
  housing.castShadow = true;
  lamp.add(housing);

  const flame = new Mesh(
    new SphereGeometry(0.07, 10, 8),
    new MeshStandardMaterial({
      color: PALETTE.lampBright,
      emissive: PALETTE.lamp,
      emissiveIntensity: 3.4,
      roughness: 0.2,
    }),
  );
  lamp.add(flame);
  lamp.add(kit.halo("pilot", 1.9, 0.7));

  return { root, lamp };
}
