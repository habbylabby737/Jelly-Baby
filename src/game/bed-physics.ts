import type { SoftBody } from '../physics/soft-body.js';
import { PHYS } from '../physics/constants.js';

export const BED={x:.165,z:.205,width:.112,length:.148,top:.036,bodyY:.066,bodyZ:.008,radius:.14};

const S=Math.sin(.12),C=Math.cos(.12);

/** Compliant supine support; the FEM body retains deformation and volume. */
export class BedPhysics {
  active=false;
  time=0;
  readonly body:SoftBody;
  constructor(body:SoftBody){this.body=body;}
  get nearby(){return !this.body.grab&&this.body.grounded&&Math.hypot(this.body.center.x-BED.x,this.body.center.z-BED.z)<BED.radius;}
  toggle(){
    if(this.active){this.leave();return true;}
    if(!this.nearby)return false;
    this.active=true;this.time=0;
    const b=this.body;
    for(let j=0;j<b.x.length;j+=3){b.x[j]=BED.x+b.rest[j];b.x[j+1]=BED.bodyY+S*b.rest[j+1]+C*b.rest[j+2];b.x[j+2]=BED.z+BED.bodyZ-C*b.rest[j+1]+S*b.rest[j+2];}
    this.sync();return true;
  }
  private sync(){const b=this.body;b.previous.set(b.x);b.velocity.fill(0);b.wake();b.updateCenter();b.surfaceDirty=true;}
  leave(){
    const b=this.body;
    for(let j=0;j<b.x.length;j+=3){const y=b.x[j+1]-BED.bodyY,z=b.x[j+2]-BED.z-BED.bodyZ;b.x[j]-=.105;b.x[j+1]=S*y-C*z+PHYS.floor+.003;b.x[j+2]=BED.z+C*y+S*z;}
    this.active=false;b.canSleep=true;this.sync();
  }
  step(h:number){
    if(!this.active)return;
    this.time+=h;const b=this.body;b.canSleep=false;b.wake();
    for(let j=0;j<b.x.length;j+=3){
      const chest=Math.exp(-(((b.rest[j+1]-.029)/.016)**2));
      const breath=.00065*Math.sin(this.time*Math.PI*2/3.8)*chest;
      const tx=BED.x+b.rest[j],ty=BED.bodyY+S*b.rest[j+1]+C*b.rest[j+2]+breath,tz=BED.z+BED.bodyZ-C*b.rest[j+1]+S*b.rest[j+2];
      b.velocity[j]+=(1800*(tx-b.x[j])-65*b.velocity[j])*h;
      b.velocity[j+1]+=(1800*(ty-b.x[j+1])-65*b.velocity[j+1]+PHYS.gravity)*h;
      b.velocity[j+2]+=(1800*(tz-b.x[j+2])-65*b.velocity[j+2])*h;
    }
  }
  reset(){this.active=false;this.time=0;this.body.canSleep=true;}
}
