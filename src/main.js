import './style.css';
import './vault.css';
import { renderVault } from './vault.js';
import { leavePreview } from './preview.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { addRealisticSurroundings, batchStaticSurroundings } from './surroundings.js';
import { createIncidentResponse } from './incident-response.js';
import { detailFireTruck } from './truck-details.js';
import publicProfile from '../data/profile.json';

const staticDeployment = import.meta.env.MODE === 'pages';
const hostedServiceOrigin = 'https://station-07-backend.onrender.com';

const extinguisher = `<svg class="extinguisher" viewBox="0 0 150 220" aria-label="Fire extinguisher" role="img"><path d="M91 40 Q137 35 133 90 L132 151" fill="none" stroke="#343e35" stroke-width="9" stroke-linecap="round"/><path d="M126 146h14l-3 34h-10z" fill="#343e35"/><rect x="65" y="28" width="19" height="30" rx="4" fill="#52604e"/><path d="M69 29L52 15h44v9H73" fill="#414c3d"/><circle cx="92" cy="35" r="11" fill="#414c3d"/><circle cx="92" cy="35" r="7" fill="#f5efdf"/><path d="M92 35l3-5" stroke="#d64e34" stroke-width="2"/><rect x="42" y="49" width="65" height="153" rx="24" fill="#d64f35"/><path d="M53 72v99" stroke="#ed8061" stroke-width="7" stroke-linecap="round"/><rect x="43" y="101" width="63" height="55" rx="2" fill="#f4ebd9"/><path d="M73 110c-7 13-15 13-12 25 3 13 23 13 23-1 0-7-5-10-4-16-4 3-4 6-5 9-3-5 0-11-2-17" fill="#d64f35"/><path d="M55 151h39" stroke="#adac92" stroke-width="2"/><rect x="48" y="196" width="53" height="9" rx="3" fill="#394337"/></svg>`;
document.querySelector('#app').innerHTML = `<main class="app-shell"><header><div class="brand"><div class="brand-mark">♜</div><div><div class="brand-name">STATION 07</div><div class="brand-sub">A FIRE OFFICER'S WORLD</div></div></div><nav aria-label="Portfolio"><button data-section="about">The officer</button><button data-section="experience">On duty</button><button data-section="contact">Get in touch ↗</button></nav><div class="availability"><i class="dot"></i> ALWAYS READY</div></header><div class="intro"><div class="eyebrow">COURAGE. COMMITMENT. COMMUNITY.</div><h1>A life dedicated<br>to <em>protecting yours.</em></h1><p>Every call has a story. Every day has a purpose.<br>Step inside my world, one shift at a time.</p></div><div class="scene-note"><strong>07<span class="visually-hidden">Station seven</span></strong>YOUR LOCAL HERO<span>A small station.<br>A big responsibility.</span></div><div id="scene" class="scene" aria-label="Interactive 3D fire station and fire truck"></div><div class="hotspots"><button class="hotspot" data-section="about" id="spot-about">Meet the officer</button><button class="hotspot" data-section="experience" id="spot-experience">Life on duty</button><button class="hotspot" data-section="training" id="spot-training">Tools of the trade</button></div><div class="hint">↔ Drag to explore <span>·</span> Scroll to get closer <span>·</span> Click to discover</div><div class="toolbar"><button class="tool" id="lights" aria-label="Toggle emergency lights" aria-pressed="false" title="Emergency lights">ϟ</button><button class="tool" id="reset" aria-label="Reset camera" title="Reset view">⟳</button></div><footer class="footer"><div><span class="number">01 /</span><strong> WELCOME TO THE STATION</strong></div><div class="middle">BUILT ON COURAGE, DRIVEN BY DUTY</div><div>Made with purpose <span style="color:#d65036">✳</span></div></footer></main><div class="loader"><div class="eyebrow">WELCOME TO STATION 07</div>${extinguisher}<h2>Getting ready for the call.</h2><p>A little preparation. A world to explore.</p><div class="progress-track"><div class="progress-bar"></div></div><div class="progress-label">PREPARING THE STATION · <span id="percent">0</span>%</div><button class="start" disabled>START EXPLORING ↗</button><div class="loader-bottom">PROTECT · SERVE · INSPIRE</div></div><div class="modal-backdrop" hidden><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button class="close" aria-label="Close dialog">×</button><div id="modal-content"></div></section></div>`;

const vaultButton = document.createElement('button');
vaultButton.dataset.section = 'vault'; vaultButton.textContent = 'Fire Vault ⌑';
document.querySelector('nav').insertBefore(vaultButton, document.querySelector('[data-section="contact"]'));
document.querySelector('.intro p').innerHTML = 'Kaushlendra Singh Chauhan<br>Fire Officer · SBI';
document.querySelector('.brand-sub').textContent = 'KAUSHLENDRA SINGH CHAUHAN';
document.querySelector('.loader p').textContent = 'Kaushlendra Singh Chauhan · Fire Officer at SBI';
let profile = null; let profileError = false;
const profileReady = staticDeployment
  ? Promise.resolve().then(() => { profile = publicProfile; })
  : fetch('/api/profile').then(r => { if (!r.ok) throw Error(); return r.json(); }).then(data => { profile = data; }).catch(() => { profileError = true; });
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const backdrop = document.querySelector('.modal-backdrop'); let previousFocus;
async function openSection(section) {
  if(!leavePreview())return;
  if(staticDeployment && ['vault','contact'].includes(section)){
    window.location.assign(`${hostedServiceOrigin}/?section=${section}`);
    return;
  }
  previousFocus = document.activeElement; await profileReady;
  const content = document.querySelector('#modal-content');
  document.querySelector('.modal').classList.toggle('vault-modal', section === 'vault');
  if (section === 'vault') {
    backdrop.hidden = false; document.querySelector('.close').focus();
    await renderVault(content); return;
  } else if (section === 'contact') {
    content.innerHTML = `<div class="eyebrow">LET'S CONNECT</div><h2 id="modal-title">Leave a message.</h2><p>For professional enquiries and conversations.</p><small>This portfolio inbox is not monitored for emergencies.</small><form id="contact-form"><label>Your name<input name="name" required maxlength="100" autocomplete="name"></label><label>Email address<input name="email" type="email" required maxlength="254" autocomplete="email"></label><label>Your message<textarea name="message" required minlength="10" maxlength="5000"></textarea></label><button class="submit">Send message ↗</button><div class="form-status" role="status"></div></form>`;
    document.querySelector('#contact-form').addEventListener('submit', async event => {
      event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('button'); const status = form.querySelector('.form-status'); button.disabled = true; status.textContent = 'Sending…';
      try { const response = await fetch('/api/contact', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(Object.fromEntries(new FormData(form))) }); const data = await response.json(); if (!response.ok) throw Error(data.error); status.textContent = data.message; form.reset(); } catch(error) { status.textContent = error.message || 'Unable to send. Please try again.'; } finally { button.disabled = false; }
    });
  } else if (profileError) content.innerHTML = `<h2 id="modal-title">Station temporarily offline.</h2><p>Portfolio content could not be loaded. Please refresh and try again.</p>`;
  else if (section === 'about') content.innerHTML = `<div class="eyebrow">THE PERSON BEHIND THE UNIFORM</div><h2 id="modal-title">${escape(profile.name)}</h2><small>${escape(profile.role)} · ${escape(profile.organization)} · ${escape(profile.location)}</small><p>${escape(profile.about)}</p>`;
  else content.innerHTML = `<div class="eyebrow">${section === 'experience' ? 'SERVICE & EXPERIENCE' : 'TRAINING & PREPARATION'}</div><h2 id="modal-title">${section === 'experience' ? 'Life on duty.' : 'Ready for the call.'}</h2>${profile[section].map(item => `<h3>${escape(item.title)}</h3><p>${escape(item.description)}</p>`).join('')}`;
  backdrop.hidden = false; document.querySelector('.close').focus();
}
function closeModal(){if(!leavePreview())return;backdrop.hidden = true; previousFocus?.focus();}
document.querySelectorAll('[data-section]').forEach(button => button.addEventListener('click', () => openSection(button.dataset.section)));
document.querySelector('.close').addEventListener('click',closeModal);
backdrop.addEventListener('click',event => { if(event.target === backdrop) closeModal(); });
document.addEventListener('keydown',event => {
  if(backdrop.hidden) return; if(event.key === 'Escape') closeModal();
  if(event.key === 'Tab') { const elements = [...backdrop.querySelectorAll('button,input,textarea,select,a[href],summary')].filter(e => !e.disabled && e.getClientRects().length); const first = elements[0], last = elements.at(-1); if(event.shiftKey && document.activeElement === first){event.preventDefault();last.focus();}else if(!event.shiftKey && document.activeElement === last){event.preventDefault();first.focus();} }
});

let controls, renderer, camera, scene; let siren = false; let started = false;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sirenGlow = document.createElement('div');
sirenGlow.className = 'siren-glow'; sirenGlow.setAttribute('aria-hidden','true');
sirenGlow.innerHTML = '<div class="siren-red"></div><div class="siren-blue"></div>';
document.querySelector('.app-shell').append(sirenGlow);
const waterButton = document.createElement('button');
waterButton.className = 'tool water-tool'; waterButton.id = 'water';
waterButton.setAttribute('aria-label', 'Spray water'); waterButton.setAttribute('aria-pressed', 'false');
waterButton.title = 'Spray water from the roof hose';
waterButton.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3C10 7 5 11 5 15a7 7 0 0 0 14 0c0-4-5-8-7-12Z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M9 15a3 3 0 0 0 3 3" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';
document.querySelector('.toolbar').insertBefore(waterButton, document.querySelector('#reset'));
const orbitButton = document.createElement('button'); orbitButton.className = 'tool orbit-tool';
orbitButton.textContent = '360°'; orbitButton.title = 'Rotate around the station';
orbitButton.setAttribute('aria-label', 'Toggle 360 degree view'); orbitButton.setAttribute('aria-pressed', 'false');
document.querySelector('.toolbar').insertBefore(orbitButton, document.querySelector('#reset'));
const waterStatus = document.createElement('div'); waterStatus.className = 'water-status';
waterStatus.setAttribute('role', 'status'); waterStatus.textContent = 'Nearby fire · Use the water button';
document.querySelector('.app-shell').append(waterStatus);
function createWorld(){
  const container = document.querySelector('#scene');
  scene = new THREE.Scene(); scene.background = null;
  camera = new THREE.PerspectiveCamera(35, innerWidth/innerHeight, .1, 100);
  const initial = () => { camera.position.set(15,5.5,18); controls.target.set(2.4,1.4,.4); controls.update(); };
  renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true }); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setSize(innerWidth,innerHeight); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25; container.appendChild(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 9; controls.maxDistance = 23; controls.minPolarAngle = .35; controls.maxPolarAngle = Math.PI/2.1; initial(); controls.enabled = false;
  controls.minAzimuthAngle = -Infinity; controls.maxAzimuthAngle = Infinity;
  controls.maxDistance = 32;
  controls.autoRotateSpeed = .8;
  orbitButton.addEventListener('click', () => {
    controls.autoRotate = !controls.autoRotate;
    orbitButton.classList.toggle('active', controls.autoRotate);
    orbitButton.setAttribute('aria-pressed', String(controls.autoRotate));
  });
  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(environment, .04).texture;
  environment.dispose(); pmrem.dispose();
  renderer.toneMappingExposure = .95;
  scene.add(new THREE.HemisphereLight(0xdce7f1,0x655c50,1.3)); const sun = new THREE.DirectionalLight(0xffecd5,3.2); sun.position.set(-6,12,7); sun.castShadow = true; sun.shadow.mapSize.set(2048,2048); Object.assign(sun.shadow.camera,{left:-16,right:16,top:16,bottom:-16}); sun.shadow.normalBias = .025; sun.shadow.bias = -.0001; scene.add(sun);
  const mat = (color, roughness=.8, metalness=0) => new THREE.MeshStandardMaterial({color,roughness,metalness});
  const red = new THREE.MeshPhysicalMaterial({color:'#a91e16',roughness:.28,metalness:.25,clearcoat:1,clearcoatRoughness:.18}), dark = mat('#252b2e'), cream = mat('#bcb8aa'), trim = mat('#e0e2dd'), steel = mat('#a5adb3',.26,.85), asphalt = mat('#43484b'), glass = new THREE.MeshPhysicalMaterial({color:'#233d49',roughness:.08,metalness:.35,clearcoat:1}), tire = mat('#171a1b'), terracotta = mat('#655a51'), green = mat('#475440');
  // Deterministic, local surface maps: aggregate, plaster and rubber stay crisp at close range.
  function surface(material, base, variation, repeat, bump){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
    const ctx=canvas.getContext('2d');const pixels=ctx.createImageData(256,256);let seed=71;
    for(let i=0;i<pixels.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const n=((seed>>>16)/65535-.5)*variation;for(let c=0;c<3;c++)pixels.data[i+c]=base[c]+n;pixels.data[i+3]=255;}
    ctx.putImageData(pixels,0,0);const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(repeat,repeat);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());material.map=texture;
    const relief=texture.clone();relief.colorSpace=THREE.NoColorSpace;relief.needsUpdate=true;material.bumpMap=relief;material.bumpScale=bump;
  }
  surface(asphalt,[155,158,160],65,8,.035);surface(cream,[221,218,209],24,3,.018);surface(tire,[190,190,190],45,3,.012);
  function box(w,h,d,material,x,y,z,parent=scene){ const radius=Math.min(.016,w*.06,h*.06,d*.06);const mesh = new THREE.Mesh(new RoundedBoxGeometry(w,h,d,2,radius),material); mesh.position.set(x,y,z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; }
  function cylinder(r1,r2,h,material,x,y,z,parent=scene,segments=20){const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,segments),material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
  function textLabel(text,w,h,x,y,z,parent=scene,bg='#e6deca',fg='#3e493d',size=70){const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const context=canvas.getContext('2d');context.fillStyle=bg;context.fillRect(0,0,1024,256);context.fillStyle=fg;context.font=`bold ${size}px Arial`;context.textAlign='center';context.textBaseline='middle';context.fillText(text,512,128);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:texture,roughness:1}));mesh.position.set(x,y,z);parent.add(mesh);return mesh;}
  const world = new THREE.Group(); world.position.y=-.55; scene.add(world);
  box(10,.35,8,cream,0,0,0,world);box(9.85,.08,7.85,mat('#c8c7ac'),0,.21,0,world);box(9.7,.06,3.15,asphalt,0,.28,2.3,world);box(9.7,.16,.28,trim,0,.29,.6,world);
  for(let x=-4;x<5;x+=1.5)box(.75,.015,.06,trim,x,.325,3.5,world);
  // Station facade and appliance bay.
  box(6,2.85,3.3,cream,-.5,1.68,-1.3,world);box(6.2,.24,3.5,terracotta,-.5,3.22,-1.3,world);box(6.3,.1,3.6,red,-.5,3.37,-1.3,world);
  box(3.25,2.15,.04,dark,-1.25,1.42,.365,world);
  for(let y=.5;y<2.4;y+=.18)box(3.1,.045,.055,mat('#596052'),-1.25,y,.4,world);
  box(.16,2.4,.16,trim,-2.97,1.48,.47,world);box(.16,2.4,.16,trim,.47,1.48,.47,world);box(3.6,.14,.2,trim,-1.25,2.67,.47,world);
  box(1.03,1.9,.06,green,1.48,1.25,.4,world);box(.8,1.03,.03,glass,1.48,1.54,.45,world);box(.06,1,.03,trim,1.48,1.54,.48,world);box(.8,.06,.03,trim,1.48,1.54,.48,world);cylinder(.04,.04,.03,steel,1.8,1.0,.5,world).rotation.x=Math.PI/2;
  textLabel('FIRE & RESCUE',4.2,.46,-.5,2.95,.49,world,'#e4d9b9','#8d372b',90);
  textLabel('07',.48,.3,1.48,2.4,.48,world,'#e4d9b9','#3e493d',145);
  // Side windows face the orbiting camera.
  for(let z of [-2.2,-.9]){box(.03,1,.8,glass,2.51,1.7,z,world);box(.05,.08,.85,trim,2.54,1.7,z,world);box(.05,1.05,.07,trim,2.54,1.7,z,world);}
  const truck = new THREE.Group();truck.position.set(-.75,.38,1.65);world.add(truck);
  box(4.7,.3,1.55,dark,0,.47,0,truck);box(2.7,1.35,1.65,red,-.8,1.15,0,truck);box(1.7,1.68,1.7,red,1.35,1.35,0,truck);box(1.7,.14,1.8,trim,1.35,2.23,0,truck);
  box(.05,.74,1.45,glass,2.22,1.75,0,truck);box(1.18,.74,.035,glass,1.4,1.75,.865,truck);box(1.18,.74,.035,glass,1.4,1.75,-.865,truck);box(.06,.78,.05,red,1.52,1.75,.89,truck);
  box(4.35,.18,.045,trim,0,.95,.85,truck);box(4.35,.18,.045,trim,0,.95,-.85,truck);
  for(let x of [-1.65,-.65,.3]){box(.8,.93,.04,steel,x,1.36,.845,truck);for(let y=1;y<1.8;y+=.1)box(.78,.012,.045,dark,x,y,.875,truck);box(.2,.05,.04,dark,x,1.33,.9,truck);}
  textLabel('FIRE  •  RESCUE',1.18,.24,1.36,1.02,.884,truck,'#f2ead9','#9c3526',94);
  const frontNumber=textLabel('07',.55,.3,2.255,1.12,0,truck,'#bc3b2d','#fff2d5',140);frontNumber.rotation.y=Math.PI/2;
  box(.15,.24,1.88,steel,2.25,.65,0,truck);box(.05,.4,.85,dark,2.23,1.08,0,truck);for(let z=-.4;z<.5;z+=.13)box(.075,.035,.78,steel,2.26,1.01+z*.5,0,truck);
  for(let z of [-.62,.62])box(.08,.23,.29,mat('#fff5c5'),2.255,1.12,z,truck);
  for(let x of [-1.55,1.45])for(let z of [-.88,.88]){const wheel=cylinder(.46,.46,.27,tire,x,.48,z,truck,32);wheel.rotation.x=Math.PI/2;const hub=cylinder(.25,.25,.285,steel,x,.48,z,truck);hub.rotation.x=Math.PI/2;const center=cylinder(.105,.105,.3,dark,x,.48,z,truck);center.rotation.x=Math.PI/2;}
  // Roof ladder, hose reel, and emergency light bar.
  for(let z of [-.46,.46])box(3.6,.065,.065,steel,-.15,2.36,z,truck);for(let x=-1.85;x<1.7;x+=.28)box(.055,.055,.97,steel,x,2.36,0,truck);
  box(1.2,.1,.35,dark,1.3,2.48,0,truck);
  const lights=[];for(let z of [.36,-.36]){const material=mat(z>0?'#ff3429':'#4b87bc');material.emissive.set(z>0?'#ff2410':'#337fff');material.emissiveIntensity=.15;lights.push(box(.4,.22,.25,material,1.3,2.61,z,truck));}
  const castLights=lights.map((lamp,index)=>{const light=new THREE.PointLight(index===0?0xff3025:0x357bff,0,13,1.6);light.position.copy(lamp.position);light.position.y+=.15;truck.add(light);return light;});
  const lampWorld=new THREE.Vector3();
  const hose=cylinder(.35,.35,.5,mat('#cfb383'),-.95,2.03,0,truck);hose.rotation.x=Math.PI/2;
  for(let z of [-.25,.25]){const reel=cylinder(.39,.39,.055,red,-.95,2.03,z,truck);reel.rotation.x=Math.PI/2;}
  // Station details give the scene a handmade, lived-in character.
  function cone(x,z){cylinder(.04,.18,.48,mat('#e27538'),x,.56,z,world);cylinder(.095,.12,.09,trim,x,.56,z,world);box(.4,.06,.4,dark,x,.32,z,world);}
  cone(2.5,2.65);cone(3.3,2.65);
  box(.95,.45,.44,terracotta,3.52,.51,-2.5,world);for(let x of [3.25,3.55,3.85]){cylinder(.035,.04,.55,dark,x,.9,-2.5,world);const bush=new THREE.Mesh(new THREE.IcosahedronGeometry(.37,1),green);bush.position.set(x,1.25,-2.5);world.add(bush);}
  cylinder(.07,.09,4.2,steel,-4,2.32,-2.6,world);const flag=box(1.02,.59,.025,red,-3.45,3.97,-2.6,world);textLabel('07',.6,.4,-3.45,3.97,-2.57,world,'#bc3b2d','#f4ead3',145);
  box(.55,1,.4,green,3.25,.79,-.3,world);textLabel('SAFETY',.5,.2,3.25,1.12,-.09,world,'#6d7b49','#f2ead9',100);
  cylinder(.17,.17,.7,red,3.25,.65,.6,world);cylinder(.1,.1,.12,dark,3.25,1.03,.6,world);box(.55,.12,.16,red,3.25,.78,.6,world);
  const bench=mat('#95704b');box(1.45,.12,.46,bench,3.47,.68,-1.35,world);box(1.45,.47,.09,bench,3.47,.95,-1.58,world);for(let x of [2.95,4])box(.07,.45,.35,dark,x,.43,-1.35,world);
  // Extend the forecourt into its surroundings rather than a floating display plinth.
  const ground=mat('#98958b');surface(ground,[217,215,208],35,45,.025);
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(200,200),ground);plane.rotation.x=-Math.PI/2;plane.position.y=-.36;plane.receiveShadow=true;scene.add(plane);
  scene.fog=new THREE.Fog('#e8e7e1',28,65);
  // Expansion joints, guttering and facade masonry give a readable architectural scale.
  for(let x=-4.5;x<5;x+=1.2)box(.012,.012,3,mat('#6f7474'),x,.325,2.2,world);
  for(let y=.55;y<2.7;y+=.24){box(5.9,.013,.016,mat('#9e9a91'),-.5,y,.358,world);for(let x=-3.3;x<2.4;x+=.6){const joint=box(.013,.22,.016,mat('#9e9a91'),x+(Math.round(y/.24)%2)*.3,y+.11,.358,world);}}
  box(6.3,.11,.13,steel,-.5,3.27,.49,world);cylinder(.045,.045,2.9,steel,2.4,1.73,.48,world);
  // Mirrors, door seams, access steps, tread and wheel bolts on the appliance.
  for(const side of [-1,1]){
    box(.07,.48,.07,dark,1.95,1.7,side*1.02,truck);box(.16,.3,.12,steel,1.95,1.87,side*1.08,truck);
    box(.035,.68,.028,dark,.74,1.13,side*.87,truck);box(.19,.045,.04,steel,1.65,1.27,side*.9,truck);box(.85,.09,.22,steel,1.3,.54,side*.91,truck);
    for(const x of [-1.55,1.45]){
      for(let a=0;a<Math.PI*2;a+=Math.PI/24){const tread=box(.075,.035,.29,tire,x+Math.sin(a)*.456,.48+Math.cos(a)*.456,side*.88,truck);tread.rotation.z=-a;}
      for(let a=0;a<Math.PI*2;a+=Math.PI/3){const bolt=cylinder(.028,.028,.025,steel,x+Math.sin(a)*.17,.48+Math.cos(a)*.17,side*1.035,truck,8);bolt.rotation.x=Math.PI/2;}
    }
  }
  for(const z of [-.43,.43]){const wiper=box(.025,.44,.025,dark,2.26,1.57,z,truck);wiper.rotation.x=.35;}
  addRealisticSurroundings({scene, world, truck, box, cylinder, mat, surface, steel, dark, trim, red});
  detailFireTruck({truck, box, cylinder, steel, dark, red, renderer});
  batchStaticSurroundings(world, truck);
  let response;
  function setSiren(value) {
    siren = value; sirenGlow.classList.toggle('is-on', value);
    const button = document.querySelector('#lights'); button.classList.toggle('active', value); button.setAttribute('aria-pressed', String(value));
  }
  response = createIncidentResponse({world, truck, cylinder, box, steel, dark, reduced, button:waterButton, status:waterStatus, onSiren:setSiren});
  // Architecture is stationary; avoid redrawing its shadow map every animation frame.
  renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
  let previousFrame, lastShadowFrame = 0;
  const points=[['about',new THREE.Vector3(1.5,2.0,-.1)],['experience',new THREE.Vector3(-1.4,2.1,2.1)],['training',new THREE.Vector3(3.5,.65,1)]];
  function resize(){const w=container.clientWidth,h=container.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.zoom=w<700?Math.min(.65,w/h*1.03):.83;camera.setViewOffset(w,h,0,-h*.10,w,h);camera.updateProjectionMatrix();}
  resize();window.addEventListener('resize',resize);
  document.querySelector('#reset').addEventListener('click',()=>{
    controls.autoRotate = false; orbitButton.classList.remove('active'); orbitButton.setAttribute('aria-pressed','false'); initial();
  });
  document.querySelector('#lights').addEventListener('click',()=>setSiren(!siren));
  const raycaster=new THREE.Raycaster();let pointerDown;
  renderer.domElement.addEventListener('pointerdown',event=>{pointerDown=[event.clientX,event.clientY];});
  renderer.domElement.addEventListener('pointerup',event=>{if(!pointerDown||Math.hypot(event.clientX-pointerDown[0],event.clientY-pointerDown[1])>5||!started)return;const bounds=renderer.domElement.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1),camera);if(raycaster.intersectObjects(truck.children,true).length)openSection('experience');});
  renderer.setAnimationLoop(time=>{
    if(backdrop.hidden) controls.update();
    const dt = previousFrame === undefined ? 0 : (time - previousFrame) / 1000;
    previousFrame = time;
    if(started && backdrop.hidden && !document.hidden) {
      response.update(dt, time / 1000);
      if(response.state === 'responding' && time - lastShadowFrame > 120) { renderer.shadowMap.needsUpdate = true; lastShadowFrame = time; }
    }
    lights.forEach((light,i)=>{
      const pulse=reduced ? .6 : (Math.sin(time*Math.PI/650+i*Math.PI)+1)/2;
      const strength=siren ? pulse**3 : 0;
      light.material.emissiveIntensity=.15+strength*4;castLights[i].intensity=strength*18;
      sirenGlow.children[i].style.opacity=String(strength*.65);
      if(siren){light.getWorldPosition(lampWorld);lampWorld.project(camera);sirenGlow.children[i].style.setProperty('--light-x',`${(lampWorld.x*.5+.5)*100}%`);sirenGlow.children[i].style.setProperty('--light-y',`${(-lampWorld.y*.5+.5)*100}%`);}
    });
    for(const [id,position]of points){const location=id==='experience'?truck.localToWorld(new THREE.Vector3(0,2.2,0)):position.clone().add(world.position);const point=location.project(camera);const button=document.querySelector('#spot-'+id);button.style.left=`${(point.x*.5+.5)*container.clientWidth}px`;button.style.top=`${(-point.y*.5+.5)*container.clientHeight}px`;button.style.opacity=point.z>1?'0':'1';button.style.pointerEvents=point.z>1?'none':'auto';}
    if(backdrop.hidden)renderer.render(scene,camera);
  });
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();document.querySelector('.hint').textContent='3D rendering paused. Refresh to restore the scene.';});
}
let sceneReady=false;
try{createWorld();sceneReady=true;}catch(error){console.error(error);waterStatus.hidden=true;document.querySelector('#scene').innerHTML='<div class="fallback"><h2>Your station is ready.</h2><p>This device could not start the 3D view. You can still explore the officer, service, and contact sections using the navigation.</p></div>';document.querySelector('.hotspots').hidden=true;document.querySelector('.toolbar').hidden=true;document.querySelector('.hint').hidden=true;}
requestAnimationFrame(()=>{document.querySelector('.progress-bar').style.width='100%';document.querySelector('#percent').textContent='100';document.querySelector('.progress-label').firstChild.textContent='STATION READY · ';document.querySelector('.start').disabled=false;});
document.querySelector('.start').addEventListener('click',()=>{started=true;document.querySelector('.loader').classList.add('departed');document.querySelector('.loader').setAttribute('inert','');if(sceneReady)controls.enabled=true;document.querySelector('nav button').focus();const requestedSection=new URLSearchParams(window.location.search).get('section');if(!staticDeployment && ['vault','contact'].includes(requestedSection))openSection(requestedSection);});
