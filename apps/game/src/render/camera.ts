/**
 * Where the camera stands, decided without a camera.
 *
 * Framing is the whole of the composition in a lit 3D scene, so it is the last
 * thing that should be worked out inside a render loop where nothing can check
 * it. This module returns a position, a target and a field of view; `stage.ts`
 * moves an actual camera to them and does no arithmetic of its own.
 *
 * ## The one rule the whole look rests on
 *
 * **Every room is open at the top and open on its south face, and the camera
 * always stands to the south.** The station is a cutaway model on a dark table,
 * and the pair are figures inside it.
 *
 * That is not a compromise made to see past a wall. It is the same idea D-031
 * reached for when it drew the station as a side-on section, arrived at again
 * with a camera instead of a tile grid: a station you are looking *into* is a
 * station whose rooms are obviously separate places, which is the thing the
 * fiction needs most. Two operators who never occupy the same room read very
 * differently when you can see both rooms at once.
 *
 * Holding the camera south also makes every other decision cheap. No wall ever
 * needs hiding, no room needs a special case, the shadows all fall the same
 * way, and the wide shot is the same scene from further back rather than a
 * second way of drawing the building.
 *
 * ## Two shots
 *
 * **The room shot** frames one chamber, close enough that a lever is a lever.
 * **The wide shot** frames the whole station from high south, which is the only
 * view in which it is a building rather than a room, and it is the human's
 * alone: PILOT holds `M` and steps back, and there is no tool that lets KEEPER
 * do the same.
 */

import type { SessionMode } from "@semaphore/protocol";
import type { RoomSize, Vec3 } from "./chamber.js";
import { centreOf, centreOfStation, footprintOf, stationBounds } from "./plan.js";
import type { FloorId } from "./floors.js";

/** Where the camera is, what it looks at, and how wide the lens is. */
export interface Shot {
  /** The camera's position, in station metres. */
  readonly eye: Vec3;
  /** The point it looks at, in station metres. */
  readonly target: Vec3;
  /** Vertical field of view, in degrees. */
  readonly fov: number;
  /** The floor this shot is framed on, or null for the wide shot. */
  readonly floor: FloorId | null;
}

/**
 * The room lens, in degrees of vertical field of view.
 *
 * Long rather than wide. Thirty-two degrees is roughly a 65mm lens on full
 * frame: it compresses depth, keeps the walls near-parallel instead of raking
 * away, and makes a small room read as a considered composition rather than as
 * a first-person view. Wide lenses are what make 3D look like an engine demo.
 */
export const ROOM_FOV = 32;

/**
 * The wide lens.
 *
 * Wider than the room shot, because the building has to fit and because the
 * slight rake it puts on the far rooms is what makes the station read as a
 * model on a table rather than as a flat map.
 */
export const WIDE_FOV = 38;

/** How far the room camera is tilted down from horizontal, in radians. */
const ROOM_PITCH = 0.5;

/**
 * How far the room camera is swung off dead centre, in radians.
 *
 * A little, deliberately. Dead-on is symmetrical and lifeless; too much and the
 * bank of six keys stops being a bank of six and starts being a perspective
 * puzzle, which is a puzzle the game did not ask for.
 */
const ROOM_YAW = 0.16;

/** How far the wide camera is tilted down. Steep, so the plan is readable. */
const WIDE_PITCH = 0.95;

/** Breathing room around whatever a shot frames. */
const MARGIN = 1.12;

/**
 * How far back a camera must stand to fit a sphere of `radius`.
 *
 * Fits against whichever of the two fields of view is narrower, so a tall thin
 * window frames the same thing as a wide one rather than cropping it.
 *
 * Used for the wide shot, where the building genuinely is roughly round on the
 * floor plane. It is the wrong tool for a room, and the first tour showed why:
 * a sphere around a 13 by 13 by 7 metre chamber is mostly empty air above it,
 * so fitting the sphere frames a small room in the middle of a large dark
 * rectangle. `fitBox` is what rooms use.
 */
export function distanceFor(radius: number, fovDeg: number, aspect: number): number {
  const vertical = (fovDeg * Math.PI) / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * Math.max(aspect, 0.001));
  return (radius * MARGIN) / Math.sin(Math.min(vertical, horizontal) / 2);
}

/** The unit vector from a target toward the camera: south, and above. */
function offsetUnit(pitch: number, yaw: number): Vec3 {
  const flat = Math.cos(pitch);
  return { x: flat * Math.sin(yaw), y: Math.sin(pitch), z: flat * Math.cos(yaw) };
}

/** Place a camera on a sphere around `target`, to its south and above it. */
function orbit(target: Vec3, distance: number, pitch: number, yaw: number): Vec3 {
  const unit = offsetUnit(pitch, yaw);
  return {
    x: target.x + unit.x * distance,
    y: target.y + unit.y * distance,
    z: target.z + unit.z * distance,
  };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function unit(v: Vec3): Vec3 {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

/**
 * How far back a camera must stand for every corner of a box to be in frame.
 *
 * The exact solve rather than a bounding sphere, because a room is not
 * remotely round: seen from thirty degrees up, a wide shallow chamber occupies
 * far less of the frame vertically than horizontally, and fitting the sphere
 * that contains it wastes most of the picture.
 *
 * Each corner is decomposed into the camera's own basis. A point at camera
 * depth `d + forward` is inside the frustum when its sideways offset is within
 * `tan(fov/2)` of that depth, so the distance each corner demands is a
 * subtraction, and the answer is the largest of them.
 */
export function fitBox(
  target: Vec3,
  half: Vec3,
  centre: Vec3,
  fovDeg: number,
  aspect: number,
  pitch: number,
  yaw: number,
): number {
  const vertical = (fovDeg * Math.PI) / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * Math.max(aspect, 0.001));
  const tanV = Math.tan(vertical / 2);
  const tanH = Math.tan(horizontal / 2);

  // The camera basis. `forward` points from the camera at the target, so the
  // offset unit vector reversed.
  const away = offsetUnit(pitch, yaw);
  const forward: Vec3 = { x: -away.x, y: -away.y, z: -away.z };
  const right = unit(cross(forward, { x: 0, y: 1, z: 0 }));
  const up = cross(right, forward);

  let needed = 0;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const corner: Vec3 = {
          x: centre.x + sx * half.x - target.x,
          y: centre.y + sy * half.y - target.y,
          z: centre.z + sz * half.z - target.z,
        };
        const depth = dot(corner, forward);
        needed = Math.max(
          needed,
          Math.abs(dot(corner, right)) / tanH - depth,
          Math.abs(dot(corner, up)) / tanV - depth,
        );
      }
    }
  }
  return needed * MARGIN;
}

/**
 * How far the room shot's aim slides toward PILOT, as a fraction of the offset.
 *
 * A little, and never all the way. Tracking PILOT exactly turns the camera into
 * a chase cam and throws away the composition the room was staged for; not
 * tracking at all is what made walking feel like it moved a token rather than a
 * person. A third is enough that crossing the room visibly re-frames it.
 */
const FOLLOW = 0.34;

/**
 * How far the lean-in camera is tilted down.
 *
 * Shallower than the room shot: this is how you look at something you are
 * holding a lamp up to, roughly level with it rather than down onto it.
 */
const INSPECT_PITCH = 0.34;

/**
 * The shot that leans in on one fixture.
 *
 * PILOT holding a key near a mechanism. It is the only camera move the human
 * drives, and it exists because a glyph at room distance is a shape you can see
 * and not a shape you can *describe*: the whole job is getting a detail across
 * in words, so being able to go and study it is the job's other half.
 *
 * The framing is deliberately tight and slightly above, which is how you look
 * at something you are holding a lamp up to.
 */
export function inspectShot(
  at: Vec3,
  aspect: number,
  /**
   * The room the fixture is in, so the camera cannot leave it.
   *
   * Without it the lean-in stands wherever the fit puts it, which for anything
   * against the back or side wall is *outside the building*: the shot ends up
   * behind masonry that was never built to be seen from behind, and the room
   * turns inside out. That is not a rare case, it is most of the fixtures in
   * the game, because most of them are on a wall.
   */
  room?: { readonly centre: { x: number; z: number }; readonly size: RoomSize },
): Shot {
  const target: Vec3 = { x: at.x, y: at.y + 0.9, z: at.z };
  const distance = fitBox(
    target,
    { x: 1.5, y: 1.5, z: 1.5 },
    { x: at.x, y: at.y + 0.9, z: at.z },
    ROOM_FOV,
    aspect,
    INSPECT_PITCH,
    ROOM_YAW,
  );
  const eye = orbit(target, distance, INSPECT_PITCH, ROOM_YAW);
  if (room === undefined) return { eye, target, fov: ROOM_FOV, floor: null };

  // Held inside the room's own box, with a margin off each wall. The camera
  // may come no closer to a wall than it would let a body stand.
  const inset = 0.8;
  const minX = room.centre.x - room.size.width / 2 + inset;
  const maxX = room.centre.x + room.size.width / 2 - inset;
  const minZ = room.centre.z - room.size.depth / 2 + inset;
  const maxZ = room.centre.z + room.size.depth / 2 - inset;
  return {
    eye: {
      x: Math.min(Math.max(eye.x, minX), maxX),
      y: Math.min(eye.y, room.size.height - 0.4),
      z: Math.min(Math.max(eye.z, minZ), maxZ),
    },
    target,
    fov: ROOM_FOV,
    floor: null,
  };
}

/**
 * The shot that frames one room.
 *
 * The target is not the room's centre. It sits a little above the floor and a
 * little behind the middle, because a room's contents are on its back wall and
 * its floor is mostly empty: aiming at the geometric centre puts the mechanism
 * in the top third of the frame and a lot of nothing under it.
 */
export function roomShot(
  centre: { x: number; z: number },
  floor: FloorId,
  aspect: number,
  /** Where PILOT is standing, so the shot can lean toward them. */
  follow?: { x: number; z: number },
): Shot {
  const size = footprintOf(floor);
  const drift = follow ? (follow.x - centre.x) * FOLLOW : 0;
  const target: Vec3 = {
    x: centre.x + drift,
    y: size.height * 0.34,
    z: centre.z - size.depth * 0.12,
  };
  // The room's own box, fitted corner by corner. A bounding sphere would frame
  // the empty air above a tall chamber as though it were part of the room.
  const distance = fitBox(
    target,
    { x: size.width / 2, y: size.height / 2, z: size.depth / 2 },
    { x: centre.x, y: size.height / 2, z: centre.z },
    ROOM_FOV,
    aspect,
    ROOM_PITCH,
    ROOM_YAW,
  );
  // The room still has to fit whichever way the aim has drifted, so the fit is
  // solved against the room's real centre and the drift is added afterwards.
  return {
    eye: orbit(target, distance, ROOM_PITCH, ROOM_YAW),
    target,
    fov: ROOM_FOV,
    floor,
  };
}

/** The shot that frames the whole building. */
export function wideShot(mode: SessionMode, aspect: number): Shot {
  const bounds = stationBounds(mode);
  const centre = centreOfStation(mode);
  const target: Vec3 = { x: centre.x, y: 0, z: centre.z };
  const radius = Math.hypot(bounds.width, bounds.depth) / 2;
  return {
    eye: orbit(target, distanceFor(radius, WIDE_FOV, aspect), WIDE_PITCH, 0),
    target,
    fov: WIDE_FOV,
    floor: null,
  };
}

/**
 * Where the camera should be, for a mode, a phase, a floor, and whether the
 * wide shot has been asked for.
 *
 * **`wide` is a parameter rather than a phase because the phase that ought to
 * have driven it does not exist.** `TRANSITIONING` looks like the moment to
 * pull back, and it is handled below, but the worker settles it inside the same
 * `reduce()` call that solved the chamber (doc 05 section 4, `settleTransition`)
 * so it never reaches a client as a frame. A camera keyed on it alone would be
 * a beat that can never fire. It stays in the list because it is the right
 * answer if the machine ever does park there, and the caller supplies the walk
 * between rooms and the map key it actually has.
 */
export function shotFor(
  mode: SessionMode,
  phase: string,
  floor: FloorId | null,
  wide: boolean,
  aspect: number,
  follow?: { x: number; z: number },
): Shot {
  if (wide || floor === null) return wideShot(mode, aspect);
  if (phase === "TRANSITIONING") return wideShot(mode, aspect);
  const centre = centreOf(mode, floor);
  if (centre === null) return wideShot(mode, aspect);
  return roomShot(centre, floor, aspect, follow);
}

/**
 * How long the camera takes to move between two shots, in milliseconds.
 *
 * Long enough to read as travelling rather than cutting, short enough that a
 * pair under a chamber clock is never waiting on a camera.
 */
export const SHOT_MS = 800;

/**
 * How tall a caption should be on screen, as a fraction of the viewport.
 *
 * Captions used to be a fixed height in **metres**, which means their size on
 * screen is whatever the camera happens to be doing. Sized to read at the
 * twenty-five metres a room shot stands at, the same caption at the six metres
 * the lean-in stands at is four times too big: "PAGE MARKED" filled a third of
 * the frame and washed across the door it was labelling.
 *
 * A constant fraction of the viewport is the only setting that is right at both
 * distances, and it is also the answer to captions being hard to read in the
 * first place: legibility stops being a function of where the camera is.
 */
export const CAPTION_SCREEN = 0.032;

/**
 * The smallest and largest a caption may get, in world metres.
 *
 * The floor is low enough that it never binds at the six metres the lean-in
 * stands at, which is the closest the camera ever gets: it is there for a
 * degenerate camera, not as a second opinion about legibility.
 */
const CAPTION_MIN = 0.08;
const CAPTION_MAX = 0.9;

/**
 * How tall a caption must be in metres to occupy `CAPTION_SCREEN` of the frame.
 *
 * An object of height `h` at distance `d` subtends `h / (2 d tan(fov/2))` of
 * the viewport, so this is that solved for `h`, then clamped so the wide shot
 * cannot turn a caption into a billboard laid across the station.
 */
export function captionHeight(distance: number, fovDegrees: number): number {
  const wanted = CAPTION_SCREEN * 2 * distance * Math.tan((fovDegrees * Math.PI) / 360);
  return Math.min(CAPTION_MAX, Math.max(CAPTION_MIN, wanted));
}

/**
 * How long the camera holds the whole building when the pair changes room.
 *
 * The walk between chambers. It is timed rather than driven by a phase for the
 * reason `shotFor` gives: the phase that would have driven it never arrives.
 * The pair's room changing is the same event and it is one the client can
 * actually see.
 */
export const WALK_MS = 1600;

/**
 * How far the camera drifts as it idles, in metres, and how long a cycle takes.
 *
 * A still camera in a still room reads as a paused game. This is small enough
 * that nobody consciously notices it and large enough that the frame is alive.
 * It is suppressed entirely under `prefers-reduced-motion`, where a moving
 * camera is not atmosphere but a problem.
 */
export const DRIFT_METRES = 0.22;
export const DRIFT_PERIOD_MS = 14_000;
