import { Vector3 } from 'three/webgpu';
import type { SoftBody } from '../physics/soft-body.js';
import { PHYS } from '../physics/constants.js';

/** The dressing table's world-space footprint, in metres. */
export const WEARABLE_TABLE={
  x:-.155,z:.205,width:.20,depth:.112,height:.061,top:.061,
  slotSpacing:.063,interactionRadius:.135,collisionRadius:.23,
};

/**
 * Each reference asset is kept as a uniform-scale object. The individual
 * scales compensate for the source models' different physical envelopes so
 * their crowns, brims, and rings all fit the same 7 cm jelly head.
 */
export const HEAD_WEARABLES=[
  {id:'floral-crown',label:'Floral Crown',slotX:-WEARABLE_TABLE.slotSpacing,scale:.020,tableLift:.002,headLift:.001,rotationY:0},
  {id:'top-hat',label:'Top Hat',slotX:0,scale:.018,tableLift:.001,headLift:.001,rotationY:0},
  {id:'baseball-cap',label:'Baseball Cap',slotX:WEARABLE_TABLE.slotSpacing,scale:.025,tableLift:.012,headLift:.011,rotationY:0},
] as const;

export type HeadWearableIndex=0|1|2;

const HOP_HEIGHT=.025;

/** Selection, head attachment, and the small free-flight hop of a worn item. */
export class WearablePhysics {
  readonly body:SoftBody;
  private readonly headVertex:number;
  private readonly headBindingIds:Uint32Array;
  private readonly headBindingWeights:Float64Array;
  private readonly anchor=new Vector3();
  private hopHeight=0;
  private hopVelocity=0;
  private hopActive=false;
  wornIndex:HeadWearableIndex|null=null;

  constructor(body:SoftBody) {
    this.body=body;
    const positions=body.surface.positions;
    let highest=-Infinity;
    for(let i=1;i<positions.length;i+=3)highest=Math.max(highest,positions[i]);
    let vertex=-1,best=Infinity;
    for(let i=0;i<positions.length;i+=3) {
      const y=positions[i+1];
      if(y<highest-.003)continue;
      const radial=positions[i]*positions[i]+positions[i+2]*positions[i+2];
      const score=(highest-y)*10+radial;
      if(score<best){best=score;vertex=i/3;}
    }
    if(vertex<0)throw new Error('Unable to find a head anchor for the wearable table');
    this.headVertex=vertex;
    this.headBindingIds=new Uint32Array(4);this.headBindingWeights=new Float64Array(4);
    const offset=vertex*4;
    for(let k=0;k<4;k++) {
      this.headBindingIds[k]=body.surface.bindingIds[offset+k];
      this.headBindingWeights[k]=body.surface.bindingWeights[offset+k];
    }
  }

  get wearing() {return this.wornIndex!==null;}
  get hopOffset() {return this.hopHeight;}

  /** The nearest unoccupied slot, or -1 when no wear interaction is ready. */
  get availableIndex():HeadWearableIndex|-1 {
    if(this.wearing)return -1;
    let bestIndex:HeadWearableIndex|-1=-1,bestDistance=Infinity;
    for(let i=0;i<HEAD_WEARABLES.length;i++) {
      const distance=this.distanceToSlot(i as HeadWearableIndex);
      if(distance<bestDistance){bestDistance=distance;bestIndex=i as HeadWearableIndex;}
    }
    return bestDistance<WEARABLE_TABLE.interactionRadius?bestIndex:-1;
  }

  /** The shared-manager distance for the current contextual affordance. */
  get interactionDistance() {
    if(this.body.grab||!this.body.grounded)return Infinity;
    if(this.wearing) {
      const distance=this.distanceToTable();
      return distance>WEARABLE_TABLE.interactionRadius?distance:Infinity;
    }
    const index=this.availableIndex;
    return index===-1?Infinity:this.distanceToSlot(index);
  }

  get collisionNearby() {
    return Math.hypot(this.body.center.x-WEARABLE_TABLE.x,this.body.center.z-WEARABLE_TABLE.z)<WEARABLE_TABLE.collisionRadius;
  }

  wear(index:HeadWearableIndex) {
    if(this.wearing||this.availableIndex!==index)return false;
    this.wornIndex=index;this.hopHeight=0;this.hopVelocity=0;this.hopActive=false;
    return true;
  }

  takeOff():HeadWearableIndex|-1 {
    if(this.wornIndex===null||!Number.isFinite(this.interactionDistance))return -1;
    const index=this.wornIndex;
    this.wornIndex=null;this.hopHeight=0;this.hopVelocity=0;this.hopActive=false;
    return index;
  }

  /** Called only by the ordinary locomotion jump path, never by facilities. */
  jumpFromNormalLocomotion() {
    if(!this.wearing||this.hopActive)return;
    this.hopHeight=0;
    this.hopVelocity=Math.sqrt(2*PHYS.gravity*HOP_HEIGHT);
    this.hopActive=true;
  }

  step(h:number) {
    if(!this.hopActive)return;
    this.hopVelocity-=PHYS.gravity*h;this.hopHeight+=this.hopVelocity*h;
    if(this.hopHeight<=0&&this.hopVelocity<0) {
      this.hopHeight=0;this.hopVelocity=0;this.hopActive=false;
    }
  }

  headAnchor(out=this.anchor) {
    const x=this.body.x;
    let px=0,py=0,pz=0;
    for(let k=0;k<4;k++) {
      const id=this.headBindingIds[k],weight=this.headBindingWeights[k],offset=id*3;
      px+=x[offset]*weight;py+=x[offset+1]*weight;pz+=x[offset+2]*weight;
    }
    return out.set(px,py,pz);
  }

  slotPosition(index:HeadWearableIndex,out=new Vector3()) {
    const wearable=HEAD_WEARABLES[index];
    return out.set(WEARABLE_TABLE.x+wearable.slotX,WEARABLE_TABLE.top+wearable.tableLift,WEARABLE_TABLE.z);
  }

  reset() {
    this.wornIndex=null;this.hopHeight=0;this.hopVelocity=0;this.hopActive=false;
  }

  private distanceToSlot(index:HeadWearableIndex) {
    const wearable=HEAD_WEARABLES[index];
    return Math.hypot(this.body.center.x-(WEARABLE_TABLE.x+wearable.slotX),this.body.center.z-WEARABLE_TABLE.z);
  }

  private distanceToTable() {
    return Math.hypot(this.body.center.x-WEARABLE_TABLE.x,this.body.center.z-WEARABLE_TABLE.z);
  }

  get headAnchorVertex() {return this.headVertex;}
}
