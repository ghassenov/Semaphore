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
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import type { PilotView, SessionMode } from "@semaphore/protocol";
import {
  ARCHIVE_SCREEN,
  interlude,
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
  stationStrips,
} from "./plan.js";
import { activeFloor, stationFloors, type FloorId } from "./floors.js";
import { ghostFrame } from "./ghost.js";
import { FixtureView } from "./fixtures.js";
import { KeeperBody, buildPilot } from "./keeper.js";
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

/** What `station.ts` holds once the stage is up. */
export interface StageHandle {
  /** Re-read the viewport's size. Called by a `ResizeObserver`. */
  resize(): void;
  dispose(): void;
}

/** Bring the station up inside `parent`, reading `model` every frame. */
export function createStage(parent: HTMLElement, model: StationModel): StageHandle {
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

  // ---- The building, built once per mode. --------------------------------
  const building = new Group();
  scene.add(building);
  let built: SessionMode | null = null;
  const roomHalos = new Map<FloorId, ReturnType<Kit["halo"]>>();

  function buildStation(mode: SessionMode): void {
    if (built === mode) return;
    built = mode;
    building.clear();
    roomHalos.clear();

    // Floor slabs: one box per strip, rather than one per grid cell. A slab is
    // flat and a grid of slabs is the same flat thing with a thousand more
    // draw calls in it.
    for (const strip of stationStrips(mode)) {
      const slab = new Mesh(new BoxGeometry(strip.width, SLAB, strip.depth), kit.floor);
      slab.position.set(strip.x, -SLAB / 2, strip.z);
      slab.receiveShadow = true;
      building.add(slab);
    }

    // Walls: resolved from the floor in one pass, so junctions are openings.
    const cells = stationCells(mode);
    const blocks: { x: number; z: number; height: number }[] = [];
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
        blocks.push({ x, z, height: Math.max(...neighbours) });
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
    wall.instanceMatrix.needsUpdate = true;
    building.add(wall);

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
  scene.add(roomGroup);
  const fixtures = new Map<string, FixtureView>();
  let fixtureRoom: FloorId | null = null;

  /** Water, for the Airlock's escalation. It has no mechanical effect ever. */
  const waterMaterial = new MeshStandardMaterial({
    color: PALETTE.glass,
    roughness: 0.08,
    metalness: 0.65,
    transparent: true,
    opacity: 0.62,
  });
  const water = new Mesh(new PlaneGeometry(1, 1), waterMaterial);
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
  let walk = 0.35;
  let walkZ = 0.7;

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

  const held = new Set<string>();
  const onKeyDown = (event: KeyboardEvent): void => {
    held.add(event.key.toLowerCase());
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    held.delete(event.key.toLowerCase());
  };
  globalThis.addEventListener("keydown", onKeyDown);
  globalThis.addEventListener("keyup", onKeyUp);

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
    fixtureRoom = null;
  }

  /** Put the room's floor-wide effects where the room is. */
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
  function paintScreen(view: PilotView, elapsedMs: number): void {
    const track = view.ghost;
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

  let last = performance.now();
  let running = true;

  function tick(now: number): void {
    if (!running) return;
    const deltaMs = Math.min(64, now - last);
    last = now;

    const view = model.view;
    const mode: SessionMode = view?.mode ?? "full";
    buildStation(mode);

    const floor = view === null ? null : activeFloor(view);
    const plan = view === null ? null : roomPlan(view);

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

    const standing = floor === null ? null : placementOf(mode, floor);
    if (standing !== null && plan !== null) {
      const span = plan.size.width * WALK_SPAN;
      const depth = plan.size.depth * WALK_SPAN_Z;
      pilotAt = {
        x: standing.x - span / 2 + walk * span,
        z: standing.z - depth / 2 + walkZ * depth,
      };
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

    let shot: Shot;
    if (leaning !== null && standing !== null) {
      shot = inspectShot(
        {
          x: standing.x + leaning.at.x,
          y: leaning.at.y,
          z: standing.z + leaning.at.z,
        },
        aspect(),
      );
    } else {
      shot = shotFor(mode, view?.phase ?? "ENTRY", floor, asked, aspect(), pilotAt);
    }
    const wide = shot.floor === null && leaning === null;

    // The wide shot is a model on a table and needs to be lit like one. In a
    // room the ambient is kept low on purpose, so that the practical and the
    // emissive facts do the work; pulled back, that same ambient leaves four
    // of the five rooms as black boxes with a smudge in them, which is what
    // the first wide-shot probe came back as.
    sky.intensity = wide ? 2.4 : 0.42;
    moon.intensity = wide ? 2.1 : 0.75;

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

    // The room's own practical, and the moon's shadow frustum, follow the pair.
    if (floor !== null && plan !== null) {
      const at = placementOf(mode, floor);
      if (at) {
        const tones = CHANNEL[plan.accent];
        practical.color.setHex(tones.key);
        // Scaled to the room's floor area rather than flat. One number for a
        // 56 square metre Archive and a 168 square metre Concord Lock lit the
        // first as a showroom and the second barely at all.
        practical.intensity = 26 + plan.size.width * plan.size.depth * 0.5;
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
        // KEEPER stands in the east wall of whichever room the pair is in. It
        // is not *in* the room: it is behind the station's panels, reaching
        // into every cavity at once. They can see each other and reach each
        // other nowhere.
        keeper.root.visible = true;
        keeper.root.position.set(at.x + plan.size.width / 2 - 0.4, 0, at.z);
        keeper.root.rotation.y = -Math.PI / 2;
      }
    } else {
      pilot.root.visible = false;
      keeper.root.visible = false;
    }

    keeper.setTools(model.tools);
    keeper.setBusy(performance.now() < model.busyUntilMs);
    keeper.step(deltaMs, now);

    if (view !== null && plan?.id === "archive") paintScreen(view, now);

    if (!reduceMotion) {
      dust.rotation.y = now / 42000;
      const flicker = 1 + Math.sin(now / 260) * 0.03 + Math.sin(now / 91) * 0.015;
      practical.intensity *= flicker;
    }

    // The caption band. Public copy only.
    if (view !== null && plan === null) {
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
