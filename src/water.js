import * as THREE from 'three';

export function createHoseDemo({world, truck, cylinder, box, steel, dark, reduced, button, status}) {
  const target = new THREE.Vector3(4.8, .37, 3.8);
  const base = new THREE.Vector3(.35, 2.6, .22).add(truck.position);
  cylinder(.18, .22, .16, steel, .35, 2.55, .22, truck);
  const direction = target.clone().sub(base).normalize(); direction.y += .5; direction.normalize();
  const nozzle = cylinder(.085, .11, .8, steel, .35, 2.95, .22, truck, 24);
  nozzle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  const source = nozzle.position.clone().addScaledVector(direction, .4).add(truck.position);
  const control = source.clone().lerp(target, .5); control.y += 1.8;
  const arc = new THREE.QuadraticBezierCurve3(source, control, target);
  const jet = new THREE.Mesh(new THREE.TubeGeometry(arc, 40, .045, 8, false),
    new THREE.MeshBasicMaterial({color:'#b9eaff', transparent:true, opacity:.7, depthWrite:false}));
  jet.visible = false; world.add(jet);
  const count = 150, positions = new Float32Array(count * 3);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const spray = new THREE.Points(geometry, new THREE.PointsMaterial({color:'#d5f4ff', size:.065, transparent:true, opacity:.8, depthWrite:false}));
  spray.visible = false; world.add(spray);
  // Scorched training debris stays visible after the flames are extinguished.
  box(1.1, .12, .9, dark, target.x, .32, target.z, world);
  for (let i = 0; i < 4; i++) {
    const log = cylinder(.08, .09, 1, dark, target.x, .43 + i * .07, target.z, world);
    log.rotation.z = Math.PI / 2; log.rotation.y = i * .8;
  }
  const flames = new THREE.Group(); flames.position.copy(target); world.add(flames);
  const flameGeometry = new THREE.SphereGeometry(1, 10, 10);
  for (let i = 0; i < 12; i++) {
    const flame = new THREE.Mesh(flameGeometry, new THREE.MeshBasicMaterial({color:i % 2 ? '#ffb52e' : '#fa5720', transparent:true, opacity:.8, depthWrite:false}));
    flame.position.set(Math.sin(i * 2.4) * .35, .45, Math.cos(i * 2.4) * .3);
    flames.add(flame);
  }
  const glow = new THREE.PointLight('#ff7b25', 4, 7, 2); glow.position.copy(target).y += .8; world.add(glow);
  let spraying = false, remaining = 1, elapsed = 0;
  function setSpraying(value) {
    spraying = value; jet.visible = spray.visible = value;
    button.setAttribute('aria-pressed', String(value)); button.classList.toggle('active', value);
    button.setAttribute('aria-label', value ? 'Stop water' : remaining === 0 ? 'Replay fire extinguishing' : 'Spray water');
    button.title = value ? 'Stop water' : remaining === 0 ? 'Replay fire extinguishing' : 'Spray water from the roof hose';
  }
  button.addEventListener('click', () => {
    if (remaining === 0) { remaining = 1; flames.visible = true; }
    setSpraying(!spraying);
    status.textContent = spraying ? 'Water flowing · Extinguishing fire…' : 'Water stopped · Resume to extinguish the fire';
    status.dataset.state = spraying ? 'spraying' : 'burning';
  });
  status.dataset.state = 'burning';
  return {update(dt, time) {
    elapsed += dt;
    if (spraying) {
      remaining = Math.max(0, remaining - dt / 5);
      if (remaining === 0) {
        flames.visible = false; setSpraying(false);
        status.textContent = 'Fire extinguished · Tap water to replay'; status.dataset.state = 'extinguished';
      }
    }
    glow.intensity = remaining * (reduced ? 3 : 3 + Math.sin(time * 9) * .7);
    flames.children.forEach((flame, i) => {
      const flicker = reduced ? 1 : 1 + Math.sin(time * 8 + i * 2) * .2;
      flame.scale.set(.16 * remaining, (.5 + i % 3 * .14) * remaining * flicker, .16 * remaining);
      flame.position.y = flame.scale.y * .7;
    });
    if (!spraying) return;
    for (let i = 0; i < count; i++) {
      const t = (i / count + elapsed * 1.4) % 1, p = arc.getPoint(t);
      const spread = .03 + t * .13;
      positions[i * 3] = p.x + Math.sin(i * 12.3) * spread;
      positions[i * 3 + 1] = p.y + Math.cos(i * 7.1) * spread;
      positions[i * 3 + 2] = p.z + Math.sin(i * 5.7) * spread;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeBoundingSphere();
  }};
}
