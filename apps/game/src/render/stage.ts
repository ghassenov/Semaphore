/**
 * The scene, the lights, the camera and the loop.
 *
 * This is the only file in the client that owns a renderer, and it is
 * deliberately thin on judgement. Every decision about *what* a frame contains
 * was made before it got here: `chamber.ts` says what is in the room, `plan.ts`
 * says where the rooms are, `camera.ts` says where to stand, `floors.ts` says
 * which floor the pair is on and `ghost.ts` says what is on the monitor. All
 * five are pure and tested. What is left here is building, lighting and moving,
 * which is the half that can only be checked by looking at it.
 *
 * ## The station is a cutaway model
 *
 * Every room is open at the top and open on its south face, and the camera
 * always stands to the south (`camera.ts` says why). So the building is
 * assembled the way an architectural model is: floor slabs, three walls per
 * room, no roofs, and a dark table underneath. That is the same idea D-031
 * reached for when it drew the station as a side-on section, arrived at again
 * with a camera.
 *
 * ## Walls are resolved from the floor, in one pass
 *
 * D-038's rule, and it survived the move to three dimensions for exactly the
 * reason it was written: a corridor meeting a room is a junction, and walls
 * built per-room would each close an opening the other one wanted. So the whole
 * station's floor is rasterised to a one-metre grid, and a wall block stands on
 * every cell that is not floor and touches floor. A doorway is then not a
 * feature anybody places; it is the absence of a wall where two floors meet.
 *
 * ## Light does the work
 *
 * There are four real lights in the station and there is no post-processing
 * (D-042). Everything else that glows is an emissive material with an additive
 * halo behind it, and everything that looks like a light shaft is a translucent
 * cone standing in fog. That is not a corner cut for its own sake: the target
 * list includes ChatGPT's in-app browser on a phone, and a full-screen bloom
 * pass at an uncontrolled resolution is the first thing that would drop the
 * frame rate on it.
 */

import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  SpotLight,
  PointsMaterial,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import type { PilotView, SessionMode } from "@semaphore/protocol";
import {
  ARCHIVE_SCREEN,
  asCleared,
  clearOf,
  doorPlacement,
  hasInterlude,
  LEAN_REACH,
  interlude,
  alcoveOf,
  lampReveal,
  nearestFixture,
  roomPlan,
  type Fixture,
  type RoomPlan,
} from "./chamber.js";
import {
  DRIFT_METRES,
  DRIFT_PERIOD_MS,
  SHOT_MS,
  WALK_MS,
  inspectShot,
  shotFor,
  type Shot,
} from "./camera.js";
import {
  FLOOR_ACCENT,
  cellKey,
  centreOfStation,
  floorsOf,
  footprintOf,
  placementOf,
  stationCells,
  stationOwners,
  stationStrips,
} from "./plan.js";
import { activeFloor, previousFloor, stationFloors, type FloorId } from "./floors.js";
import { doorLeadsTo, doorsOf, type Doorway } from "./doorways.js";
import { isTypingTarget } from "./hud.js";
import { ghostFrame } from "./ghost.js";
import { FixtureView, buildDressing } from "./fixtures.js";
import { KeeperBody, buildPilot, type PilotPose } from "./keeper.js";
import { CHANNEL, PALETTE, hex } from "./palette.js";
import { Kit } from "./kit.js";
import type { StationModel } from "./station.js";

/** How thick a floor slab is, in metres. */
const SLAB = 0.3;

/**
 * How much of a room PILOT can walk, as a fraction of its width and depth.
 *
 * Inset from the walls on every side, so a body never stands inside the
 * masonry and never occludes the mechanism it is walking up to.
 */
const WALK_SPAN = 0.74;
const WALK_SPAN_Z = 0.6;

/** How fast PILOT walks, in fractions of the room per second. */
const WALK_SPEED = 0.34;

/** The largest device-pixel ratio worth rendering at. */
const MAX_DPR = 2;

/** Above this many CSS pixels wide, the ratio is capped harder to stay smooth. */
const LARGE_VIEWPORT = 1100;

/** How many dust motes drift in the active room. */
const DUST = 260;

/** How far into a room PILOT stands after coming through its door, in metres. */
const OVER_THRESHOLD = 1.8;

/** What `station.ts` holds once the stage is up. */
export interface StageHandle {
  /** Re-read the viewport's size. Called by a `ResizeObserver`. */
  resize(): void;
  dispose(): void;
}

/** Bring the station up inside `parent`, reading `model` every frame. */
export function createStage(
  parent: HTMLElement,
  model: StationModel,
  onStanding: () => void = () => {},
): StageHandle {
  const reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

  const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = SRGBColorSpace;
  // A filmic curve rather than a linear clamp. This is the single largest
  // difference between "a lit 3D scene" and "a rendered image": highlights roll
  // off instead of clipping to flat white, so an emissive lamp reads as bright
  // rather than as a white rectangle, and the halo around it carries the hue.
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.setClearColor(PALETTE.abyss, 1);
  renderer.domElement.classList.add("viewport-canvas");
  parent.append(renderer.domElement);

  // The caption layer, which is DOM and is allowed to be.
  //
  // These lines are phase copy - "THE DOOR IS OPEN" - derived from
  // `view.phase`, which is `SHARED` machine state the console's own header
  // already prints. No fact from `view.facts` reaches this element; those are
  // sprites in the scene, because a DOM text node holding a gauge reading is a
  // text node an agent with page access can scrape.
  const caption = document.createElement("div");
  caption.className = "viewport-caption";
  caption.setAttribute("aria-live", "polite");
  parent.append(caption);

  const scene = new Scene();
  // Exponential fog in the void's own colour, and the density is the whole of
  // the tuning.
  //
  // Fog is squared in distance, so a value that is imperceptible at the twenty
  // five metres a room shot stands at is overwhelming at the hundred and ten a
  // wide shot stands at. The first two settings did nothing at all in a chamber
  // and left the building sixty per cent faded into the void when the camera
  // pulled back, which read as the wide shot being broken rather than as
  // distance. This is low enough that the far corner of the station recedes
  // without disappearing.
  scene.fog = new FogExp2(PALETTE.abyss, 0.0035);

  const camera = new PerspectiveCamera(32, 1, 0.5, 320);
  const kit = new Kit();

  // ---- Lights. Four of them, and no more. --------------------------------
  //
  // A hemisphere for the shape of things, a cold directional for the moon and
  // the shadows, one warm practical in whichever room the pair is standing in,
  // and PILOT's lamp. Everything else that appears to be a light is an emissive
  // surface with a halo behind it.
  const sky = new HemisphereLight(PALETTE.tideDeep, PALETTE.abyss, 0.42);
  scene.add(sky);

  const moon = new DirectionalLight(PALETTE.tideBright, 0.75);
  moon.position.set(26, 40, 30);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.near = 10;
  moon.shadow.camera.far = 160;
  moon.shadow.bias = -0.0012;
  // Sized to a room rather than to the renderer's five-metre default, which
  // would put every shadow in the station inside one small square near the
  // origin. The frustum travels with the pair, so the wide shot has shadows
  // only around the room they are standing in - which nobody notices from four
  // hundred metres up, and which keeps this to one 1024px map.
  moon.shadow.camera.left = -22;
  moon.shadow.camera.right = 22;
  moon.shadow.camera.top = 22;
  moon.shadow.camera.bottom = -22;
  moon.shadow.camera.updateProjectionMatrix();
  scene.add(moon);
  scene.add(moon.target);

  const practical = new PointLight(PALETTE.pearl, 0, 26, 1.5);
  scene.add(practical);

  /**
   * The light behind the grate, in KEEPER's own colour.
   *
   * This is the fiction made visible and it costs one light. KEEPER is behind
   * the station's panels; the Blind Panel is the one room where PILOT can see
   * the boundary between them, and it is a grate at floor level. So the room's
   * cold light comes *through* it, and the bars throw a countable pattern of
   * shadow across the floor the pair is standing on.
   *
   * It is placed from the grate fixture rather than per room, so any room that
   * grows a grate gets it and no room that does not is paying for it.
   */
  const behindGrate = new SpotLight(PALETTE.tide, 0, 18, 0.95, 0.45, 1.4);
  behindGrate.castShadow = true;
  behindGrate.shadow.mapSize.set(1024, 1024);
  behindGrate.shadow.camera.near = 0.4;
  behindGrate.shadow.camera.far = 22;
  behindGrate.shadow.bias = -0.002;
  scene.add(behindGrate);
  scene.add(behindGrate.target);

  // ---- The building, built once per mode. --------------------------------
  const building = new Group();
  building.name = "building";
  scene.add(building);
  let built: SessionMode | null = null;
  const roomHalos = new Map<FloorId, ReturnType<Kit["halo"]>>();

  /**
   * The station's masonry, kept so a room shot can drop everything that is not
   * the room being looked at. One entry per instanced mesh over the same block
   * list: the wall itself, then its two trim bands.
   */
  let masonry: {
    readonly blocks: readonly { x: number; z: number; height: number; of: readonly FloorId[] }[];
    readonly meshes: { mesh: InstancedMesh; y: number | null; thickness: number }[];
  } | null = null;
  /** Which floor's shell is currently standing, so the rewrite happens once. */
  let showing: FloorId | null | undefined = undefined;
  /** Every floor slab with the room it belongs to, or `null` for a corridor. */
  const slabs: { slab: Mesh; of: FloorId | null }[] = [];

  /**
   * Stand only the masonry that belongs to `floor`, or all of it for `null`.
   *
   * Instance matrices rather than a second mesh, so the whole station stays two
   * draw calls and the switch costs one buffer upload on the frame a room
   * changes rather than anything per frame.
   */
  function showMasonry(floor: FloorId | null): void {
    if (masonry === null || showing === floor) return;
    showing = floor;
    for (const { slab, of } of slabs) slab.visible = floor === null || of === floor;
    const matrix = new Matrix4();
    for (const { mesh, y, thickness } of masonry.meshes) {
      masonry.blocks.forEach((block, index) => {
        const mine = floor === null || block.of.includes(floor);
        // A band also needs its wall to be tall enough to carry it, which is
        // the rule the bands were built with and has to survive the rewrite.
        const up = mine && (y === null || block.height > y + thickness);
        matrix.makeScale(1, up ? (y === null ? block.height : 1) : 1, 1);
        // Hidden means **sunk below the world**, not flattened.
        //
        // Scaling y to a hair was the first attempt and it is wrong: a box
        // scaled to 0.0001 still has a full-size top face, fully lit, and a
        // grid of them reads as pale plates lying in the void. That is exactly
        // what the corridor walls either side of the Signal Room's south
        // doorway turned into, and it looked like a rendering fault rather
        // than like anything anybody placed.
        matrix.setPosition(
          block.x + 0.5,
          up ? (y === null ? block.height / 2 : y) : -1000,
          block.z + 0.5,
        );
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  function buildStation(mode: SessionMode): void {
    if (built === mode) return;
    built = mode;
    masonry = null;
    showing = undefined;
    building.clear();
    roomHalos.clear();
    slabs.length = 0;
    const owns = stationOwners(mode);

    // Floor slabs: one box per strip, rather than one per grid cell. A slab is
    // flat and a grid of slabs is the same flat thing with a thousand more
    // draw calls in it.
    for (const strip of stationStrips(mode)) {
      const slab = new Mesh(new BoxGeometry(strip.width, SLAB, strip.depth), kit.floor);
      slab.position.set(strip.x, -SLAB / 2, strip.z);
      slab.receiveShadow = true;
      building.add(slab);
      // Which room's floor this is, so a room shot can drop the neighbours'.
      // Hiding the walls alone left their floors behind as dark planes lying
      // outside the room, which is the same defect one layer down.
      slabs.push({ slab, of: owns.get(cellKey(Math.round(strip.x), Math.round(strip.z))) ?? null });
    }

    // Walls: resolved from the floor in one pass, so junctions are openings.
    const cells = stationCells(mode);
    const owners = owns;
    const blocks: { x: number; z: number; height: number; of: readonly FloorId[] }[] = [];
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const key of cells.keys()) {
      const [x, z] = key.split(",").map(Number) as [number, number];
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    for (let z = minZ - 1; z <= maxZ + 1; z += 1) {
      for (let x = minX - 1; x <= maxX + 1; x += 1) {
        if (cells.has(cellKey(x, z))) continue;
        // The south face of every room and corridor is left open, which is what
        // makes the station a model you look into rather than a set of lids.
        // A wall with floor immediately north of it is that south face.
        if (cells.has(cellKey(x, z - 1))) continue;
        const neighbours = [
          cells.get(cellKey(x, z + 1)),
          cells.get(cellKey(x - 1, z)),
          cells.get(cellKey(x + 1, z)),
        ].filter((height): height is number => height !== undefined);
        if (neighbours.length === 0) continue;
        // Which chambers this block is the wall of. Usually one; a block in a
        // corner where two rooms meet belongs to both and is drawn for either.
        const of = [
          ...new Set(
            [cellKey(x, z + 1), cellKey(x - 1, z), cellKey(x + 1, z)]
              .map((key) => owners.get(key))
              .filter((floor): floor is FloorId => floor !== undefined),
          ),
        ];
        blocks.push({ x, z, height: Math.max(...neighbours), of });
      }
    }

    const wall = new InstancedMesh(new BoxGeometry(1, 1, 1), kit.stone, blocks.length);
    wall.castShadow = true;
    wall.receiveShadow = true;
    const matrix = new Matrix4();
    blocks.forEach((block, index) => {
      matrix.makeScale(1, block.height, 1);
      matrix.setPosition(block.x + 0.5, block.height / 2, block.z + 0.5);
      wall.setMatrixAt(index, matrix);
    });
    building.add(wall);
    masonry = { blocks, meshes: [{ mesh: wall, y: null, thickness: 0 }] };

    // Panelling: a skirting band at the foot of every wall and a rail at
    // shoulder height. Two instanced meshes over the same block list, which
    // costs two draw calls for the whole station and is the difference between
    // a wall and an extruded rectangle. Iron rather than stone, so the bands
    // catch a highlight the wall behind them does not.
    for (const [y, thickness] of [
      [0.28, 0.36],
      [1.95, 0.16],
    ] as const) {
      const band = new InstancedMesh(
        new BoxGeometry(1.06, thickness, 1.06),
        kit.iron,
        blocks.length,
      );
      band.receiveShadow = true;
      blocks.forEach((block, index) => {
        // A band only where the wall is tall enough to carry it, which keeps
        // the low corridor walls plain and the room walls detailed. Sunk
        // rather than flattened, for the reason `showMasonry` records.
        const visible = block.height > y + thickness;
        matrix.setPosition(block.x + 0.5, visible ? y : -1000, block.z + 0.5);
        band.setMatrixAt(index, matrix);
      });
      building.add(band);
      masonry?.meshes.push({ mesh: band, y, thickness });
    }
    // Nothing is standing anywhere yet, so start on the whole building. The
    // first frame narrows it the moment a floor is known.
    showMasonry(null);

    // One halo per room, standing in for a light. Free, and it is what makes
    // the wide shot read as a building with rooms in it rather than as a plan.
    for (const floor of floorsOf(mode)) {
      const at = placementOf(mode, floor);
      if (at === null) continue;
      const size = footprintOf(floor);
      const halo = kit.halo(FLOOR_ACCENT[floor], Math.max(size.width, size.depth) * 1.35, 0);
      halo.position.set(at.x, size.height * 0.42, at.z);
      building.add(halo);
      roomHalos.set(floor, halo);
    }
  }

  // ---- The room the pair is standing in. ---------------------------------
  const roomGroup = new Group();
  roomGroup.name = "room";
  scene.add(roomGroup);
  const fixtures = new Map<string, FixtureView>();
  /**
   * The room's dressing, rebuilt only when the room changes.
   *
   * Separate from the fixture pool because dressing has no state: nothing here
   * animates, nothing is read, and nothing needs to survive a repaint. Building
   * it once per room rather than diffing it per frame is the whole difference.
   */
  const dressing = new Group();
  dressing.name = "dressing";
  roomGroup.add(dressing);
  let fixtureRoom: FloorId | null = null;

  // Water, for the Airlock's escalation. It has no mechanical effect ever, and
  // it is the same substance as the puddles standing in every other room, so
  // the chamber flooding reads as more of what is already there rather than as
  // a different effect switching on.
  const water = new Mesh(new PlaneGeometry(1, 1), kit.water);
  water.rotation.x = -Math.PI / 2;
  water.visible = false;
  roomGroup.add(water);

  /** The pearl wash a solved room gets. Never green: see `palette.ts`. */
  const successMaterial = new MeshBasicMaterial({
    color: PALETTE.pearl,
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const success = new Mesh(new PlaneGeometry(1, 1), successMaterial);
  success.rotation.x = -Math.PI / 2;
  roomGroup.add(success);

  // ---- The Archive's monitor screen. --------------------------------------
  //
  // The housing is a fixture like any other; what is *on* it is a projection of
  // a prior session, so it is drawn here. `ghost.ts` decides the content.
  const screenCanvas = document.createElement("canvas");
  screenCanvas.width = 384;
  screenCanvas.height = 252;
  const screenTexture = kit.screenTexture(screenCanvas);
  const screen = new Mesh(
    new PlaneGeometry(ARCHIVE_SCREEN.width, ARCHIVE_SCREEN.height),
    new MeshBasicMaterial({ map: screenTexture, toneMapped: false, fog: false }),
  );
  screen.visible = false;
  roomGroup.add(screen);
  let ghostFrom: number | null = null;

  // ---- The two bodies. ----------------------------------------------------
  const keeper = new KeeperBody(kit);
  scene.add(keeper.root);

  const pilot = buildPilot(kit);
  scene.add(pilot.root);
  const lampLight = new PointLight(PALETTE.lamp, 6, 11, 1.8);
  lampLight.castShadow = false;
  pilot.lamp.add(lampLight);

  // ---- Dust. ---------------------------------------------------------------
  const dust = buildDust(kit);
  dust.visible = !reduceMotion;
  scene.add(dust);

  // ---- Camera state. -------------------------------------------------------
  let shot: Shot | null = null;
  let fromEye = new Vector3();
  let fromTarget = new Vector3();
  let shotAt = 0;
  let shotKey = "";
  const lookAt = new Vector3();
  let wasOn: FloorId | null | undefined;
  let walkUntil = 0;
  /**
   * Where PILOT stands, as a fraction of the walkable floor on each axis.
   *
   * **Two axes, and the second one is not a nicety.** With movement on `x`
   * alone, every mechanism in the game is on a wall PILOT can never approach:
   * the levers, the gauges, the ring and the door are all at the back, and the
   * lamp could not reach any of them from the only line a body was allowed to
   * stand on. Walking existed and could not do the one thing walking is for.
   */
  /** How hard PILOT is walking, 0 to 1, eased. Drives the stride. */
  let stride = 0;
  let walk = 0.5;
  // Mid-room rather than at the back wall, and that is a teaching decision.
  // From here the nearest mechanism is inside the lamp's reach and the ones to
  // either side are visibly dimmer, so the first thing a player sees is the
  // mechanic working. Starting at the front opens the game on three blank
  // plates and no reason to suspect walking would change them.
  let walkZ = 0.5;

  /**
   * Where PILOT is standing, in station metres.
   *
   * One value, written once a frame and read by the lamp, the camera's follow
   * and the lean-in. Three separate derivations of "where is PILOT" is exactly
   * the shape of bug that put the camera in the wrong shot for a whole tour.
   */
  let pilotAt = { x: 0, z: 0 };
  /** What the lean-in is currently framing, so releasing the key returns. */
  let leaning: Fixture | null = null;
  /** Which way PILOT is facing, held between steps. */
  let facing = 0;

  /*
   * Where PILOT's *body* is, which is not always where the session is.
   *
   * The pair can walk back through a door they have already opened (D-054).
   * That is a change to what the human is looking at and nothing else: the
   * server is not told, the clock does not stop, KEEPER's tools still act on
   * the chamber the session is in, and none of this leaves this file.
   * `viewing` is the floor the body stands in; `here`, each frame, is the
   * floor the session is in. They are equal except while somebody has
   * wandered.
   */
  let viewing: FloorId | null = null;
  /** The floor the session was in last frame, so the pair moving on wins. */
  let wasHere: FloorId | null | undefined;
  /**
   * The last plan seen for each floor.
   *
   * `PilotView.facts` only ever carries the active chamber's facts, so a room
   * the pair has left has no live state to be drawn from. This is what they
   * saw while they were standing in it, held frame by frame, which is exactly
   * the right thing to show and leaks nothing: it is the same projection that
   * was already on screen. `asCleared` opens its doors on the way out.
   */
  const seen = new Map<FloorId, RoomPlan>();
  /**
   * The last ghost the Archive played.
   *
   * `view.ghost` is null outside the ARCHIVE phase, so walking back into the
   * Archive later would find a monitor with nothing on it - in the one room
   * whose entire content is that monitor.
   */
  let lastGhost: PilotView["ghost"] = null;
  /**
   * Whether `Q` was already down last frame.
   *
   * Going through a door is edge-triggered, so leaning on the key crosses one
   * threshold rather than every threshold between here and the Airlock.
   */
  let wasGoing = false;

  const held = new Set<string>();
  // PILOT's body must not answer to a keystroke that was aimed at the shared
  // notepad. See `isTypingTarget`.
  const onKeyDown = (event: KeyboardEvent): void => {
    if (isTypingTarget(event.target)) return;
    held.add(event.key.toLowerCase());
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    held.delete(event.key.toLowerCase());
  };
  // A key held when the window loses focus never sees its `keyup`, so it stays
  // in the set forever: alt-tab away mid-stride and PILOT walks into a wall
  // until the key is pressed and released again. Dropping everything on blur is
  // the only correct answer, since we cannot know what is still down.
  const onBlur = (): void => {
    held.clear();
  };
  globalThis.addEventListener("keydown", onKeyDown);
  globalThis.addEventListener("keyup", onKeyUp);
  globalThis.addEventListener("blur", onBlur);

  function aspect(): number {
    const width = parent.clientWidth || 1;
    const height = parent.clientHeight || 1;
    return width / height;
  }

  function resize(): void {
    const width = parent.clientWidth || 1;
    const height = parent.clientHeight || 1;
    const ratio = Math.min(
      globalThis.devicePixelRatio || 1,
      width > LARGE_VIEWPORT ? 1.5 : MAX_DPR,
    );
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    // A shot is framed against the aspect, so a resize invalidates the framing
    // rather than merely stretching it.
    shotKey = "";
  }

  /** Rebuild the active room's fixtures, and keep the ones that stayed. */
  function syncFixtures(plan: RoomPlan | null, floor: FloorId | null, mode: SessionMode): void {
    if (plan === null || floor === null) {
      if (fixtureRoom !== null) clearFixtures();
      return;
    }
    if (fixtureRoom !== plan.id) {
      clearFixtures();
      fixtureRoom = plan.id;
      const at = placementOf(mode, floor);
      roomGroup.position.set(at?.x ?? 0, 0, at?.z ?? 0);
      for (const item of plan.dressing) {
        const piece = buildDressing(kit, item);
        // Named so the scene graph is diagnosable. Finding which piece of
        // geometry is standing in a frame used to mean bisecting the graph by
        // hiding groups one at a time; a name turns that into one dump.
        piece.name = `dress:${item.kind}`;
        dressing.add(piece);
      }
    }

    const seen = new Set<string>();
    for (const fixture of plan.fixtures) {
      seen.add(fixture.id);
      const existing = fixtures.get(fixture.id);
      if (existing) {
        existing.apply(fixture);
        continue;
      }
      const view = new FixtureView(kit, fixture);
      view.root.name = `fix:${fixture.id}`;
      fixtures.set(fixture.id, view);
      roomGroup.add(view.root);
    }
    // A fixture the server has stopped sending is gone from the room. It is
    // removed rather than hidden, because a hidden fixture still holds its
    // geometry and its materials for the rest of the session.
    for (const [id, view] of fixtures) {
      if (seen.has(id)) continue;
      view.dispose();
      fixtures.delete(id);
    }
  }

  function clearFixtures(): void {
    for (const view of fixtures.values()) view.dispose();
    fixtures.clear();
    dressing.traverse((object) => {
      if (object instanceof Mesh) object.geometry.dispose();
    });
    dressing.clear();
    fixtureRoom = null;
  }

  /** Put the room's floor-wide effects where the room is. */
  /**
   * The room breathing.
   *
   * Dressing was built once per room and never touched again, on the stated
   * grounds that it has no state and nothing to read. That is still true - and
   * it was being used to argue something else, that nothing in it moves. A
   * station a hundred metres down with a cable hanging dead still off every
   * beam is a photograph of a room rather than a room.
   *
   * Driven off the piece's own position rather than a stored phase, so nothing
   * has to be tracked between frames and no two pieces move together. It reads
   * the group's name, which is set where the piece is built, so a kind that
   * should not move simply is not named here.
   *
   * Under `prefers-reduced-motion` it is not called at all, and the room is the
   * still one those players asked for.
   */
  function stepDressing(now: number): void {
    for (const piece of dressing.children) {
      // Two positions, two irrational-ish multipliers: enough that a row of
      // identical cables does not sway as one object.
      const phase = piece.position.x * 1.7 + piece.position.z * 0.9;
      if (piece.name === "dress:cable" || piece.name === "dress:bulb") {
        // Hung from the ceiling, so the anchor is the pivot and rotating the
        // group is exactly the swing. Small: this is a draught, not a storm.
        piece.rotation.z = Math.sin(now / 2600 + phase) * 0.045;
        piece.rotation.x = Math.cos(now / 3100 + phase) * 0.032;
      } else if (piece.name === "dress:vent") {
        const fan = piece.getObjectByName("fan");
        // Slow, and slower still in some rooms than others. An extractor at a
        // convincing speed strobes against the frame rate and reads as a
        // rendering fault, which is the one thing decoration may not do.
        if (fan) fan.rotation.y = (now / 1000) * (0.7 + (Math.abs(phase) % 0.5));
      }
    }
  }

  function dressRoom(plan: RoomPlan | null): void {
    if (plan === null) {
      water.visible = false;
      success.visible = false;
      screen.visible = false;
      return;
    }
    const { width, depth } = plan.size;

    water.visible = plan.flood > 0;
    if (water.visible) {
      water.scale.set(width, depth, 1);
      water.position.set(0, 0.02 + plan.flood * 0.13, 0);
    }

    success.visible = plan.solved;
    success.scale.set(width, depth, 1);
    success.position.set(0, 0.06, 0);
    successMaterial.opacity = plan.solved ? 0.12 : 0;

    screen.visible = plan.id === "archive";
    if (screen.visible) {
      // Measured from the monitor fixture's own anchor, so the picture cannot
      // end up inside the casing when either is resized.
      screen.position.set(0, ARCHIVE_SCREEN.y, -depth / 2 + 0.25 + ARCHIVE_SCREEN.proud);
    }
  }

  /** Draw the ghost onto the monitor's canvas. */
  function paintScreen(track: PilotView["ghost"], elapsedMs: number): void {
    const context = screenCanvas.getContext("2d");
    if (!context) return;
    const { width, height } = screenCanvas;

    context.fillStyle = hex(PALETTE.abyss);
    context.fillRect(0, 0, width, height);

    if (track === null) {
      context.fillStyle = hex(PALETTE.lampDeep);
      context.font = "600 22px ui-monospace, Menlo, monospace";
      context.textAlign = "center";
      context.fillText("NO TAPE", width / 2, height / 2);
      screenTexture.needsUpdate = true;
      return;
    }

    ghostFrom ??= elapsedMs;
    const frame = ghostFrame(track, elapsedMs - ghostFrom);

    // The designation. A session log carries no other name, and it is the
    // reason the beat lands at all: the pair are watching somebody.
    context.fillStyle = hex(PALETTE.lampDeep);
    context.font = "600 17px ui-monospace, Menlo, monospace";
    context.textAlign = "left";
    context.fillText(track.designation, 14, 26);

    // The room the ghost was in, as a plan at its true proportion.
    const bandTop = 40;
    const bandHeight = height - 96;
    const scale = Math.min((width - 60) / frame.width, bandHeight / frame.depth);
    const planWidth = frame.width * scale;
    const planDepth = frame.depth * scale;
    const planX = (width - planWidth) / 2;
    const planY = bandTop + (bandHeight - planDepth) / 2;

    context.strokeStyle = hex(frame.ended ? PALETTE.lampDeep : PALETTE.lamp);
    context.lineWidth = 2;
    context.strokeRect(planX, planY, planWidth, planDepth);

    // The ghost, walking. Every position between two beats is `ghost.ts`'s
    // invention: PILOT's position is client-local and no session log has ever
    // carried it. The beats themselves are real, which is what makes the
    // interpolation honest rather than a fiction.
    const bodySize = Math.max(6, scale * 0.9);
    const bodyX = planX + frame.walk * (planWidth - bodySize);
    const bodyY = planY + planDepth - bodySize - 4;
    context.fillStyle = hex(frame.ended ? PALETTE.lampDeep : PALETTE.lamp);
    context.fillRect(bodyX, bodyY, bodySize, bodySize);
    // Gripping is the one posture worth drawing: the ghost is holding the bar,
    // and the reason the recording stops is that they could not hold it.
    if (frame.gripping) context.fillRect(bodyX, bodyY - bodySize - 2, bodySize, bodySize);

    // One line, centred, saying what is happening.
    context.fillStyle = hex(frame.ended ? PALETTE.pearl : PALETTE.lamp);
    context.font = "600 16px ui-monospace, Menlo, monospace";
    context.textAlign = "center";
    context.fillText(frame.caption, width / 2, height - 34);

    // The scrub bar, so a pair arriving part way through can see there is a
    // beginning to wait for.
    context.fillStyle = hex(PALETTE.lampDeep);
    context.fillRect(14, height - 18, width - 28, 3);
    context.fillStyle = hex(PALETTE.lamp);
    context.fillRect(14, height - 18, (width - 28) * frame.progress, 3);

    // Scanlines, last, over everything. A monitor in a station this old is not
    // a clean surface, and the lines are what stop the schematic reading as a
    // modern overlay pasted onto a 3D scene.
    context.fillStyle = "rgba(5,7,10,0.28)";
    for (let y = 0; y < height; y += 3) context.fillRect(0, y, width, 1);

    screenTexture.needsUpdate = true;
  }

  /** Move the camera to a shot, easing rather than cutting. */
  function frame(next: Shot, now: number): void {
    const key = `${next.floor ?? "wide"}:${next.eye.x.toFixed(2)}:${next.eye.y.toFixed(2)}:${next.eye.z.toFixed(2)}`;
    if (key !== shotKey) {
      // The first shot of a session is a cut. There is nothing to move from,
      // and sliding in from wherever the camera happened to start reads as a
      // glitch rather than as a camera move.
      const first = shot === null;
      fromEye = camera.position.clone();
      fromTarget = lookAt.clone();
      shot = next;
      shotKey = key;
      shotAt = first ? now - SHOT_MS : now;
      if (first) {
        fromEye.set(next.eye.x, next.eye.y, next.eye.z);
        fromTarget.set(next.target.x, next.target.y, next.target.z);
      }
    }
    if (shot === null) return;

    const t = Math.min(1, (now - shotAt) / SHOT_MS);
    // Smoothstep, so the move starts and stops without a visible kink.
    const eased = t * t * (3 - 2 * t);
    camera.position.set(
      fromEye.x + (shot.eye.x - fromEye.x) * eased,
      fromEye.y + (shot.eye.y - fromEye.y) * eased,
      fromEye.z + (shot.eye.z - fromEye.z) * eased,
    );
    lookAt.set(
      fromTarget.x + (shot.target.x - fromTarget.x) * eased,
      fromTarget.y + (shot.target.y - fromTarget.y) * eased,
      fromTarget.z + (shot.target.z - fromTarget.z) * eased,
    );

    // A still camera in a still room reads as a paused game, so it breathes.
    // Suppressed under reduced motion, where a camera that moves on its own is
    // not atmosphere but a problem.
    if (!reduceMotion) {
      const phase = (now / DRIFT_PERIOD_MS) * Math.PI * 2;
      camera.position.x += Math.sin(phase) * DRIFT_METRES;
      camera.position.y += Math.cos(phase * 0.7) * DRIFT_METRES * 0.5;
    }

    camera.fov = shot.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(lookAt);
  }

  /**
   * Stand PILOT just inside one of a room's doorways.
   *
   * Walking is held as a fraction of the walkable box on each axis, so arriving
   * somewhere means solving for the fraction rather than writing a position.
   * With no doorway - the very first room, which is entered from the sea - the
   * middle of the room is kept, which is where the game has always opened.
   */
  function standAt(floor: FloorId, doorway: Doorway | undefined): void {
    const size = footprintOf(floor);
    if (doorway === undefined) {
      walk = 0.5;
      walkZ = 0.5;
      return;
    }
    const { at, facing: yaw } = doorPlacement(size, doorway);
    // Into the room is the direction the door faces, the same relation
    // `doorDressing` uses to put the chevrons on the inside of the threshold.
    const x = at.x + Math.sin(yaw) * OVER_THRESHOLD;
    const z = at.z + Math.cos(yaw) * OVER_THRESHOLD;
    const span = size.width * WALK_SPAN;
    const depth = size.depth * WALK_SPAN_Z;
    walk = span > 0 ? Math.max(0, Math.min(1, (x + span / 2) / span)) : 0.5;
    walkZ = depth > 0 ? Math.max(0, Math.min(1, (z + depth / 2) / depth)) : 0.5;
    facing = yaw;
  }

  /**
   * The nearest open door in reach that leads somewhere PILOT may go.
   *
   * Reach rather than contact, and the same reach the lean-in uses, so "near
   * enough to read where this goes" and "near enough to walk through it" are
   * one distance. Every door in the room is considered rather than only the
   * nearest fixture: a room has two doorways and a bank of levers, and the
   * nearest *fixture* to somebody standing in a doorway is very often a lever.
   */
  function doorAhead(
    mode: SessionMode,
    from: FloorId,
    here: FloorId | null,
    plan: RoomPlan,
    x: number,
    z: number,
  ): FloorId | null {
    let best: FloorId | null = null;
    let nearest = LEAN_REACH;
    for (const fixture of plan.fixtures) {
      const to = doorLeadsTo(mode, from, fixture, (dest) => dest === here || seen.has(dest));
      if (to === null) continue;
      const distance = Math.hypot(fixture.at.x - x, fixture.at.z - z);
      if (distance > nearest) continue;
      nearest = distance;
      best = to;
    }
    return best;
  }

  let last = performance.now();
  let running = true;

  function tick(now: number): void {
    if (!running) return;
    const deltaMs = Math.min(64, now - last);
    last = now;

    const view = model.view;
    const mode: SessionMode = view?.mode ?? "full";
    buildStation(mode);

    // Where the *session* is. The clock, the tool surface and KEEPER's body
    // all answer to this and never to where the human has wandered off to.
    const here = view === null ? null : activeFloor(view);
    const livePlan = view === null ? null : roomPlan(view);
    if (here !== null && livePlan !== null) seen.set(here, livePlan);
    if (view?.ghost != null) lastGhost = view.ghost;

    // The pair moving on ends any wander: the body goes where the session goes.
    //
    // **It does not stand PILOT in the doorway**, and the tour is why. Doing
    // that reads well on its own and drags the camera with it, because the
    // room shot follows the body: every chamber opened with a third of the
    // frame taken up by the outside of the wall its door is in. The middle of
    // the room is where the composition was tuned. Only walking through a door
    // puts PILOT in one.
    if (here !== wasHere) {
      viewing = here;
      wasHere = here;
      if (here !== null) standAt(here, undefined);
    }

    // Where PILOT's *body* is. Identical to `here` unless somebody has walked
    // back through a door, in which case the room is drawn from the last frame
    // the server sent for it, with its doors open.
    const floor = viewing;
    // The console reads this to name the room the viewport is actually
    // showing: one value, written where it is decided, and announced once when
    // it changes. The console repaints on model events rather than per frame
    // (`station.ts` says why), so a field written every frame and announced
    // never is a field the console shows the previous value of forever.
    if (model.standing !== floor) {
      model.standing = floor;
      onStanding();
    }
    const behind = floor === null || floor === here ? null : seen.get(floor);
    const plan =
      behind !== undefined && behind !== null
        ? asCleared(behind)
        : floor === here
          ? livePlan
          : null;

    // Changing room starts the walk: the camera holds the whole building for a
    // moment before settling into the next chamber.
    //
    // **Only between two actual rooms.** Arriving in the first chamber is a
    // move from nowhere, not a walk, and holding the building for it means the
    // first thing anybody sees of the Airlock is the Airlock two hundred metres
    // away in the corner of a dark plan. The first tour caught exactly that:
    // every room shot in it was the wide shot, because `wasOn` had already been
    // set to `null` by the lobby frame before the first floor arrived, so the
    // "nothing to walk from" guard had stopped guarding.
    if (floor !== wasOn) {
      if (wasOn !== undefined && wasOn !== null && floor !== null) walkUntil = now + WALK_MS;
      wasOn = floor;
    }
    // PILOT walks first, because everything after it measures against where
    // they ended up: the lamp resolves what is near them, the camera leans
    // toward them, and the lean-in frames whatever they are standing at.
    const acrossKeys =
      (held.has("d") || held.has("arrowright") ? 1 : 0) -
      (held.has("a") || held.has("arrowleft") ? 1 : 0);
    // Toward the back wall is away from the camera, which is negative z, so
    // `w` and the up arrow walk into the room.
    const intoKeys =
      (held.has("s") || held.has("arrowdown") ? 1 : 0) -
      (held.has("w") || held.has("arrowup") ? 1 : 0);
    const pace = (deltaMs / 1000) * WALK_SPEED;
    walk = Math.max(0, Math.min(1, walk + acrossKeys * pace));
    walkZ = Math.max(0, Math.min(1, walkZ + intoKeys * pace));

    // How hard PILOT is walking, eased. Drives the stride, and eased rather
    // than switched because a body that snaps between standing and a full
    // stride is worse than one that never moved.
    const pressing = Math.min(1, Math.hypot(acrossKeys, intoKeys));
    stride += (pressing - stride) * Math.min(1, (deltaMs / 1000) * 8);

    const standing = floor === null ? null : placementOf(mode, floor);
    if (standing !== null && plan !== null) {
      const span = plan.size.width * WALK_SPAN;
      const depth = plan.size.depth * WALK_SPAN_Z;
      // The walkable box keeps a body out of the masonry; `clearOf` keeps it
      // out of the furniture. Solved in room-local metres and then placed, so
      // the collision never has to know where the room is.
      const clear = clearOf(plan, -span / 2 + walk * span, -depth / 2 + walkZ * depth);
      // Walked back into the fractions, so a body pushed off a lever stays
      // pushed rather than sliding back into it on the next frame.
      walk = span > 0 ? Math.max(0, Math.min(1, (clear.x + span / 2) / span)) : walk;
      walkZ = depth > 0 ? Math.max(0, Math.min(1, (clear.z + depth / 2) / depth)) : walkZ;
      pilotAt = { x: standing.x + clear.x, z: standing.z + clear.z };
    }

    // Whether the *shot* is wide, not whether one was asked for.
    //
    // Two different things had been deciding this separately: the camera used
    // `shotFor`, which also pulls back when there is no room to be in, and the
    // lighting used the request. So the lobby framed the whole station and lit
    // it as though the pair were standing in a chamber, and the first thing
    // anybody saw of the game was a black rectangle. One value now, read from
    // the shot that will actually be used.
    const asked = held.has("m") || now < walkUntil;

    // Lean in: hold E near a mechanism and the camera goes and looks at it.
    // The one camera move the human drives, and the reason a glyph is a thing
    // you can describe rather than a thing you can merely see.
    const wantsLean = held.has("e") && !asked;
    leaning =
      wantsLean && plan !== null && standing !== null
        ? nearestFixture(plan, pilotAt.x - standing.x, pilotAt.z - standing.z)
        : null;

    /*
     * Going through a door.
     *
     * `Q`, and deliberately **not** a long press of `E`. The first build laid
     * it on top of the lean-in on the grounds that it is the same gesture, and
     * the tour caught what that costs: `E` near a door stopped meaning "let me
     * look at this" and started meaning "leave the room". Those are two
     * intentions, and the one frame in the tour that exists to show a lean-in
     * came back as the camera halfway out of the building. Two intentions, two
     * keys.
     *
     * Edge-triggered, so leaning on the key crosses one threshold rather than
     * every threshold between here and the Airlock.
     */
    const going = held.has("q");
    const doorTo =
      going && !wasGoing && plan !== null && standing !== null && floor !== null
        ? doorAhead(mode, floor, here, plan, pilotAt.x - standing.x, pilotAt.z - standing.z)
        : null;
    wasGoing = going;
    if (doorTo !== null && floor !== null) {
      // Standing at the door on the far side that leads back to the room just
      // left, so the two doorways are one doorway seen from either side.
      const doors = doorsOf(mode, doorTo);
      standAt(doorTo, doorTo === previousFloor(mode, floor) ? doors.out : doors.back);
      viewing = doorTo;
      leaning = null;
      // The rest of this frame was measured against the room PILOT has just
      // left, and a lamp, a shot and a set of fixtures resolved for a room
      // nobody is standing in is one frame of the wrong building. The next
      // tick has the right one.
      requestAnimationFrame(tick);
      return;
    }

    let shot: Shot;
    if (leaning !== null && standing !== null) {
      shot = inspectShot(
        {
          x: standing.x + leaning.at.x,
          y: leaning.at.y,
          z: standing.z + leaning.at.z,
        },
        aspect(),
        { centre: standing, size: plan?.size ?? footprintOf(floor ?? "airlock") },
      );
    } else {
      shot = shotFor(mode, view?.phase ?? "ENTRY", floor, asked, aspect(), pilotAt);
    }
    const wide = shot.floor === null && leaning === null;

    // Keyed on the shot, not the request: the walk between rooms is a wide
    // shot, and standing only one room's walls up during it would show the
    // building with a hole where the pair is going.
    showMasonry(wide ? null : floor);

    // The wide shot is a model on a table and needs to be lit like one. In a
    // room the ambient is kept low on purpose, so that the practical and the
    // emissive facts do the work; pulled back, that same ambient leaves four
    // of the five rooms as black boxes with a smudge in them, which is what
    // the first wide-shot probe came back as.
    // In a room the ambient stays low so the practical and the emissive facts
    // do the work - but **low is not zero**. At 0.42 anything the practical
    // did not reach came back as flat black: a four-metre rack of tape reels
    // against the Archive's east wall read as a hole cut in the room, and it
    // was reported as a rendering bug rather than as a dark corner, which is
    // the correct reading. 0.62 is still well under half the wide shot's fill
    // and is enough that unlit geometry keeps its shape.
    sky.intensity = wide ? 2.4 : 0.62;
    moon.intensity = wide ? 2.1 : 0.95;

    syncFixtures(plan, floor, mode);
    dressRoom(plan);
    // PILOT's lamp. Detail resolves near it and fades beyond it, which is what
    // makes crossing the room the human's actual job (doc 06 section 4). The
    // fixture's own coordinates are room-local, so the lamp is measured in the
    // same space rather than converting the world back.
    if (standing !== null) {
      const localX = pilotAt.x - standing.x;
      const localZ = pilotAt.z - standing.z;
      for (const fixtureView of fixtures.values()) {
        const at = fixtureView.at;
        fixtureView.reveal(lampReveal(localX, localZ, { x: at.x, y: 0, z: at.z }));
      }
    } else {
      for (const fixtureView of fixtures.values()) fixtureView.reveal(1);
    }
    for (const fixtureView of fixtures.values()) fixtureView.step(deltaMs, now);
    // Captions last, once the camera for this frame is settled, so a caption is
    // the same size on screen in a room shot, a lean-in and the wide shot.
    for (const fixtureView of fixtures.values()) {
      fixtureView.sizeCaption(camera.position, camera.fov);
    }

    /*
     * The light from beyond the room, which is a grate in one chamber and the
     * open outer door at the end.
     *
     * One light for both, because they are the same thing: something on the
     * far side of an opening, throwing the opening's shape across the floor
     * the pair is standing on. Sharing it also keeps the light budget at the
     * five the art direction allows rather than growing a sixth for one beat.
     *
     * The finale had no light of its own at all, which is part of why the last
     * two frames of the game were a grey box: the room was lit by a single
     * ceiling practical and there was nothing in it to catch the light.
     */
    const outerDoor =
      plan?.solved === true
        ? plan.fixtures.find((fixture) => fixture.kind === "door" && fixture.on)
        : undefined;
    {
      const at = floor === null ? null : placementOf(mode, floor);
      const grate = plan?.fixtures.find((fixture) => fixture.kind === "grate");
      const opening = grate ?? outerDoor;
      if (opening !== undefined && at !== null && plan !== null) {
        // Cold and much stronger through a door than through a grate: a grate
        // is a hatch and the outer door is the sea.
        const throughDoor = grate === undefined;
        behindGrate.color.setHex(throughDoor ? PALETTE.tideBright : PALETTE.tide);
        // Enough to throw a shaft across the floor, and **not** enough to fill
        // the room. At 260 it lit every wall of a nine-metre cathedral evenly
        // and the room came back as a pale warehouse: the doorway only reads as
        // bright if the room around it stays dark. The door's own lit opening
        // does the rest, and that is emissive rather than a light.
        behindGrate.intensity = throughDoor ? 110 : 55;
        behindGrate.distance = throughDoor ? 34 : 18;
        behindGrate.angle = throughDoor ? 0.34 : 0.95;
        behindGrate.position.set(
          at.x + opening.at.x,
          opening.at.y + (throughDoor ? 2.2 : 0.45),
          at.z + opening.at.z - (throughDoor ? 2.6 : 1.1),
        );
        behindGrate.target.position.set(at.x + opening.at.x, 0.3, at.z + opening.at.z + 6);
      } else {
        behindGrate.intensity = 0;
      }
    }

    // The room's own practical, and the moon's shadow frustum, follow the pair.
    if (floor !== null && plan !== null) {
      const at = placementOf(mode, floor);
      if (at) {
        const tones = CHANNEL[plan.accent];
        practical.color.setHex(tones.key);
        // Scaled to the room's floor area rather than flat. One number for a
        // 56 square metre Archive and a 168 square metre Concord Lock lit the
        // first as a showroom and the second barely at all.
        // **A quarter of that once the outer door is open.** The room's own
        // lights stop mattering at the end: the only light worth having is the
        // one coming in from outside, and a nine-metre cathedral lit evenly by
        // its own practical came back as a pale warehouse with a bright
        // rectangle in it. Dropping the fill is what makes the doorway read.
        practical.intensity =
          (26 + plan.size.width * plan.size.depth * 0.5) * (outerDoor === undefined ? 1 : 0.26);
        practical.position.set(at.x, plan.size.height * 0.82, at.z + plan.size.depth * 0.1);
        const lit = wide ? centreOfStation(mode) : at;
        moon.target.position.set(lit.x, 0, lit.z);
        moon.position.set(lit.x + 26, 46, lit.z + 34);
        dust.position.set(at.x, 1.6, at.z);
      }
    } else if (floor !== null) {
      // A phase with a floor and no facts: the finale, and the ending. The pair
      // is still standing somewhere and the room should still be lit, quietly.
      const at = placementOf(mode, floor);
      if (at) {
        practical.color.setHex(CHANNEL.shared.key);
        practical.intensity = 26 + footprintOf(floor).width * footprintOf(floor).depth * 0.28;
        practical.position.set(at.x, footprintOf(floor).height * 0.7, at.z);
        moon.target.position.set(at.x, 0, at.z);
        moon.position.set(at.x + 18, 34, at.z + 26);
      }
    } else {
      practical.intensity = 0;
    }

    // Every room's halo, by how far the pair has got. A cleared room stays lit,
    // which is the only progress the building itself shows.
    // Only in the wide shot. Close up a halo the size of a room is a grey
    // smudge over the mechanism, which is what the first tour's ending frame
    // was: the room halo, at full strength, with the practical switched off.
    if (view !== null) {
      for (const room of stationFloors(view)) {
        const halo = roomHalos.get(room.id);
        if (!halo) continue;
        halo.material.opacity = !wide ? 0 : room.active ? 0.62 : room.cleared ? 0.34 : 0.16;
      }
    }

    // PILOT and KEEPER are placed from the position walked out above, rather
    // than from a second derivation of it.
    if (floor !== null && plan !== null) {
      const at = placementOf(mode, floor);
      if (at) {
        pilot.root.visible = true;
        pilot.root.position.set(pilotAt.x, 0, pilotAt.z);
        // Facing the way they are walking, and holding that heading when they
        // stop: a body that snaps back to face the camera the moment you let go
        // of a key reads as a token rather than as a person.
        if (pressing > 0.01) facing = Math.atan2(acrossKeys, intoKeys);
        pilot.root.rotation.y = facing;
        /*
         * What the body is doing, derived from what the stage already knows
         * rather than pushed to it: the room's own solved flag, whether `E` is
         * holding a fixture, and the stride. Nothing new travels to get here,
         * so the pose cannot disagree with the room.
         *
         * Called even under reduced motion, with the stride zeroed. The walk
         * cycle is the part that could trouble anybody; a body that breathes
         * and turns to look at what it is lighting is not vestibular motion,
         * and freezing it entirely was leaving those players a mannequin.
         */
        const pose: PilotPose =
          plan.solved && stride < 0.05
            ? "solved"
            : leaning !== null
              ? "leaning"
              : stride > 0.05
                ? "walking"
                : "idle";
        pilot.step(now, reduceMotion ? 0 : stride, pose);
        // KEEPER stands in the east wall of whichever room the *session* is
        // in. It is not *in* the room: it is behind the station's panels,
        // reaching into every cavity at once. They can see each other and
        // reach each other nowhere.
        //
        // **Not in a room PILOT has walked back to.** KEEPER is a body at the
        // chamber the pair is working on, and drawing it in a room the session
        // left two chambers ago would be the animation claiming a presence the
        // tool surface does not have. An empty alcove in the room behind you
        // is the honest picture, and it is a good one: you went back and your
        // partner is not there.
        keeper.root.visible = floor === here;
        // The east wall, from the one function the room plans are checked
        // against, so a rack of shelves can never be written into the body -
        // and neither can a doorway, which three of the five east walls now
        // have (D-053). It answers with a z as well as an x, so the body is
        // placed on both axes from it rather than defaulting to the room's
        // own centre line.
        const alcove = alcoveOf(mode, plan.id, plan.size);
        keeper.root.position.set(
          at.x + (alcove.x0 + alcove.x1) / 2,
          0,
          at.z + (alcove.z0 + alcove.z1) / 2,
        );
        keeper.root.rotation.y = -Math.PI / 2;
      }
    } else {
      pilot.root.visible = false;
      keeper.root.visible = false;
    }

    keeper.setTools(model.tools);
    keeper.setBusy(performance.now() < model.busyUntilMs);
    keeper.step(deltaMs, now);

    // The last ghost seen rather than this phase's, so walking back into the
    // Archive finds the recording it played rather than an empty monitor.
    if (plan?.id === "archive") paintScreen(view?.ghost ?? lastGhost, now);

    // The water, everywhere it appears, and the room's own small movements.
    // Both suppressed under reduced motion, along with everything else that
    // moves on its own.
    if (!reduceMotion) {
      kit.tideStep(now);
      stepDressing(now);
    }

    if (!reduceMotion) {
      dust.rotation.y = now / 42000;
      const flicker = 1 + Math.sin(now / 260) * 0.03 + Math.sin(now / 91) * 0.015;
      practical.intensity *= flicker;
    }

    // The caption band. Public copy only.
    if (view !== null && hasInterlude(view)) {
      const [headline, instruction] = interlude(view);
      caption.innerHTML = "";
      const head = document.createElement("p");
      head.className = "viewport-headline";
      head.textContent = headline;
      caption.append(head);
      if (instruction) {
        const under = document.createElement("p");
        under.className = "viewport-instruction";
        under.textContent = instruction;
        caption.append(under);
      }
      caption.dataset.shown = "true";
    } else {
      caption.dataset.shown = "false";
    }

    frame(shot, now);
    renderer.render(scene, camera);
    globalThis.requestAnimationFrame(tick);
  }

  resize();
  globalThis.requestAnimationFrame(tick);

  return {
    resize,
    dispose() {
      running = false;
      globalThis.removeEventListener("keydown", onKeyDown);
      globalThis.removeEventListener("keyup", onKeyUp);
      globalThis.removeEventListener("blur", onBlur);
      clearFixtures();
      keeper.dispose();
      building.clear();
      kit.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      caption.remove();
    },
  };
}

/**
 * Drifting dust, which is most of what makes a room feel like air.
 *
 * A single `Points` cloud rather than a particle system: they do not need to be
 * simulated, only to exist and turn slowly, and the whole cloud rotating about
 * the room's centre is indistinguishable from motes moving independently at
 * this size.
 */
function buildDust(kit: Kit): Points {
  const positions = new Float32Array(DUST * 3);
  for (let index = 0; index < DUST; index += 1) {
    // A deterministic scatter, so the room looks the same on every load and a
    // screenshot tour is comparable with the last one.
    const hash = (seed: number): number => {
      const n = Math.sin(index * 12.9898 + seed * 78.233) * 43758.5453;
      return n - Math.floor(n);
    };
    positions[index * 3] = (hash(1) - 0.5) * 16;
    positions[index * 3 + 1] = hash(2) * 5;
    positions[index * 3 + 2] = (hash(3) - 0.5) * 14;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  return new Points(
    geometry,
    new PointsMaterial({
      size: 0.05,
      map: kit.glow,
      color: new Color(PALETTE.pearl),
      transparent: true,
      opacity: 0.3,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
}
