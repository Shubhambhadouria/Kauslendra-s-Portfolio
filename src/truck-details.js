import * as THREE from 'three';

export function detailFireTruck({truck, box, cylinder, steel, dark, red, renderer}) {
  // Rake the cab front and add reflective equipment to the road-going appliance.
  for (const mesh of truck.children) {
    if (mesh.position.x === 1.35 && mesh.position.y === 1.35) {
      const vertices = mesh.geometry.attributes.position;
      for (let i = 0; i < vertices.count; i++) if (vertices.getX(i) > .2 && vertices.getY(i) > .15)
        vertices.setX(i, vertices.getX(i) - (vertices.getY(i) - .15) * .18);
      vertices.needsUpdate = true; mesh.geometry.computeVertexNormals();
    }
    if (mesh.position.x === 2.22 && mesh.position.y === 1.75) { mesh.position.x = 2.17; mesh.rotation.z = .13; }
    if (mesh.geometry?.type === 'CylinderGeometry' && Math.abs(mesh.position.z) > .8 && mesh.position.y === .48) mesh.userData.rollingWheel = true;
  }
  const safety = new THREE.MeshStandardMaterial({color:'#dae952', roughness:.32, metalness:.15});
  const rubber = new THREE.MeshStandardMaterial({color:'#141719', roughness:.96});
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#888e94'; ctx.fillRect(0,0,128,128);
  for (let y = 0; y < 128; y += 16) for (let x = 0; x < 128; x += 16) {
    ctx.save(); ctx.translate(x + 8,y + 8); ctx.rotate((x + y) % 32 ? -.7 : .7);
    ctx.fillStyle = '#bcc3c8'; ctx.fillRect(-5,-1,10,2); ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(5,2);
  texture.anisotropy = Math.min(8,renderer.capabilities.getMaxAnisotropy());
  const plate = new THREE.MeshStandardMaterial({map:texture, color:'#d5dce2', metalness:.8, roughness:.38});
  box(2.7,.09,1.62,plate,-.8,1.87,0,truck);
  for (const side of [-1,1]) {
    box(2.72,.12,.025,safety,-.82,.86,side*.893,truck);
    box(.72,.09,.26,plate,1.25,.6,side*.96,truck);
    box(.05,.74,.035,red,1.31,1.75,side*.89,truck);
    box(.036,.44,.034,dark,1.88,1.48,side*.89,truck);
    const wheel = cylinder(.43,.43,.26,rubber,-.54,.48,side*.9,truck,40); wheel.rotation.x = Math.PI/2; wheel.userData.rollingWheel = true;
    const hub = cylinder(.23,.23,.28,steel,-.54,.48,side*.92,truck,32); hub.rotation.x = Math.PI/2; hub.userData.rollingWheel = true;
    const arch = new THREE.Mesh(new THREE.TorusGeometry(.48,.045,8,32,Math.PI),rubber); arch.position.set(-.54,.48,side*1.045); truck.add(arch);
    for (const x of [-2.06,.93]) box(.06,.28,.25,rubber,x,.36,side*.91,truck);
    box(.22,.055,.05,steel,1.66,1.2,side*.912,truck);
    const reflector = new THREE.MeshStandardMaterial({color:'#ffb636',emissive:'#b75c0c',emissiveIntensity:.25,roughness:.3});
    for (const x of [-2,.2,1.95]) box(.1,.045,.035,reflector,x,.69,side*.92,truck);
  }
  const lamp = new THREE.MeshPhysicalMaterial({color:'#f0f5f8',roughness:.08,metalness:.1,clearcoat:1,emissive:'#fff1cf',emissiveIntensity:.55});
  for (const z of [-.63,.63]) {
    box(.095,.28,.34,dark,2.29,1.11,z,truck);
    for (const dz of [-.07,.07]) {
      const lens = cylinder(.075,.075,.04,lamp,2.35,1.12,z+dz,truck,24); lens.rotation.z = Math.PI/2;
    }
  }
  box(.06,.07,1.55,steel,2.34,.81,0,truck);
  for (let i = 0; i < 8; i++) {
    const stripe = box(.025,.12,.28,i%2?safety:red,-2.177,1.45,(i-3.5)*.19,truck); stripe.rotation.x = i<4?-.55:.55;
  }
}
