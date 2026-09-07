import * as THREE from 'three/webgpu';
import { Fn, float, normalWorldGeometry, positionWorld, texture, uniform, vec2, vec4 } from 'three/tsl';

export const SURFACE_SHADOW_SIZE=2048;
export const SURFACE_SHADOW_BIAS=.0002; // metres, independent of the fitted depth range

/** Local window occlusion between raised surfaces, independent of table masks. */
export class SurfaceShadows {
  private readonly camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,4);
  private readonly matrixNode=uniform(new THREE.Matrix4());
  private readonly directionNode;
  private readonly depthBiasNode=uniform(SURFACE_SHADOW_BIAS);
  private readonly filterXNode=uniform(new THREE.Vector2());
  private readonly filterZNode=uniform(new THREE.Vector2());
  private readonly material=new THREE.MeshBasicNodeMaterial({side:THREE.DoubleSide,toneMapped:false});
  private readonly facilities=new THREE.Scene();
  private readonly baby=new THREE.Scene();
  private readonly facilityTarget=new THREE.RenderTarget(SURFACE_SHADOW_SIZE,SURFACE_SHADOW_SIZE,{type:THREE.FloatType,format:THREE.RedFormat});
  private readonly babyTarget=new THREE.RenderTarget(SURFACE_SHADOW_SIZE,SURFACE_SHADOW_SIZE,{type:THREE.FloatType,format:THREE.RedFormat});
  private readonly bounds=new THREE.Box3();
  private readonly casters:{source:THREE.Mesh;proxy:THREE.Mesh;version:number}[]=[];
  private readonly receivers=new Set<THREE.NodeMaterial>();
  private facilityDirty=true;
  private babyDirty=true;
  private readonly windowFraction:number;

  constructor(incoming:THREE.Vector3,windowFraction:number) {
    this.windowFraction=windowFraction;
    this.directionNode=uniform(incoming.clone().negate());
    this.camera.coordinateSystem=THREE.WebGPUCoordinateSystem;
    this.camera.position.copy(incoming).multiplyScalar(-2);
    this.camera.lookAt(0,0,0);this.camera.updateMatrixWorld(true);
    this.material.colorNode=vec4(this.matrixNode.mul(vec4(positionWorld,1)).z,0,0,1);
    for(const scene of [this.facilities,this.baby])scene.background=new THREE.Color(1,1,1);
    for(const target of [this.facilityTarget,this.babyTarget]) {
      target.texture.colorSpace=THREE.NoColorSpace;
      target.texture.minFilter=target.texture.magFilter=THREE.NearestFilter;
      target.texture.generateMipmaps=false;
    }
  }

  add(group:THREE.Group,envelope:THREE.Box3) {
    this.bounds.union(envelope);
    // Only rays through facility receivers can contribute. Keep lateral bounds
    // tight; reserve the rider/jump margin along the light's depth axis only.
    const bounds=this.bounds.clone().applyMatrix4(this.camera.matrixWorldInverse).expandByScalar(.012);
    this.camera.left=bounds.min.x;this.camera.right=bounds.max.x;
    this.camera.bottom=bounds.min.y;this.camera.top=bounds.max.y;
    this.camera.near=Math.max(.01,-bounds.max.z-.25);this.camera.far=-bounds.min.z+.25;
    this.depthBiasNode.value=SURFACE_SHADOW_BIAS/(this.camera.far-this.camera.near);
    this.camera.updateProjectionMatrix();
    this.matrixNode.value.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse);
    group.traverse(object=>{if(object instanceof THREE.Mesh)this.register(object,this.facilities,true);});
    this.facilityDirty=this.babyDirty=true;
  }

  addBaby(mesh:THREE.Mesh) {this.register(mesh,this.baby,false);this.babyDirty=true;}

  /** Reuse the table's 1.5-texel tent spacing, expressed in world metres. */
  setGroundFootprint(span:THREE.Vector2) {
    const m=this.matrixNode.value.elements;
    this.filterXNode.value.set(m[0],-m[1]).multiplyScalar(.5*span.x*1.5/512);
    this.filterZNode.value.set(m[8],-m[9]).multiplyScalar(.5*span.y*1.5/512);
  }

  private occlusion(target:THREE.RenderTarget) {
    return Fn(()=>{
      const clip=this.matrixNode.mul(vec4(positionWorld,1)).toVar();
      const uv=clip.xy.mul(vec2(.5,-.5)).add(.5).toVar();
      const inside=uv.x.greaterThan(0).and(uv.x.lessThan(1)).and(uv.y.greaterThan(0)).and(uv.y.lessThan(1))
        .and(clip.z.greaterThan(0)).and(clip.z.lessThan(1));
      // Solve dz/du,dz/dv on the actual rasterized receiver plane. Comparing
      // every tap to the centre depth makes even a flat tilted beam self-shadow.
      const dx=uv.dFdx(),dy=uv.dFdy(),dz=vec2(clip.z.dFdx(),clip.z.dFdy());
      const determinant=dx.x.mul(dy.y).sub(dx.y.mul(dy.x)).toVar();
      const safeDeterminant=determinant.greaterThanEqual(0).select(determinant.max(1e-12),determinant.min(-1e-12));
      const gradient=vec2(dy.y.mul(dz.x).sub(dx.y.mul(dz.y)),dx.x.mul(dz.y).sub(dy.x.mul(dz.x)))
        .div(safeDeterminant).toVar();
      const mask=float(0).toVar();
      for(let z=-1;z<=1;z++)for(let x=-1;x<=1;x++) {
        const sampleUV=uv.add(this.filterXNode.mul(x)).add(this.filterZNode.mul(z));
        const texel=sampleUV.mul(SURFACE_SHADOW_SIZE).sub(.5).toVar(),base=texel.floor(),fraction=texel.fract();
        const tentWeight=(x===0?2:1)*(z===0?2:1)/16;
        // Interpolate visibility, never depth. The outer tent has exactly the
        // ground shadow's world-space footprint, independent of map resolution.
        for(let by=0;by<=1;by++)for(let bx=0;bx<=1;bx++) {
          const tapUV=base.add(vec2(bx,by)).add(.5).div(SURFACE_SHADOW_SIZE);
          const depth=texture(target.texture,tapUV).r;
          const receiverDepth=clip.z.add(gradient.dot(tapUV.sub(uv))).sub(this.depthBiasNode);
          const weight=(bx?fraction.x:fraction.x.oneMinus()).mul(by?fraction.y:fraction.y.oneMinus()).mul(tentWeight);
          const tapInside=tapUV.x.greaterThan(0).and(tapUV.x.lessThan(1)).and(tapUV.y.greaterThan(0)).and(tapUV.y.lessThan(1));
          mask.addAssign(float(receiverDepth.greaterThan(depth).and(tapInside)).mul(weight));
        }
      }
      return mask.mul(float(inside));
    })();
  }

  private register(source:THREE.Mesh,scene:THREE.Scene,receiveBaby:boolean) {
    const proxy=new THREE.Mesh(source.geometry,this.material);
    proxy.matrixAutoUpdate=false;proxy.frustumCulled=false;scene.add(proxy);
    this.casters.push({source,proxy,version:-1});
    for(const material of Array.isArray(source.material)?source.material:[source.material]) {
      if(!(material instanceof THREE.NodeMaterial)||this.receivers.has(material))continue;
      this.receivers.add(material);
      let visibility=this.occlusion(this.facilityTarget).oneMinus();
      if(receiveBaby)visibility=visibility.mul(this.occlusion(this.babyTarget).oneMinus());
      const facing=normalWorldGeometry.dot(this.directionNode).max(0);
      const attenuation=float(1).sub(visibility.oneMinus().mul(this.windowFraction).mul(facing));
      // Use the physical material's indirect-light occlusion path. Multiplying
      // final output also darkens refracted scenery and creates a painted-on mask.
      material.aoNode=material.aoNode?float(material.aoNode as THREE.Node<'float'>).mul(attenuation):attenuation;
      material.needsUpdate=true;
    }
  }

  update(renderer:THREE.WebGPURenderer) {
    for(const caster of this.casters) {
      caster.source.updateWorldMatrix(true,false);
      let visible=true;
      for(let object:THREE.Object3D|null=caster.source;object;object=object.parent)visible&&=object.visible;
      const position=caster.source.geometry.attributes.position;
      const version=position instanceof THREE.InterleavedBufferAttribute?position.data.version:position.version;
      if(version===caster.version&&caster.proxy.matrix.equals(caster.source.matrixWorld)&&caster.proxy.visible===visible)continue;
      caster.version=version;caster.proxy.matrix.copy(caster.source.matrixWorld);
      caster.proxy.matrixWorldNeedsUpdate=true;caster.proxy.visible=visible;
      if(caster.proxy.parent===this.facilities)this.facilityDirty=true;else this.babyDirty=true;
    }
    if(!this.facilityDirty&&!this.babyDirty)return;
    const previous=renderer.getRenderTarget(),autoClear=renderer.autoClear;
    try {
      renderer.autoClear=true;
      if(this.facilityDirty){renderer.setRenderTarget(this.facilityTarget);renderer.render(this.facilities,this.camera);this.facilityDirty=false;}
      if(this.babyDirty){renderer.setRenderTarget(this.babyTarget);renderer.render(this.baby,this.camera);this.babyDirty=false;}
    } finally {renderer.setRenderTarget(previous);renderer.autoClear=autoClear;}
  }

  dispose() {
    this.facilities.clear();this.baby.clear();this.casters.length=0;this.receivers.clear();
    this.material.dispose();this.facilityTarget.dispose();this.babyTarget.dispose();
  }
}
