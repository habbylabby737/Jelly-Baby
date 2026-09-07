import assert from 'node:assert/strict';
import { Box3, Group, Scene } from 'three/webgpu';
import { loadModel } from './load-model.mjs';
import { SoftBody } from '../src/physics/soft-body.js';
import { PHYS } from '../src/physics/constants.js';
import { Locomotion } from '../src/game/locomotion.ts';
import { HEAD_WEARABLES, WEARABLE_TABLE } from '../src/game/wearable-physics.ts';
import { WearableFacility } from '../src/game/wearable-facility.ts';

function moveBody(body,x,z) {
  const dx=x-body.center.x,dz=z-body.center.z;
  for(let i=0;i<body.x.length;i+=3){body.x[i]+=dx;body.x[i+2]+=dz;}
  body.updateCenter();body.updateSurface();body.grounded=true;body.wake();
}

function boxPenetration(body,box) {
  const positions=body.surface.positions;let maximum=0;
  for(let i=0;i<positions.length;i+=3) {
    const dx=positions[i]-box.center.x,dy=positions[i+1]-box.center.y,dz=positions[i+2]-box.center.z;
    const qx=dx*box.xAxis.x+dy*box.xAxis.y+dz*box.xAxis.z;
    const qy=dx*box.yAxis.x+dy*box.yAxis.y+dz*box.yAxis.z;
    const qz=dx*box.zAxis.x+dy*box.zAxis.y+dz*box.zAxis.z;
    maximum=Math.max(maximum,Math.min(box.halfSize.x-Math.abs(qx),box.halfSize.y-Math.abs(qy),box.halfSize.z-Math.abs(qz)));
  }
  return maximum;
}

const scene=new Scene(),babyGroup=new Group(),body=new SoftBody(loadModel()),rig=new Locomotion(body);
scene.add(babyGroup);
let shadowGroup,shadowEnvelope;
const facility=new WearableFacility(scene,body,babyGroup,rig,{add(group,envelope){shadowGroup=group;shadowEnvelope=envelope;}});
assert.equal(shadowGroup,facility.visual.group,'table registers its complete visual group for shadows');
assert(shadowEnvelope.containsBox(new Box3().setFromObject(facility.visual.group)),'shadow envelope contains the table and its wearables');
assert.equal(facility.visual.collisionBoxes.length,1,'table uses one simple collision box');
facility.visual.group.traverse(object=>{
  if(!object.isMesh)return;
  assert(object.castShadow&&object.receiveShadow,`${object.name} has full shadow flags`);
  for(const value of object.geometry.attributes.position.array)assert(Number.isFinite(value),`${object.name} has finite geometry`);
});
assert.deepEqual(facility.visual.items.map(item=>item.root.name),['floral-crown','top-hat','baseball-cap']);

moveBody(body,WEARABLE_TABLE.x+HEAD_WEARABLES[0].slotX,WEARABLE_TABLE.z);
assert.equal(facility.physics.availableIndex,0,'nearest slot is the floral crown');
assert(Number.isFinite(facility.interactionDistance));
assert.equal(facility.action,'Wear Floral Crown');assert.equal(facility.mobileAction,'Wear Floral Crown');
assert(facility.interact(),'wear interaction succeeds');
assert.equal(facility.physics.wornIndex,0);assert.equal(facility.visual.items[0].root.parent,babyGroup);
facility.update();babyGroup.updateMatrixWorld(true);
const wornBounds=new Box3().setFromObject(facility.visual.items[0].root);
assert(wornBounds.min.toArray().every(Number.isFinite)&&wornBounds.max.toArray().every(Number.isFinite),'worn crown follows a finite head anchor');

assert.equal(facility.interact(),false,'taking off is unavailable while still at the table');
let jumpEvents=0;rig.onJump=()=>{jumpEvents++;facility.jumpFromNormalLocomotion();};
rig.jump();rig.step(PHYS.step);assert.equal(jumpEvents,1,'only the normal locomotion jump emits the accessory event');
let peak=0;for(let i=0;i<240;i++){facility.step(PHYS.step);peak=Math.max(peak,facility.physics.hopOffset);}
assert(peak>.023&&peak<.0252,`wearable hop reaches about 2.5 cm (${peak})`);
assert.equal(facility.physics.hopOffset,0,'wearable lands back on the head');

moveBody(body,WEARABLE_TABLE.x+.25,WEARABLE_TABLE.z);
assert(Number.isFinite(facility.interactionDistance));
assert.equal(facility.action,'Take off Floral Crown');assert.equal(facility.mobileAction,'Take off Floral Crown');
assert(facility.interact(),'take-off interaction succeeds');
assert.equal(facility.physics.wornIndex,null);assert.equal(facility.visual.items[0].root.parent,facility.visual.group);
assert.equal(facility.visual.items[0].root.position.x,HEAD_WEARABLES[0].slotX,'crown returns to its original slot');

const collisionBody=new SoftBody(loadModel()),collisionRig=new Locomotion(collisionBody);
const collisionFacility=new WearableFacility(new Scene(),collisionBody,new Group(),collisionRig,{add(){}});
moveBody(collisionBody,WEARABLE_TABLE.x,WEARABLE_TABLE.z-WEARABLE_TABLE.depth/2-.028);
const before=boxPenetration(collisionBody,collisionFacility.visual.collisionBoxes[0]);
collisionFacility.afterStep();collisionBody.updateSurface();
const after=boxPenetration(collisionBody,collisionFacility.visual.collisionBoxes[0]);
assert(before>0&&after<1e-7,'table box resolves a shallow approach before the body can pass through');
collisionFacility.dispose();facility.reset();facility.dispose();
console.log('Wearable table geometry, selection, head hop, take-off, shadows and collision passed',{peak,before,after});
