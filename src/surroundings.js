import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function batchStaticSurroundings(world, truck) {
  world.updateMatrixWorld(true);
  const inverse = world.matrixWorld.clone().invert(), batches = new Map();
  const roots = world.children.filter(child => child !== truck);
  for (const root of roots) root.traverse(mesh => {
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
    if (!batches.has(mesh.material)) batches.set(mesh.material, []);
    batches.get(mesh.material).push(geometry);
  });
  for (const root of roots) world.remove(root);
  for (const [material, geometries] of batches) {
    const geometry = mergeGeometries(geometries);
    const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = mesh.receiveShadow = true;
    world.add(mesh); geometries.forEach(part => part.dispose());
  }
}

// Local geometry and textures keep the interactive scene independent of asset services.
export function addRealisticSurroundings({scene, world, truck, box, cylinder, mat, surface, steel, dark, trim, red}) {
  const sky = document.createElement('canvas'); sky.width = 1024; sky.height = 512;
  const ctx = sky.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, '#728fa6'); gradient.addColorStop(.55, '#bdcdd5'); gradient.addColorStop(1, '#e8e7e1');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1024, 512);
  // Wrap the sky around the world so it moves with the camera at every heading.
  for (let i = 0; i < 24; i++) {
    const x = (i * 137) % 1024, y = 110 + (i * 47) % 105;
    const cloud = ctx.createRadialGradient(x, y, 2, x, y, 65);
    cloud.addColorStop(0, 'rgba(255,255,255,.38)'); cloud.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = cloud; ctx.fillRect(x - 65, y - 65, 130, 130);
  }
  const skyTexture = new THREE.CanvasTexture(sky); skyTexture.colorSpace = THREE.SRGBColorSpace;
  skyTexture.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = skyTexture;
  scene.fog = new THREE.Fog('#e8e7e1', 45, 95);

  const concrete = mat('#b7b4aa'); surface(concrete, [218, 216, 210], 35, 9, .025);
  const road = mat('#54595d'); surface(road, [170, 172, 175], 80, 16, .035);
  const markings = mat('#d8d3be');
  // A continuous apron, kerb and public road replace the display-base silhouette.
  box(36, .16, 12, concrete, 0, .19, 4.3, world);
  box(80, .09, 9, road, 0, .12, 13, world);
  for (let x = -36; x < 40; x += 6) box(3, .008, .12, markings, x, .171, 13, world);
  for (const x of [-13, 13]) {
    box(12, .27, 1.4, concrete, x, .2, 8.2, world);
    for (let n = -5; n <= 5; n++) box(.018, .014, 1.4, dark, x + n, .342, 8.2, world);
  }
  for (const x of [-3.2, 2.6]) box(.09, .012, 6.5, markings, x, .277, 4.8, world);
  const stop = box(4.8, .012, .15, markings, -.3, .277, 7.8, world);
  const drain = mat('#343b3e', .55, .65);
  for (let x = -2.8; x < 2.3; x += .14) box(.06, .018, .3, drain, x, .284, 6.8, world);

  // Roof coping, service equipment, wall lights and a brick side elevation.
  box(6.1, .13, 3.4, concrete, -.5, 3.48, -1.3, world);
  for (const z of [-2.95, .35]) box(6.1, .2, .1, concrete, -.5, 3.57, z, world);
  const brick = mat('#826758'); surface(brick, [198, 171, 149], 35, 4, .015);
  box(.045, 2.75, 3.25, brick, 2.526, 1.68, -1.3, world);
  const mortar = mat('#b2a79a');
  for (let row = 0; row < 16; row++) {
    const y = .35 + row * .17;
    box(.05, .012, 3.25, mortar, 2.551, y, -1.3, world);
    for (let z = -2.85; z < .35; z += .42) box(.05, .16, .012, mortar, 2.552, y + .085, z + (row % 2) * .21, world);
  }
  // Windows sit in front of the brick cladding.
  for (const z of [-2.2, -.9]) {
    box(.04, 1, .8, mat('#29404b', .12, .4), 2.59, 1.7, z, world);
    box(.06, .07, .85, trim, 2.62, 1.7, z, world);
    box(.06, 1.05, .055, trim, 2.62, 1.7, z, world);
    box(.2, .08, .94, concrete, 2.61, 1.17, z, world);
  }
  box(1.1, .65, .7, steel, -.9, 3.9, -1.6, world);
  for (let x = -1.35; x < -.4; x += .09) box(.035, .4, .025, dark, x, 3.9, -1.235, world);
  cylinder(.12, .12, .8, steel, 1, 3.95, -2.1, world, 32);
  cylinder(.2, .2, .08, steel, 1, 4.39, -2.1, world, 32);
  const warmLight = new THREE.MeshStandardMaterial({color:'#fff1d5', emissive:'#ffdaa2', emissiveIntensity:.6});
  for (const x of [-3.15, .65, 2.18]) {
    box(.3, .14, .22, dark, x, 2.72, .53, world);
    box(.22, .025, .15, warmLight, x, 2.64, .55, world);
  }

  // Utility poles and distant buildings establish full-size surroundings.
  const distant = mat('#9a9b94');
  const windowMaterial = mat('#667781', .4);
  for (let i = 0; i < 24; i++) {
    const angle = i / 24 * Math.PI * 2;
    const building = new THREE.Group();
    building.position.set(Math.sin(angle) * 36, 0, Math.cos(angle) * 36);
    building.rotation.y = angle; world.add(building);
    const height = 4 + (i % 4) * 1.3;
    box(6, height, 5, distant, 0, height / 2, 0, building);
    for (let y = 1.3; y < height; y += 1.5) for (const x of [-1.9, 0, 1.9])
      box(.85, .9, .04, windowMaterial, x, y, -2.53, building);
  }
  for (let i = 0; i < 7; i++) {
    const x = -24 + i * 8, height = 3 + (i % 3) * 1.2;
    box(6, height, 5, distant, x, height / 2, -18 - (i % 2) * 4, world);
    for (let y = 1.2; y < height; y += 1.3) for (let dx = -2; dx <= 2; dx += 1.3)
      box(.75, .8, .025, mat('#667781', .4), x + dx, y, -15.48 - (i % 2) * 4, world);
  }
  for (const x of [-9, 10]) {
    cylinder(.07, .1, 6, steel, x, 3.2, 7, world, 16);
    box(1.4, .07, .07, steel, x + .6, 6.17, 7, world);
    box(.5, .1, .28, dark, x + 1.15, 6.12, 7, world);
  }
  const leaf = mat('#455647');
  for (const x of [-8, 8, -13]) {
    cylinder(.12, .2, 2.8, mat('#625749'), x, 1.55, -5, world);
    for (let n = 0; n < 6; n++) {
      const crown = new THREE.Mesh(new THREE.SphereGeometry(.8, 12, 10), leaf);
      crown.position.set(x + Math.sin(n * 2.4) * .65, 2.8 + (n % 3) * .4, -5 + Math.cos(n * 2.4) * .65);
      crown.scale.set(1, 1.3, 1); crown.castShadow = true; world.add(crown);
    }
  }

  // Wheel arches, rear equipment and reflective markings break up the solid truck body.
  for (const side of [-1, 1]) {
    for (const x of [-1.55, 1.45]) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(.51, .045, 8, 28, Math.PI), dark);
      arch.position.set(x, .48, side * 1.04); truck.add(arch);
    }
    for (let x = -2; x < .45; x += .32) box(.19, .06, .025, markings, x, .72, side * .883, truck);
    box(.7, .55, .06, steel, -.45, 1.35, side * .92, truck);
    for (const x of [-.65, -.4, -.15]) {
      const dial = cylinder(.07, .07, .035, trim, x, 1.48, side * .97, truck, 24); dial.rotation.x = Math.PI / 2;
      const valve = cylinder(.065, .065, .08, red, x, 1.22, side * .99, truck, 16); valve.rotation.x = Math.PI / 2;
    }
    box(.035, .55, .065, steel, -2.19, 1.34, side * .7, truck);
    box(.04, .2, .14, red, -2.19, .85, side * .65, truck);
  }
  box(.14, .14, 1.83, steel, -2.35, .6, 0, truck);
  for (let y = .8; y < 2.1; y += .23) box(.07, .035, .6, steel, -2.22, y, 0, truck);
}
