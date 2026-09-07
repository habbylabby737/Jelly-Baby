/** A relaxed tension envelope over the contact surface. Convex supported tops
 * stay fitted; unsupported sides bridge into a broad drape instead of tracing
 * the body's steep silhouette. The opening and mattress hems stay anchored. */
export class BlanketFairing {
  private work=new Float32Array(0);
  smooth(p:Float32Array,columns:number,rows:number){
    if(this.work.length!==p.length)this.work=new Float32Array(p.length);
    // A few local smoothing passes only polish the same tight ridge. Relax
    // across ~2 cm of fabric so the skirt can detach from hidden body contours.
    for(let pass=0;pass<128;pass++){
      this.work.set(p);
      let largestChange=0;
      for(let z=1;z<rows-1;z++)for(let x=1;x<columns-1;x++){
        const j=(z*columns+x)*3+1;
        // Symmetric stencil removes the directional crease left by triangle
        // contact order. Jacobi updates avoid sweeping the crease sideways.
        const mean=(p[j-3]+p[j+3]+p[j-columns*3]+p[j+columns*3])*.25;
        this.work[j]=Math.max(p[j],p[j]+.65*(mean-p[j]));
        largestChange=Math.max(largestChange,this.work[j]-p[j]);
      }
      p.set(this.work);
      if(largestChange<1e-7)break;
    }
  }
}
