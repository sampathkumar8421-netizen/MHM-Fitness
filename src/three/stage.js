import * as THREE from 'three';
import { createMaterials } from './materials.js';

/** The page's ink colour — the WebGL clear colour, fog and floor all match the CSS. */
export const STAGE_INK = 0x0c0c0b;
export const FLOOR_Y = -1.6;

/**
 * stage.js — renderer, camera, environment, lights, floor.
 *
 * One key light with a contact shadow, one cool rim, one hemisphere fill. Tone mapping
 * is ACES so the vermilion accent never blows out into clip-art orange.
 */
export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    failIfMajorPerformanceCaveat: false,
  });

  const quality = {
    narrow: window.innerWidth < 860,
    lowPower: (navigator.hardwareConcurrency ?? 8) <= 4,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
    shadows: (navigator.hardwareConcurrency ?? 8) > 4,
    radial: 96,
  };

  /**
   * Re-derives the quality budget for the current viewport. Called at boot and on
   * every resize, so a phone turned to landscape (or a desktop window dragged below
   * 860px) stops rendering with the framing/DPR it was born with. Geometry built
   * from `radial` is not rebuilt here — only what a live renderer can still honour.
   */
  function refreshQuality(width = window.innerWidth) {
    const narrow = width < 860;
    const dpr = Math.min(window.devicePixelRatio || 1, narrow || quality.lowPower ? 1.5 : 2);
    quality.narrow = narrow;
    quality.dpr = dpr;
    quality.radial = narrow || quality.lowPower ? 64 : 96;
    renderer.setPixelRatio(dpr);
    if (key && key.shadow) {
      const map = narrow ? 512 : 1024;
      if (key.shadow.mapSize.x !== map) {
        key.shadow.mapSize.set(map, map);
        // the depth map is allocated lazily; drop it so the new size is used
        key.shadow.map?.dispose();
        key.shadow.map = null;
      }
    }
  }

  renderer.setClearColor(STAGE_INK, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = quality.shadows;
  // r186 removed PCFSoftShadowMap; PCF with a small radius reads softer anyway
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(STAGE_INK);
  scene.fog = new THREE.Fog(STAGE_INK, 11, 26);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 120);
  camera.position.set(0, 1, 7.5);

  // --- environment: a procedural studio room, so no HDR file is shipped ----------
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(
    new THREE.BoxGeometry(24, 14, 24),
    new THREE.MeshBasicMaterial({ color: 0x1d1d1c, side: THREE.BackSide }),
  ));
  const softbox = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 4),
    new THREE.MeshBasicMaterial({ color: 0xf2f1ec }),
  );
  softbox.position.set(-4, 5.6, 5);
  softbox.lookAt(0, 0, 0);
  envScene.add(softbox);
  const card = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 3),
    new THREE.MeshBasicMaterial({ color: 0x6f7896 }),
  );
  card.position.set(5.5, 1.4, -6);
  card.lookAt(0, 0, 0);
  envScene.add(card);

  const envTarget = pmrem.fromScene(envScene, 0.03);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.4;
  pmrem.dispose();

  // --- lights -------------------------------------------------------------------
  const key = new THREE.DirectionalLight(0xfff2e2, 2.6);
  key.position.set(-4.6, 6.4, 5.4);
  key.castShadow = quality.shadows;
  if (quality.shadows) {
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 24;
    key.shadow.camera.left = -7;
    key.shadow.camera.right = 7;
    key.shadow.camera.top = 7;
    key.shadow.camera.bottom = -7;
    key.shadow.bias = -0.0015;
    key.shadow.radius = 3;
  }
  scene.add(key, key.target);

  const rim = new THREE.DirectionalLight(0x9db0ff, 1.2);
  rim.position.set(5.4, 2.4, -6.2);
  scene.add(rim);

  const fill = new THREE.HemisphereLight(0xdbe3ff, STAGE_INK, 0.32);
  scene.add(fill);

  /* Boot the quality budget now that the key light (and its shadow map) exists. */
  refreshQuality(document.documentElement.clientWidth || window.innerWidth);

  // --- floor: a pool of light that fades into the ink, catching the contact shadow --
  const floorTexture = createRadialTexture();
  const materials = createMaterials();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(44, 44),
    new THREE.MeshStandardMaterial({
      color: 0x151514,
      roughness: 0.95,
      metalness: 0,
      transparent: true,
      alphaMap: floorTexture,
      depthWrite: false,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  floor.receiveShadow = quality.shadows;
  scene.add(floor);

  function resize(width = window.innerWidth, height = window.innerHeight) {
    /* Quality decisions follow the layout width (clientWidth), not innerWidth:
       with a classic scrollbar innerWidth is 15–21px wider, which flips the
       860px narrow breakpoint a few pixels early on desktop windows. */
    refreshQuality(document.documentElement.clientWidth || width);
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }

  function render() {
    renderer.render(scene, camera);
  }

  return { renderer, scene, camera, key, quality, materials, floor, resize, render };
}

/** White core → black edge, so the floor plane has no visible boundary. */
function createRadialTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, size * 0.04, size / 2, size / 2, size * 0.5);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.55, '#6e6e6e');
  gradient.addColorStop(1, '#000000');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}
