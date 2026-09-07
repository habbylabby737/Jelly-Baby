import { Box3, Vector3, type Group, type Scene } from 'three/webgpu';
import type { FacilityShadows } from '../graphics/facility-shadows.ts';
import type { SoftBody } from '../physics/soft-body.js';
import { FacilityCollision } from '../physics/facility-collision.ts';
import { HEAD_WEARABLES, WearablePhysics } from './wearable-physics.ts';
import { WearableTable } from '../graphics/wearable-table.ts';
import type { Facility } from './facilities.ts';
import type { Locomotion } from './locomotion.ts';

/** The dressing table owns selection, table collision, and head attachment. */
export class WearableFacility implements Facility {
  readonly id='head-wearable-table';
  readonly label='Wearables';
  readonly physics:WearablePhysics;
  readonly visual:WearableTable;
  private readonly collision:FacilityCollision;
  private readonly babyGroup:Group;
  private readonly rig:Locomotion;
  private readonly anchor=new Vector3();

  constructor(scene:Scene,body:SoftBody,babyGroup:Group,rig:Locomotion,shadows:FacilityShadows) {
    this.physics=new WearablePhysics(body);this.visual=new WearableTable();this.collision=new FacilityCollision(body);
    this.babyGroup=babyGroup;this.rig=rig;scene.add(this.visual.group);
    // The table's wearables can travel with the baby across the play area. The
    // broad, fixed envelope keeps both ground and raised-surface shadow maps
    // valid while the item is worn, including its 2.5 cm hop.
    shadows.add(this.visual.group,new Box3(new Vector3(-.32,0,-.18),new Vector3(.32,.18,.36)));
  }

  get active() {return false;}

  get interactionDistance() {return this.physics.interactionDistance;}

  get action() {
    if(this.physics.wornIndex!==null)return `Take off ${HEAD_WEARABLES[this.physics.wornIndex].label}`;
    const index=this.physics.availableIndex;
    return index===-1?'Wear':`Wear ${HEAD_WEARABLES[index].label}`;
  }

  get mobileAction() {
    if(this.physics.wornIndex!==null)return `Take off ${HEAD_WEARABLES[this.physics.wornIndex].label}`;
    const index=this.physics.availableIndex;
    return index===-1?'Wear':`Wear ${HEAD_WEARABLES[index].label}`;
  }

  interact() {
    if(this.physics.wornIndex!==null) {
      const index=this.physics.takeOff();
      if(index===-1)return false;
      this.visual.setOnTable(index);return true;
    }
    const index=this.physics.availableIndex;
    if(index===-1)return false;
    if(!this.physics.wear(index))return false;
    this.visual.setWorn(index,this.babyGroup);return true;
  }

  step(h:number) {this.physics.step(h);}

  afterStep() {
    if(this.physics.collisionNearby)this.collision.resolveBoxes(this.visual.collisionBoxes);
  }

  update() {
    const index=this.physics.wornIndex;
    if(index===null)return;
    this.physics.headAnchor(this.anchor);this.visual.updateWorn(index,this.anchor,this.rig.yaw,this.physics.hopOffset);
  }

  /** Ordinary locomotion calls this only for its own Space jump impulse. */
  jumpFromNormalLocomotion() {this.physics.jumpFromNormalLocomotion();}

  reset() {this.physics.reset();this.visual.reset();}
  dispose() {this.visual.dispose();}
}
