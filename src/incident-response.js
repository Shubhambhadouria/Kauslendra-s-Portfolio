import * as THREE from 'three';

function plumeTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const px = (x - 64) / 64, py = y / 128, taper = .08 + py * .55;
    const edge = Math.exp(-(((px + Math.sin(py * 13) * .07) / taper) ** 2) * 2.8) * Math.sin(py * Math.PI) ** .65;
    const noise = .8 + Math.sin(x * .3 + y * .2) * Math.sin(y * .35 - x * .1) * .2, at = (y * 128 + x) * 4;
    pixels.data[at] = 255; pixels.data[at + 1] = 65 + py * 185;
    pixels.data[at + 2] = py * py * 105; pixels.data[at + 3] = Math.min(255, edge * noise * 300);
  }
  ctx.putImageData(pixels, 0, 0); const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

export function createIncidentResponse({world, truck, cylinder, box, steel, dark, reduced, button, status, onSiren}) {
  const target = new THREE.Vector3(7.2, .47, 3.1);
  // The incident sits in the open forecourt, away from the station.
  box(1.25,.12,1,dark,target.x,.33,target.z,world);
  for(let i=0;i<4;i++) {
    const debris=cylinder(.07,.09,1,dark,target.x,.43+i*.04,target.z,world);
    debris.rotation.z=Math.PI/2; debris.rotation.y=i*.8;
  }
  cylinder(.18, .22, .16, steel, .35, 2.55, .22, truck);
  cylinder(.1, .13, .38, steel, .35, 2.78, .22, truck);
  const nozzle = cylinder(.085, .11, .8, steel, .35, 3, .22, truck, 24);
  const tip = cylinder(.095, .095, .13, dark, .35, 3, .22, truck, 24);
  let arc;
  const jet = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({color:'#b9eaff', transparent:true, opacity:.6, depthWrite:false}));
  jet.visible = false; world.add(jet);
  const count = 190, positions = new Float32Array(count * 3), geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const spray = new THREE.Points(geometry, new THREE.PointsMaterial({color:'#e6f8ff', size:.075, transparent:true, opacity:.8, depthWrite:false}));
  spray.visible = false; spray.frustumCulled = false; world.add(spray);
  function aim() {
    world.updateMatrixWorld(true);
    const localTarget = truck.worldToLocal(world.localToWorld(target.clone()));
    const direction = localTarget.sub(nozzle.position); direction.y += .9; direction.normalize();
    nozzle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    tip.position.copy(nozzle.position).addScaledVector(direction, .4); tip.quaternion.copy(nozzle.quaternion);
    const source = tip.position.clone().addScaledVector(direction, .07); truck.localToWorld(source); world.worldToLocal(source);
    const control = source.clone().lerp(target, .5); control.y += .9;
    arc = new THREE.QuadraticBezierCurve3(source, control, target);
    jet.geometry.dispose(); jet.geometry = new THREE.TubeGeometry(arc, 36, .045, 6, false);
  }
  const flames = new THREE.Group(); flames.name = 'incident-flames'; world.add(flames);
  const flameMap = plumeTexture();
  for (let i = 0; i < 22; i++) flames.add(new THREE.Sprite(new THREE.SpriteMaterial({map:flameMap, color:i % 3 ? '#ffae60' : '#fff6d7', transparent:true, blending:THREE.AdditiveBlending, depthWrite:false})));
  const emberGeometry = new THREE.BufferGeometry(), emberPositions = new Float32Array(120);
  emberGeometry.setAttribute('position', new THREE.BufferAttribute(emberPositions, 3));
  const sparks = new THREE.Points(emberGeometry, new THREE.PointsMaterial({color:'#ffbf50', size:.035, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false}));
  sparks.frustumCulled = false; world.add(sparks);
  const glow = new THREE.PointLight('#ff7b25', 8, 12, 2); glow.position.copy(target).z += .5; world.add(glow);
  const wet = new THREE.Mesh(new THREE.CircleGeometry(1.4, 32), new THREE.MeshStandardMaterial({color:'#45545b', roughness:.15, metalness:.25, transparent:true, opacity:.5}));
  wet.rotation.x = -Math.PI / 2; wet.position.set(target.x, .29, target.z); wet.visible = false; world.add(wet);
  const home = truck.position.clone(), destination = new THREE.Vector3(4.4, home.y, 3.1);
  const path = new THREE.QuadraticBezierCurve3(home, new THREE.Vector3(1.8, home.y, 3.1), destination);
  let phase = 'responding', travel = 0, elapsed = 0, remaining = 1, spraying = false;
  let automaticWater = true, onSceneWait = 0;
  button.disabled = true; status.dataset.state = phase; status.textContent = 'Nearby fire · Truck responding';
  button.title = 'Truck is responding to the nearby fire'; onSiren(true);
  function setSpraying(value) {
    spraying = value; jet.visible = spray.visible = value;
    button.setAttribute('aria-pressed', String(value)); button.classList.toggle('active', value);
    button.setAttribute('aria-label', value ? 'Stop water' : remaining === 0 ? 'Replay fire extinguishing' : 'Spray water');
    button.title = value ? 'Stop water' : remaining === 0 ? 'Replay fire extinguishing' : 'Spray water onto the nearby fire';
    if (value) aim();
  }
  function replay() {
    remaining = 1; travel = 0; phase = 'responding'; truck.position.copy(home); truck.rotation.y = 0;
    automaticWater = true; onSceneWait = 0;
    flames.visible = sparks.visible = true; wet.visible = false; setSpraying(false); button.disabled = true;
    button.setAttribute('aria-label','Spray water'); status.dataset.state = phase; status.textContent = 'Nearby fire · Truck responding';
    onSiren(true);
  }
  button.addEventListener('click', () => {
    if (remaining === 0) { replay(); return; } if (phase === 'responding') return;
    automaticWater = false;
    setSpraying(!spraying); phase = spraying ? 'spraying' : 'burning';
    status.textContent = spraying ? 'Water flowing · Extinguishing fire…' : 'Water stopped · Resume to extinguish the fire'; status.dataset.state = phase;
  });
  return {get state(){return phase;}, update(dt, time) {
    elapsed += dt;
    const wasResponding = phase === 'responding';
    if (phase === 'responding') {
      travel = Math.min(1, travel + dt / (reduced ? 1 : 7)); const t = travel * travel * (3 - 2 * travel);
      const previousPosition = truck.position.clone();
      truck.position.copy(path.getPoint(t)); const tangent = path.getTangent(t); truck.rotation.y = -Math.atan2(tangent.z, tangent.x);
      const wheelTurn = truck.position.distanceTo(previousPosition) / .46;
      truck.children.forEach(part => {if(part.userData.rollingWheel) part.rotateY(wheelTurn);});
      if (travel === 1) { phase = 'burning'; button.disabled = false; setSpraying(false); aim(); status.dataset.state = phase; status.textContent = 'Truck on scene · Preparing water hose'; }
    }
    if (phase === 'burning' && automaticWater && !wasResponding) {
      onSceneWait += dt;
      if (onSceneWait >= 1.5) {
        automaticWater = false; setSpraying(true); phase = 'spraying';
        status.dataset.state = phase; status.textContent = 'Water flowing · Extinguishing fire…';
      }
    }
    if (spraying) {
      remaining = Math.max(0, remaining - dt / 7); wet.visible = true;
      if (remaining === 0) { flames.visible = sparks.visible = false; setSpraying(false); phase = 'extinguished'; status.textContent = 'Fire extinguished · Tap water to replay'; status.dataset.state = phase; onSiren(false); }
    }
    glow.intensity = remaining * (reduced ? 6 : 6 + Math.sin(time * 9) * 1.5);
    flames.children.forEach((flame, i) => {
      const cycle = reduced ? .45 : (elapsed * (.65 + i % 4 * .12) + i * .137) % 1;
      flame.position.set(target.x + Math.sin(i * 2.4 + cycle * 3) * .35, target.y + cycle * .75 * remaining, target.z + Math.cos(i * 2.1) * .28);
      flame.scale.set((.55 + i % 3 * .12) * remaining, (.8 + i % 4 * .24) * remaining, 1); flame.material.opacity = remaining * (.9 - cycle * .7);
    });
    for (let i = 0; i < 40; i++) {
      const cycle = reduced ? .4 : (elapsed * .45 + i / 40) % 1;
      emberPositions[i * 3] = target.x + Math.sin(i * 2.3) * cycle * .8;
      emberPositions[i * 3 + 1] = target.y + cycle * 2.1; emberPositions[i * 3 + 2] = target.z + cycle * .4;
    }
    emberGeometry.attributes.position.needsUpdate = true;
    if (!spraying) return;
    for (let i = 0; i < count; i++) {
      const t = (i / count + elapsed * 1.7) % 1, p = arc.getPoint(t), spread = .025 + t * .14;
      positions[i * 3] = p.x + Math.sin(i * 12.3) * spread; positions[i * 3 + 1] = p.y + Math.cos(i * 7.1) * spread; positions[i * 3 + 2] = p.z + Math.sin(i * 5.7) * spread;
    }
    geometry.attributes.position.needsUpdate = true;
  }};
}
