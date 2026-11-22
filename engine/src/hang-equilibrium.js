/* ---------------- hanging equilibrium ----------------
   A panel hangs from one point H. Strings from its children pull straight
   down at their attach points, and its own weight acts at its centre of
   mass. In the panel's own vertical plane, with X right and Y down measured
   from H, torque balance after tilting by theta (right end up = +theta) is
        sum m*(X*cos(theta) + Y*sin(theta)) = 0
   =>   theta = atan2( -sum m*X , sum m*Y ).
   It is a stable hang only when the masses are below H (sum m*Y > 0): that
   is why a bent panel hung from the top of its arch tilts and settles.
     slope:'auto'      -> tilt is computed from the shape's `attach` point.
     targetSlope:<deg> -> the tilt you want; the engine solves where along the
                          shape's y axis (its line of symmetry) `attach` must
                          be to get it, and reports that for building. */
function pointInPoly(pts, x, y){
  let inside = false;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++){
    const [xi,yi]=pts[i], [xj,yj]=pts[j];
    if(((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi)+xi)) inside = !inside;
  }
  return inside;
}

function childFlatPoint(node, c){
  return c.at ? c.at : [c.offset, (c.anchorY !== undefined ? c.anchorY : 1) * node.size];
}

// Hanging-equilibrium model for one shape, built from the gram masses (node._m, massOf).
// eq(h, ax) evaluates the equilibrium if the string meets the shape at flat point (ax, h).
function hangModel(node){
  const fr = shapeFrame(node);
  const outline = node._outline || (node._outline = outlinePoints(node.shape, node.size));
  // centre of mass of the (bent) sheet: average over a grid inside the outline
  let cx=0, cy=0, cz=0, n=0;
  const S = node.size, G = 48;
  for(let i=0;i<G;i++) for(let j=0;j<G;j++){
    const x = -S*1.3 + 2.6*S*(i+0.5)/G, y = -S*1.3 + 2.6*S*(j+0.5)/G;
    if(!pointInPoly(outline, x, y)) continue;
    const r = fr.raw(x,y); cx+=r[0]; cy+=r[1]; cz+=r[2]; n++;
  }
  const com = n > 0 ? [cx/n, cy/n, cz/n] : [0, 0, 0];
  node._rawCoM = com;
  const selfM = node._m !== undefined ? node._m
              : (node.weight !== undefined ? node.weight : weightFromShape(node.shape, node.size, node.density));
  const masses = [{m:selfM, r:com}];
  for(const c of (node.children||[])){
    const q = childFlatPoint(node, c);
    masses.push({m:massOf(c.node), r:fr.raw(q[0], q[1])});
  }
  const at = attachOf(node);
  function eq(h, ax){
    const H = fr.raw(ax === undefined ? at[0] : ax, h);
    let sx=0, sy=0, totalM=0;
    for(const k of masses){
      sx += k.m*(k.r[0]-H[0]);
      sy += k.m*(k.r[1]-H[1]);
      totalM += k.m;
    }
    const depth = totalM > 0 ? Math.hypot(sx, sy) / totalM : 0;
    // centre of mass (almost) exactly at the hang point: neutral, any in-plane tilt stays put
    const neutral = depth < 0.01 * S;
    return {
      theta: neutral ? 0 : Math.atan2(-sx, sy)*180/Math.PI,
      stable: !neutral && sy > 0,
      neutral,
      inverted: !neutral && sy < 0,   // stable equilibrium needs the sheet upside down
      metacentricDepth: depth,
      syPerMass: totalM > 0 ? sy / totalM : 0
    };
  }
  return { eq, at };
}

function solveHang(node){
  const M = hangModel(node), eq = M.eq, S = node.size;
  const ax = M.at[0];
  let h = M.at[1];
  node._targetSlopeFailed = false;
  if(node.targetSlope !== undefined){
    const T = node.targetSlope, STEPS = 600;
    let prev = null, found = null;
    for(let i=0;i<=STEPS;i++){
      const hh = -S + 2*S*i/STEPS, e = eq(hh);
      if(e.stable && prev && prev.e.stable && (prev.e.theta-T)*(e.theta-T) <= 0){
        const cand = {lo:prev.h, hi:hh};
        if(!found || Math.abs(hh) < Math.abs(found.hi)) found = cand;
      }
      prev = {h:hh, e};
    }
    if(found){
      let lo = found.lo, hi = found.hi;
      const flo = eq(lo).theta - T;
      for(let k=0;k<50;k++){
        const mid = (lo+hi)/2, fm = eq(mid).theta - T;
        if(fm*flo <= 0) hi = mid; else lo = mid;
      }
      h = (lo+hi)/2;
    } else {
      node._targetSlopeFailed = true;
      console.warn('No stable hang point gives slope', T, 'for a shape of size', node.size);
    }
    node.attach = [ax, h];
  }
  const e = eq(h);
  node._slopeDeg = e.theta;
  node._hangStable = !e.inverted;
  node._hangNeutral = e.neutral;
  node._hangMetaDepth = e.metacentricDepth;
  if(e.inverted) console.warn('Unstable hang (masses above the hang point) for a shape of size', node.size);
}

function resolveTilts(node){
  for(const c of (node.children||[])) resolveTilts(c.node);
  if(node.type === 'shape' && (node.slope === 'auto' || node.targetSlope !== undefined)) solveHang(node);
}

