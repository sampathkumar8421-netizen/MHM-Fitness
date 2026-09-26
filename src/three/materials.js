import * as THREE from 'three';

/**
 * materials.js — one material family for the entire stage.
 *
 * Restraint is the brief: two metal finishes (steel and graphite), a single signal
 * accent, and a floor that exists only to catch contact shadow. Nothing else.
 */
export function createMaterials() {
  return {
    /** Bar, sleeves, collars — satin steel, the brightest surface in the scene. */
    steel: new THREE.MeshStandardMaterial({
      color: 0x3a3a38,
      metalness: 0.95,
      roughness: 0.34,
      envMapIntensity: 1,
    }),

    /** Plates and frames — graphite rubber-crumb finish, near-black on purpose. */
    graphite: new THREE.MeshStandardMaterial({
      color: 0x141414,
      metalness: 0.55,
      roughness: 0.62,
      envMapIntensity: 0.55,
    }),

    /** The one accent. Thicker geometry only (rims, flags) — never body copy. */
    signal: new THREE.MeshStandardMaterial({
      color: 0xe8410e,
      metalness: 0.3,
      roughness: 0.4,
      emissive: 0xe8410e,
      emissiveIntensity: 0.16,
      envMapIntensity: 0.8,
    }),

    /** Cable, rope, grips. */
    cable: new THREE.MeshStandardMaterial({
      color: 0x0f0f0f,
      metalness: 0.25,
      roughness: 0.85,
      envMapIntensity: 0.4,
    }),
  };
}

/**
 * Groups fade as the choreography hands over between chapters, so each act needs its
 * own material instances. Cloning once per act costs nothing and keeps `opacity`
 * independent.
 */
export function cloneMaterials(materials) {
  const out = {};
  for (const [key, material] of Object.entries(materials)) {
    const clone = material.clone();
    clone.transparent = true;
    clone.opacity = 1;
    out[key] = clone;
  }
  return out;
}

/** Sets opacity (and shadow casting) for every mesh under a group. */
export function setGroupOpacity(group, opacity) {
  const visible = opacity > 0.004;
  group.visible = visible;
  if (!visible) return;

  group.traverse((child) => {
    if (!child.isMesh) return;
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => {
        material.opacity = opacity;
      });
    } else if (child.material) {
      child.material.opacity = opacity;
    }
    child.castShadow = opacity > 0.08;
  });
}
