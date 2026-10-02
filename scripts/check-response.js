import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createIncidentResponse } from '../src/incident-response.js';

// Canvas pixel generation has no browser dependency beyond this small drawing interface.
globalThis.document = {createElement:() => ({getContext:() => ({
  createImageData:(width,height) => ({data:new Uint8ClampedArray(width * height * 4)}), putImageData(){}
})})};
const handlers = {};
const button = {setAttribute(name,value){this[name]=value;},classList:{toggle(){}},addEventListener(name,callback){handlers[name]=callback;}};
const status = {dataset:{}}, sirens = [];
const world = new THREE.Group(); world.position.y = -.55;
const truck = new THREE.Group(); truck.position.set(-.75,.38,1.65); world.add(truck);
const material = new THREE.MeshStandardMaterial();
function box(w,h,d,mat,x,y,z,parent) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); mesh.position.set(x,y,z); parent.add(mesh); return mesh; }
function cylinder(a,b,h,mat,x,y,z,parent) { const mesh = new THREE.Mesh(new THREE.CylinderGeometry(a,b,h,8),mat); mesh.position.set(x,y,z); parent.add(mesh); return mesh; }
const response = createIncidentResponse({world,truck,box,cylinder,steel:material,dark:material,reduced:false,button,status,
  onSiren:value=>sirens.push(value)});
const home = truck.position.clone();
assert.equal(status.dataset.state,'responding'); assert.equal(button.disabled,true); assert.equal(sirens.at(-1),true);
assert.equal(world.getObjectByName('nearby-building'),undefined);
response.update(2,2); assert.ok(truck.position.distanceTo(home) > .1);
const flames = world.getObjectByName('incident-flames');
assert.ok(flames.children.every(flame=>flame.position.x > 5.5));
response.update(5,7); assert.equal(response.state,'burning'); assert.equal(button.disabled,false);
assert.ok(truck.position.x > 4);
handlers.click(); response.update(3,10); assert.equal(status.dataset.state,'spraying');
handlers.click(); response.update(30,40); assert.equal(status.dataset.state,'burning');
handlers.click(); response.update(4.1,44.1); assert.equal(status.dataset.state,'extinguished'); assert.equal(flames.visible,false);
assert.equal(button['aria-pressed'],'false'); assert.equal(sirens.at(-1),false);
response.update(5,49.1); assert.equal(world.getObjectByName('incident-smoke'),undefined);
handlers.click(); assert.equal(status.dataset.state,'responding'); assert.ok(truck.position.equals(home)); assert.equal(flames.visible,true);
response.update(7,56.1); response.update(2,58.1); assert.equal(status.dataset.state,'spraying');
response.update(7.1,65.2); assert.equal(status.dataset.state,'extinguished');
console.log('Passed: no incident building; fire is away from the station; truck responds; water pauses, extinguishes and replays; lights follow the response; no smoke effect.');
