import * as THREE from 'three';
import { cloneMaterials, setGroupOpacity } from './materials.js';
import {
  clamp,
  easeInOut,
  smoothstep,
  window_,
  createArcRing,
  createBar,
  createCollar,
  createMarker,
  createPlate,
  createStackPlate,
  stretchCylinder,
} from './geometry.js';
import { FLOOR_Y } from './stage.js';

/**
 * acts.js — four chapters of one continuous 3D film.
 *
 * The DOM scrolls; the camera and the objects answer it. Chapter-local progress is
 * eased, so the load always starts moving softly and lands softly — the difference
 * between "scroll-linked" and "scroll-driven".
 */

/** Four plates a side, on a 20 kg bar. The bar rests on the floor at rest. */
const PLATE_OFFSETS = [1.72, 1.98, 2.24, 2.5];
const BAR_REST = FLOOR_Y + 1.0;

/** Camera keyframes, one per chapter, blended by act weight — never cut. */
const POSES = {
  hero: { pos: [0.0, 1.1, 7.1], target: [-0.55, -0.05, 0] },
  progression: { pos: [0.1, 1.2, 5.0], target: [-1.0, 0.15, 0] },
  pull: { pos: [-0.5, 1.05, 6.2], target: [-1.5, 0.35, 0] },
  visit: { pos: [0.0, 1.05, 5.7], target: [-0.25, -0.1, 0] },
};

/** Narrow screens: object centred, pushed up the frame, camera pulled back. */
const POSES_NARROW = {
  hero: { pos: [0.0, 1.0, 7.9], target: [0.0, -0.95, 0] },
  progression: { pos: [0.0, 1.15, 6.4], target: [0.0, -1.0, 0] },
  pull: { pos: [0.0, 0.95, 7.4], target: [0.0, -0.9, 0] },
  visit: { pos: [0.0, 1.0, 6.6], target: [0.0, -1.0, 0] },
};

/**
 * Act 00 — the load. Plates walk outward along the bar as the bar leaves the floor.
 */
function buildHero(materials, quality) {
  const mats = cloneMaterials(materials);
  const content = new THREE.Group();
  const frame = new THREE.Group();
  frame.add(content);

  const bar = createBar({ length: 6.6, radius: 0.085, materials: mats });
  bar.rotation.z = Math.PI / 2; // bar runs along X
  content.add(bar);

  const plates = [];
  PLATE_OFFSETS.forEach((offset, index) => {
    for (const side of [-1, 1]) {
      const plate = createPlate({
        radius: 1,
        thickness: 0.22,
        materials: mats,
        radial: quality.radial,
        accent: index === 0,
      });
      plate.tilt.rotation.z = Math.PI / 2; // stand the plate up: axis on the bar
      plate.group.position.x = side * offset;
      plate.group.userData = { side, index };
      content.add(plate.group);
      plates.push(plate);
    }
  });

  for (const side of [-1, 1]) {
    const collar = createCollar({ radius: 0.26, height: 0.18, materials: mats });
    collar.rotation.z = Math.PI / 2;
    collar.position.x = side * 2.8;
    content.add(collar);
  }

  content.position.y = BAR_REST;
  content.rotation.z = 0.04;

  return {
    frame,
    content,
    weight: (local) => 1 - smoothstep(0.5, 0.72, local),
    cameraWeight: (local) => 1 - smoothstep(0.45, 0.95, local),
    update(local) {
      const t = easeInOut(clamp(local * 1.4));
      content.position.y = BAR_REST + t * 0.9;
      content.rotation.y = -0.2 + t * 0.42;
      content.rotation.z = 0.04 - t * 0.075;

      for (const plate of plates) {
        const { side, index } = plate.group.userData;
        const spread = t * (0.1 + index * 0.34);
        plate.group.position.x = side * (PLATE_OFFSETS[index] + spread);
        plate.spin.rotation.y = t * 0.5 * (index % 2 === 0 ? 1 : -1);
      }
    },
  };
}

/**
 * Act 02 — progression. A ring that draws itself: one training block, one rotation,
 * with the selected loads orbiting it.
 */
function buildProgression(materials, quality) {
  const mats = cloneMaterials(materials);
  const content = new THREE.Group();
  const frame = new THREE.Group();
  frame.add(content);

  const base = createArcRing({
    radius: 1.5,
    tube: 0.015,
    material: mats.graphite,
    segments: 160,
    radial: 8,
  });
  base.setArc(Math.PI * 2);
  content.add(base.mesh);

  const progress = createArcRing({
    radius: 1.28,
    tube: 0.052,
    material: mats.signal,
    segments: 220,
    radial: 12,
  });
  progress.mesh.rotation.z = Math.PI / 2; // the block starts at twelve o'clock
  content.add(progress.mesh);

  const head = createMarker({ radius: 0.075, material: mats.signal });
  content.add(head);

  const satellites = [];
  for (let i = 0; i < 3; i += 1) {
    const plate = createPlate({
      radius: 0.3,
      thickness: 0.12,
      materials: mats,
      radial: Math.max(32, quality.radial >> 1),
      accent: i === 1,
    });
    plate.tilt.rotation.x = Math.PI / 2; // face the camera, like the ring
    satellites.push(plate);
    content.add(plate.group);
  }

  return {
    frame,
    content,
    weight: (local) => window_(local, 0.26, 0.58),
    cameraWeight: (local) => smoothstep(0.02, 0.3, local),
    update(local) {
      const t = easeInOut(local);
      const arc = t * Math.PI * 2;
      progress.setArc(arc);

      const angle = Math.PI / 2 + arc;
      head.position.set(Math.cos(angle) * 1.28, Math.sin(angle) * 1.28, 0);
      head.scale.setScalar(0.8 + t * 0.4);

      content.rotation.z = -0.05 + t * 0.1;
      content.rotation.y = -0.34 + t * 0.24;
      content.position.y = 0.1 + Math.sin(t * Math.PI) * 0.26;

      satellites.forEach((plate, i) => {
        const theta = t * 3.4 + (i * Math.PI * 2) / 3;
        plate.group.position.set(
          Math.cos(theta) * 1.95,
          Math.sin(theta) * 1.95,
          Math.sin(theta * 2) * 0.2,
        );
        plate.spin.rotation.y = t * 2.4;
      });
    },
  };
}

/**
 * Act 03 — the pull. The handle travels down, the selected plates leave the stack,
 * and the cable is re-strung every frame. Machine geometry, honestly modelled.
 */
function buildPull(materials, quality) {
  const mats = cloneMaterials(materials);
  const content = new THREE.Group();
  const frame = new THREE.Group();
  frame.add(content);

  const postHeight = 2.9;
  const postTop = FLOOR_Y + postHeight;

  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, postHeight, Math.max(12, quality.radial >> 3)),
      mats.steel,
    );
    post.position.set(side * 0.78, FLOOR_Y + postHeight / 2, -0.15);
    post.castShadow = true;
    content.add(post);
  }

  const beam = createBar({ length: 1.9, radius: 0.07, materials: mats, radial: 20 });
  beam.rotation.z = Math.PI / 2;
  beam.position.set(0, postTop, -0.15);
  content.add(beam);

  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.1, 16), mats.steel);
  axle.rotation.x = Math.PI / 2; // axle runs along Z
  axle.position.set(0, postTop, -0.15);
  content.add(axle);

  const pulley = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.052, 10, 44), mats.signal);
  pulley.rotation.y = Math.PI / 2; // wheel stands in the YZ plane
  pulley.position.set(0, postTop, -0.15);
  pulley.castShadow = true;
  content.add(pulley);

  const cableGeometry = new THREE.CylinderGeometry(0.026, 0.026, 1, 8);
  const frontCable = new THREE.Mesh(cableGeometry, mats.cable);
  const backCable = new THREE.Mesh(cableGeometry, mats.cable);
  frontCable.castShadow = true;
  backCable.castShadow = true;
  content.add(frontCable, backCable);

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.05, 20), mats.steel);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(0, 1.05, 0.28);
  handle.castShadow = true;
  content.add(handle);

  const stack = [];
  const topPlateY = FLOOR_Y + 0.62;
  for (let i = 0; i < 6; i += 1) {
    const plate = createStackPlate({ materials: mats });
    plate.userData.baseY = topPlateY - i * 0.13;
    plate.userData.lifted = i < 2; // the selected load travels; the rest stays put
    plate.position.set(0, plate.userData.baseY, -0.5);
    stack.push(plate);
    content.add(plate);
  }

  return {
    frame,
    content,
    weight: (local) => window_(local, 0.26, 0.58),
    cameraWeight: (local) => smoothstep(0.02, 0.3, local),
    update(local) {
      const t = easeInOut(local);

      const handleY = 1.05 - t * 1.3;
      handle.position.y = handleY;

      const stackLift = t * 0.95;
      for (const plate of stack) {
        plate.position.y = plate.userData.baseY + (plate.userData.lifted ? stackLift : 0);
      }

      _a.set(0, postTop, 0.2);
      _b.set(0, handleY + 0.05, 0.28);
      stretchCylinder(frontCable, _a, _b);

      _a.set(0, postTop, -0.5);
      _b.set(0, stack[0].position.y + 0.05, -0.5);
      stretchCylinder(backCable, _a, _b);

      content.rotation.y = -0.22 + t * 0.26;
    },
  };
}

/**
 * Act 07 — the plate. Edge-on to square-on: the studio's first purchase, turned to
 * face the visitor at the end of the page.
 */
function buildVisit(materials, quality) {
  const mats = cloneMaterials(materials);
  const content = new THREE.Group();
  const frame = new THREE.Group();
  frame.add(content);

  const radius = 1.12;
  const monument = createPlate({
    radius,
    thickness: 0.26,
    materials: mats,
    radial: quality.radial,
    accent: true,
  });
  monument.tilt.rotation.x = Math.PI / 2; // upright, facing the camera
  monument.group.position.y = FLOOR_Y + radius; // standing on the floor
  content.add(monument.group);

  const wings = [];
  for (const side of [-1, 1]) {
    const wing = createPlate({
      radius: 0.78,
      thickness: 0.2,
      materials: mats,
      radial: Math.max(48, quality.radial >> 1),
      accent: false,
    });
    wing.tilt.rotation.x = Math.PI / 2;
    wing.group.position.set(side * 1.05, FLOOR_Y + 0.78, -0.9);
    wing.group.rotation.y = side * 0.35;
    wings.push(wing);
    content.add(wing.group);
  }

  return {
    frame,
    content,
    weight: (local) => smoothstep(0.26, 0.44, local),
    cameraWeight: (local) => smoothstep(0.02, 0.3, local),
    update(local) {
      const t = easeInOut(clamp(local * 1.25));
      content.rotation.y = -1.45 + t * 1.62;
      content.rotation.z = 0.02 - t * 0.05;
      content.position.y = -0.1 + t * 0.28;

      wings.forEach((wing, i) => {
        const side = i === 0 ? -1 : 1;
        wing.group.position.x = side * (1.05 + t * 0.32);
        wing.spin.rotation.y = side * t * 0.9;
      });
    },
  };
}

// module-scope scratch vectors — stretchCylinder reads them every frame
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/**
 * Builds the four chapters and blends the camera between them by act weight, so the
 * camera glides chapter to chapter instead of cutting. Nothing here renders: main.js
 * owns the loop.
 */
export function createActs({ scene, materials, quality }) {
  const hero = buildHero(materials, quality);
  const progression = buildProgression(materials, quality);
  const pull = buildPull(materials, quality);
  const visit = buildVisit(materials, quality);

  const acts = { hero, progression, pull, visit };
  for (const act of Object.values(acts)) scene.add(act.frame);

  const current = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  const _pos = new THREE.Vector3();
  const _target = new THREE.Vector3();
  let poses = poseSet(POSES);
  let placed = false;

  /** Desktop ↔ narrow framing. Rescales poses and frames, never rebuilds geometry. */
  function layout(narrow) {
    poses = poseSet(narrow ? POSES_NARROW : POSES);
    hero.frame.scale.setScalar(1);
    // the bar is longer than a phone is wide: keep the loaded side in frame
    hero.frame.position.set(narrow ? -1.55 : 0, 0, 0);
    progression.frame.scale.setScalar(narrow ? 0.72 : 1);
    pull.frame.scale.setScalar(narrow ? 0.78 : 1);
    visit.frame.scale.setScalar(narrow ? 0.85 : 1);
    placed = false;
  }

  /**
   * @param {Record<string, number>} progress chapter-local progress, 0 → 1
   * @param {number} dt seconds since the previous frame
   * @param {THREE.PerspectiveCamera} camera
   * @param {{x: number, y: number}} pointer −1 → 1, already damped
   */
  function update(progress, dt, camera, pointer) {
    _pos.set(0, 0, 0);
    _target.set(0, 0, 0);
    let total = 0;

    for (const [name, act] of Object.entries(acts)) {
      const local = progress[name] ?? 0;
      const visible = act.weight(local);
      const cameraWeight = act.cameraWeight(local);
      act.update(local, visible);
      setGroupOpacity(act.frame, visible);

      // The camera is placed by its own weight: it commits to a chapter's pose before
      // that chapter's object has appeared, and lets go after the object has gone.
      if (cameraWeight > 0.001) {
        total += cameraWeight;
        _pos.addScaledVector(poses[name].pos, cameraWeight);
        _target.addScaledVector(poses[name].target, cameraWeight);
      }
    }

    if (total > 0.001) {
      _pos.divideScalar(total);
      _target.divideScalar(total);
    } else {
      // between chapters: hold the last pose rather than snapping home
      _pos.copy(current.pos);
      _target.copy(current.target);
    }

    if (!placed) {
      current.pos.copy(_pos);
      current.target.copy(_target);
      placed = true;
    } else {
      const k = 1 - Math.exp(-Math.max(dt, 1 / 240) / 0.3);
      current.pos.lerp(_pos, k);
      current.target.lerp(_target, k);
    }

    const px = pointer?.x ?? 0;
    const py = pointer?.y ?? 0;

    camera.position.set(current.pos.x + px * 0.3, current.pos.y - py * 0.2, current.pos.z);
    camera.lookAt(current.target.x + px * 0.12, current.target.y - py * 0.07, current.target.z);
  }

  return { acts, layout, update };
}

function poseSet(source) {
  const out = {};
  for (const [name, pose] of Object.entries(source)) {
    out[name] = {
      pos: new THREE.Vector3().fromArray(pose.pos),
      target: new THREE.Vector3().fromArray(pose.target),
    };
  }
  return out;
}
