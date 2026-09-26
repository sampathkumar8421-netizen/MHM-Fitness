import * as THREE from 'three';

/**
 * geometry.js — the studio's object vocabulary: plate, bar, collar, stack, ring, cable.
 *
 * Everything is built around Y as the axis of revolution and then oriented by the
 * caller, so the same plate can stand on the floor (visit), ride a bar (hero) or orbit
 * a ring (progression) without three separate builders.
 */

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

// module-scope scratch objects: the animation loop must not allocate
const _up = new THREE.Vector3(0, 1, 0);
const _from = new THREE.Vector3();
const _dir = new THREE.Vector3();

export const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/** Eased 0 → 1 with a soft start and a soft landing. */
export const easeInOut = (t) => smoothstep(0, 1, t);

/** Visibility bump: fades an act in, holds it, fades it out. */
export const bump = (local, fadeIn = 0.16, fadeOut = 0.72) =>
  smoothstep(0, fadeIn, local) * (1 - smoothstep(fadeOut, 1, local));

/**
 * The window in which an act is allowed to be seen. Chapters hand over in a shallow
 * dip — the outgoing object is gone before the camera has committed to the incoming
 * pose, so nothing is ever framed by the wrong camera.
 */
export const window_ = (local, fadeIn, fadeOut) =>
  smoothstep(fadeIn, fadeIn + 0.16, local) * (1 - smoothstep(fadeOut, fadeOut + 0.16, local));

/**
 * A 20 kg-class plate: lathed cross-section so the rim bevels and the hub catches a
 * specular line. `tilt` orients the plate, `spin` rotates it about its own axis.
 */
export function createPlate({ radius = 1, thickness = 0.22, materials, radial = 96, accent = true }) {
  const group = new THREE.Group();
  const tilt = new THREE.Group();
  const spin = new THREE.Group();
  const half = thickness * 0.5;
  const r = radius;

  const profile = [
    new THREE.Vector2(r * 0.06, half * 0.9),
    new THREE.Vector2(r * 0.42, half),
    new THREE.Vector2(r * 0.78, half * 0.97),
    new THREE.Vector2(r * 0.93, half * 0.62),
    new THREE.Vector2(r, half * 0.24),
    new THREE.Vector2(r, -half * 0.24),
    new THREE.Vector2(r * 0.93, -half * 0.62),
    new THREE.Vector2(r * 0.78, -half * 0.97),
    new THREE.Vector2(r * 0.42, -half),
    new THREE.Vector2(r * 0.06, -half * 0.9),
  ];

  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, radial), materials.graphite);
  body.castShadow = true;
  body.receiveShadow = true;
  spin.add(body);

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.17, r * 0.2, thickness * 1.16, Math.max(24, radial >> 1)),
    materials.steel,
  );
  hub.castShadow = true;
  spin.add(hub);

  // one hairline of signal colour, coiled around the rim
  if (accent) {
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(r * 0.997, r * 0.014, 8, Math.max(32, radial >> 1)),
      materials.signal,
    );
    rim.rotation.x = Math.PI / 2;
    spin.add(rim);
  }

  tilt.add(spin);
  group.add(tilt);
  return { group, tilt, spin };
}

/** A straight bar segment. Built on Y; the caller orients it. */
export function createBar({ length = 6.4, radius = 0.085, materials, radial = 32 }) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, radial, 1, false),
    materials.steel,
  );
  mesh.castShadow = true;
  return mesh;
}

/** Collar that clamps a load in place. */
export function createCollar({ radius = 0.24, height = 0.16, materials, radial = 48 }) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, radial, 1, false),
    materials.steel,
  );
  mesh.castShadow = true;
  return mesh;
}

/** Machine stack plate — square, matte, deliberately unglamorous. */
export function createStackPlate({ width = 1.05, height = 0.1, depth = 0.6, materials }) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials.graphite);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Torus with an animated arc — the progression ring draws itself as you scroll.
 * Rebuilds only when the arc has visibly moved, so a still page allocates nothing.
 */
export function createArcRing({ radius, tube, material, segments = 160, radial = 10 }) {
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, radial, segments, 0.001),
    material,
  );
  mesh.castShadow = true;

  return {
    mesh,
    /** @param {number} arc radians drawn, 0 → Math.PI * 2 */
    setArc(arc) {
      const next = Math.max(0.001, arc);
      if (Math.abs(next - mesh.geometry.parameters.arc) < 0.008) return;
      mesh.geometry.dispose();
      mesh.geometry = new THREE.TorusGeometry(radius, tube, radial, segments, next);
    },
  };
}

/**
 * Stretch a unit-height cylinder between two points. The cable is rewired every
 * frame, so this writes into existing objects rather than allocating.
 */
export function stretchCylinder(mesh, from, to) {
  _dir.subVectors(to, from);
  const length = _dir.length() || 0.0001;
  _from.copy(from).addScaledVector(_dir, 0.5);
  mesh.position.copy(_from);
  mesh.quaternion.setFromUnitVectors(_up, _dir.divideScalar(length));
  mesh.scale.set(1, length, 1);
}

/**
 * A tube that can be driven between two shapes at build-time cost only: both vertex
 * sets are baked once, then interpolated per frame — no geometry rebuild, no garbage.
 */
export function createMorphTube({
  fromCurve,
  toCurve,
  tubeRadius = 0.03,
  tubular = 64,
  radial = 8,
  material,
}) {
  const startGeometry = new THREE.TubeGeometry(fromCurve, tubular, tubeRadius, radial, false);
  const endGeometry = new THREE.TubeGeometry(toCurve, tubular, tubeRadius, radial, false);

  const start = startGeometry.attributes.position.array.slice();
  const end = endGeometry.attributes.position.array.slice();
  endGeometry.dispose();

  const attribute = startGeometry.attributes.position;
  const mesh = new THREE.Mesh(startGeometry, material);
  mesh.castShadow = true;
  let lastT = -1;

  return {
    mesh,
    /** @param {number} t 0 = slack, 1 = taut */
    setT(t) {
      const value = clamp(t);
      if (Math.abs(value - lastT) < 0.001) return;
      lastT = value;
      for (let i = 0; i < attribute.array.length; i += 1) {
        attribute.array[i] = start[i] + (end[i] - start[i]) * value;
      }
      attribute.needsUpdate = true;
      startGeometry.computeVertexNormals();
    },
  };
}

/** Small sphere marker (ring head, pulley pin). */
export function createMarker({ radius = 0.08, material, segments = 20 }) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, segments, Math.max(8, segments >> 1)),
    material,
  );
  mesh.castShadow = true;
  return mesh;
}
