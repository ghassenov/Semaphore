/**
 * Framing, proved without a camera.
 *
 * Composition is the whole of the look in a lit scene, and it fails quietly: a
 * shot that crops the top of the Concord Lock renders perfectly and simply
 * looks like somebody chose that. So the two things worth asserting are that
 * everything a shot has to show is inside it, at any window shape, and that the
 * cutaway rule holds - because the moment the camera drifts north of a room,
 * the wall the renderer deliberately did not build becomes a hole in the world.
 */

import { describe, expect, it } from "vitest";
import type { SessionMode } from "@semaphore/protocol";
import { ROOM_FOV, WIDE_FOV, distanceFor, roomShot, shotFor, wideShot } from "./camera.js";
import { centreOf, floorsOf, footprintOf, stationBounds } from "./plan.js";

const MODES: readonly SessionMode[] = ["full", "brief"];

/** Window shapes the game has to survive: wide, square, and a tall phone. */
const ASPECTS = [2.2, 1.6, 1, 0.62];

/** The half-angle of the narrower of a shot's two fields of view. */
function halfAngle(fovDeg: number, aspect: number): number {
  const vertical = (fovDeg * Math.PI) / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
  return Math.min(vertical, horizontal) / 2;
}

/**
 * Whether a world point is inside a shot's frustum.
 *
 * The camera basis rebuilt from the shot itself rather than from the pitch and
 * yaw constants, so this checks the shot that will actually be used rather than
 * re-deriving the one the module meant to produce.
 */
function inFrame(
  shot: {
    eye: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
    fov: number;
  },
  point: { x: number; y: number; z: number },
  aspect: number,
): boolean {
  const norm = (v: { x: number; y: number; z: number }) => {
    const length = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / length, y: v.y / length, z: v.z / length };
  };
  const cross = (
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number },
  ) => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  });
  const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
    a.x * b.x + a.y * b.y + a.z * b.z;

  const forward = norm({
    x: shot.target.x - shot.eye.x,
    y: shot.target.y - shot.eye.y,
    z: shot.target.z - shot.eye.z,
  });
  const right = norm(cross(forward, { x: 0, y: 1, z: 0 }));
  const up = cross(right, forward);
  const view = { x: point.x - shot.eye.x, y: point.y - shot.eye.y, z: point.z - shot.eye.z };

  const depth = dot(view, forward);
  if (depth <= 0) return false;
  const vertical = (shot.fov * Math.PI) / 180;
  const tanV = Math.tan(vertical / 2);
  const tanH = Math.tan((2 * Math.atan(tanV * aspect)) / 2);
  // A hair of tolerance, because the fit itself is computed in the same
  // arithmetic and an exact-equality corner would fail on the last bit.
  const slack = 1 + 1e-9;
  return (
    Math.abs(dot(view, right)) <= tanH * depth * slack &&
    Math.abs(dot(view, up)) <= tanV * depth * slack
  );
}

describe("fitting a shot to the window", () => {
  it("stands further back for a window narrower than it is tall", () => {
    // The whole of the responsive behaviour. A tall phone sees less across, so
    // the camera has to retreat or the room is cropped left and right.
    //
    // Above square the distance is flat, and that is correct rather than a
    // missing case: once the window is wider than it is tall the *vertical*
    // field is the binding one, and widening the window further adds room to
    // the sides that the shot was not using.
    const wide = distanceFor(10, ROOM_FOV, 2.2);
    const square = distanceFor(10, ROOM_FOV, 1);
    const tall = distanceFor(10, ROOM_FOV, 0.62);
    expect(square).toBeCloseTo(wide);
    expect(tall).toBeGreaterThan(square);
  });

  it("stands back far enough for the sphere it is fitting", () => {
    for (const aspect of ASPECTS) {
      const radius = 7;
      const distance = distanceFor(radius, ROOM_FOV, aspect);
      // The sphere subtends at most the narrower field of view, with margin.
      expect(Math.asin(radius / distance)).toBeLessThanOrEqual(halfAngle(ROOM_FOV, aspect));
    }
  });

  it("scales with the thing it frames", () => {
    expect(distanceFor(20, ROOM_FOV, 1.6)).toBeCloseTo(distanceFor(10, ROOM_FOV, 1.6) * 2);
  });
});

describe("the room shot", () => {
  it.each(MODES)("%s keeps the camera south of and above every room", (mode) => {
    // The cutaway rule. Every room is open at the top and open on its south
    // face, so the camera may never leave the south side: the instant it does,
    // the wall that was deliberately not built becomes a hole in the building.
    for (const floor of floorsOf(mode)) {
      const centre = centreOf(mode, floor);
      if (centre === null) continue;
      for (const aspect of ASPECTS) {
        const shot = roomShot(centre, floor, aspect);
        expect(shot.eye.z, `${floor} camera is not south of the room`).toBeGreaterThan(
          shot.target.z,
        );
        expect(shot.eye.y, `${floor} camera is not above the room`).toBeGreaterThan(shot.target.y);
      }
    }
  });

  it.each(MODES)("%s frames every room whole, at any window shape", (mode) => {
    // The corners of the room's own box, not a sphere around it. A sphere is a
    // weaker claim and the wrong one: the shot fits the box deliberately, and
    // for a wide shallow chamber the sphere that contains it sticks out of the
    // frame by design, because the parts of it that do are empty air.
    for (const floor of floorsOf(mode)) {
      const centre = centreOf(mode, floor);
      if (centre === null) continue;
      const size = footprintOf(floor);
      for (const aspect of ASPECTS) {
        const shot = roomShot(centre, floor, aspect);
        for (const sx of [-1, 1]) {
          for (const sy of [0, 1]) {
            for (const sz of [-1, 1]) {
              const corner = {
                x: centre.x + (sx * size.width) / 2,
                y: sy * size.height,
                z: centre.z + (sz * size.depth) / 2,
              };
              expect(
                inFrame(shot, corner, aspect),
                `${floor} loses a corner at aspect ${String(aspect)}`,
              ).toBe(true);
            }
          }
        }
      }
    }
  });

  it("stands closer to a wide shallow room than a sphere fit would", () => {
    // The Blind Panel is fifteen metres across and seven deep. A bounding
    // sphere around it has a radius of eight and a half, most of which is the
    // empty air over the gauges; fitting that put the camera far enough back
    // that the room read as a diorama on a shelf. The box fit is what brought
    // it in.
    const centre = centreOf("full", "blind_panel");
    if (centre === null) throw new Error("the full station has a Blind Panel");
    const size = footprintOf("blind_panel");
    const shot = roomShot(centre, "blind_panel", 1.6);
    const distance = Math.hypot(
      shot.eye.x - shot.target.x,
      shot.eye.y - shot.target.y,
      shot.eye.z - shot.target.z,
    );
    const sphere = distanceFor(Math.hypot(size.width, size.depth, size.height) / 2, ROOM_FOV, 1.6);
    expect(distance).toBeLessThan(sphere);
  });

  it("aims below the middle of the room, where the mechanism is", () => {
    // A room's contents are on its back wall and its floor is mostly empty, so
    // aiming at the geometric centre puts the mechanism in the top third of the
    // frame with a lot of nothing under it.
    const centre = centreOf("full", "concord_lock");
    if (centre === null) throw new Error("the full station has a Concord Lock");
    const shot = roomShot(centre, "concord_lock", 1.6);
    expect(shot.target.y).toBeLessThan(footprintOf("concord_lock").height / 2);
    expect(shot.target.y).toBeGreaterThan(0);
  });
});

describe("the wide shot", () => {
  it.each(MODES)("%s fits the whole building", (mode) => {
    const bounds = stationBounds(mode);
    const radius = Math.hypot(bounds.width, bounds.depth) / 2;
    for (const aspect of ASPECTS) {
      const shot = wideShot(mode, aspect);
      const distance = Math.hypot(
        shot.eye.x - shot.target.x,
        shot.eye.y - shot.target.y,
        shot.eye.z - shot.target.z,
      );
      expect(
        Math.asin(Math.min(1, radius / distance)),
        `${mode} does not fit at aspect ${String(aspect)}`,
      ).toBeLessThanOrEqual(halfAngle(WIDE_FOV, aspect) + 1e-6);
    }
  });

  it("is the shot with no floor, which is how the caller knows it is wide", () => {
    expect(wideShot("full", 1.6).floor).toBeNull();
    expect(roomShot({ x: 0, z: 0 }, "airlock", 1.6).floor).toBe("airlock");
  });
});

describe("choosing a shot", () => {
  it("pulls back when asked, wherever the pair is standing", () => {
    expect(shotFor("full", "IN_CHAMBER", "airlock", true, 1.6).floor).toBeNull();
  });

  it("pulls back when there is no room to be in", () => {
    expect(shotFor("full", "FINALE", null, false, 1.6).floor).toBeNull();
    expect(shotFor("full", "TRANSITIONING", "airlock", false, 1.6).floor).toBeNull();
  });

  it("pulls back rather than framing a room this mode does not have", () => {
    // A BRIEF session has no Blind Panel. Framing one would point the camera at
    // empty ground and leave the player looking at nothing, with no cue that
    // anything is wrong.
    expect(shotFor("brief", "IN_CHAMBER", "blind_panel", false, 1.6).floor).toBeNull();
  });

  it("frames the room otherwise", () => {
    expect(shotFor("full", "IN_CHAMBER", "signal_room", false, 1.6).floor).toBe("signal_room");
  });
});
