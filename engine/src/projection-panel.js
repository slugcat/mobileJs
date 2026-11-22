/* ---------------- rendering ---------------- */
const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs){
  const e = document.createElementNS(NS, tag);
  for(const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
function shapePath(shape, size){
  const def = shapeDef(shape, size);
  if(def.kind === 'circle') return el('circle', {r:def.r});
  if(def.kind === 'polygon') return el('polygon', {points:def.points.map(p=>p.join(',')).join(' ')});
  return el('path', {d:def.d});
}

// Local point (lx,0) on a node leaning by `lean` then spun by `yaw` about
// the vertical axis, then projected with camera elevation `camElev`.
function project(lx, lean, yaw){
  const liftY = lx * Math.sin(lean);
  const spanH = lx * Math.cos(lean);
  const dx = spanH * Math.cos(yaw);
  const z  = spanH * Math.sin(yaw);
  const y  = -liftY;
  const ce = Math.cos(camElev), se = Math.sin(camElev);
  return { dx, dy: y * ce + z * se, z: -y * se + z * ce };
}

let gradientCounter = 0;

/* ---------------- 3D panel model ----------------
   Every shape is a thin sheet. Pipeline, all orthographic:
     flat outline -> BEND (one-axis cylinder, arc length preserved)
                  -> ROLL (`orientation`, about the view axis)
                  -> PITCH (`tilt`, about the horizontal axis)
                  -> YAW (live spin, about the vertical string)
                  -> project to screen.
   Shading is Lambert from a fixed light using the true surface normal, so a
   bent panel shows a real light-to-dark gradient that shifts as it spins. */
const LIGHT = (()=>{ const v=[-0.4,-0.6,0.7], m=Math.hypot(v[0],v[1],v[2]); return v.map(a=>a/m); })();
const L_REST = 0.3 + 0.7*LIGHT[2]; // brightness of a flat panel facing the viewer = unshaded base color

// Dense outline samples (shape frame) so bending curves edges smoothly.
function outlinePoints(shape, size){
  const def = shapeDef(shape, size);
  if(def.kind === 'circle'){
    const pts = [];
    for(let i=0;i<72;i++){ const a = i/72*Math.PI*2; pts.push([def.r*Math.cos(a), def.r*Math.sin(a)]); }
    return pts;
  }
  if(def.kind === 'polygon'){
    const pts = [], P = def.points;
    for(let i=0;i<P.length;i++){
      const [x1,y1] = P[i], [x2,y2] = P[(i+1)%P.length];
      const n = Math.max(1, Math.ceil(Math.hypot(x2-x1,y2-y1) / (size/10)));
      for(let k=0;k<n;k++) pts.push([x1+(x2-x1)*k/n, y1+(y2-y1)*k/n]);
    }
    return pts;
  }
  return samplePathD(def.d, 160);
}

function shapeFrame(node){
  const bend = clampBend(node);
  // Default pose: a bent panel hangs from its attach point with the hump on top
  // (tangent plane horizontal there). Flat panels default to facing the viewer.
  const pitch = panelPitch(node);
  const roll = (node.orientation||0)*Math.PI/180;
  const yaw = node._yaw||0;
  const A = (node.bendAxis||0)*Math.PI/180;
  const kappa = bend / node.size;
  const at = attachOf(node);
  const cA=Math.cos(A), sA=Math.sin(A);
  const cr=Math.cos(roll), sr=Math.sin(roll);
  const cp=Math.cos(pitch), sp=Math.sin(pitch);
  const slopeDeg = node._slopeDeg !== undefined ? node._slopeDeg : (typeof node.slope === 'number' ? node.slope : 0);
  const slope = slopeDeg*Math.PI/180, cs=Math.cos(slope), ss=Math.sin(slope);
  const cy=Math.cos(yaw), sy=Math.sin(yaw);
  const ce=Math.cos(camElev), se=Math.sin(camElev);

  function bendPoint(x,y){ // flat (x,y) -> bent 3D, z toward viewer
    const u = x*cA + y*sA, v = -x*sA + y*cA;
    let ub = u, z = 0;
    if(Math.abs(kappa) > 1e-6){ ub = Math.sin(kappa*u)/kappa; z = (1-Math.cos(kappa*u))/kappa; }
    return [ub*cA - v*sA, ub*sA + v*cA, z];
  }
  function rollPitch0(p){ // pose without slope: hanging attitude of the panel
    const x1 = p[0]*cr - p[1]*sr, y1 = p[0]*sr + p[1]*cr, z1 = p[2];
    return [x1, y1*cp - z1*sp, y1*sp + z1*cp];
  }
  function rollPitch(p){
    const q = rollPitch0(p), x2 = q[0], y2 = q[1], z2 = q[2];
    // SLOPE: rotate about the view axis, in the panel's own frame (before spin),
    // so a hanging panel can lean sideways. positive = right end up.
    return [x2*cs + y2*ss, -x2*ss + y2*cs, z2];
  }
  function yawCam(p){ // spin about the vertical string, then camera elevation
    const x3 = p[0]*cy + p[2]*sy, z3 = -p[0]*sy + p[2]*cy, y3 = p[1];
    return [x3, y3*ce + z3*se, -y3*se + z3*ce];
  }
  const A3 = rollPitch(bendPoint(at[0], at[1]));
  const orient = (n)=> yawCam(rollPitch(n)); // rotations only (for normals)
  const point = (x,y)=>{
    const p = rollPitch(bendPoint(x,y));
    return yawCam([p[0]-A3[0], p[1]-A3[1], p[2]-A3[2]]); // attach point -> origin = string end
  };
  // raw(x,y): flat point -> physical position (x right, y DOWN, z toward viewer),
  // before slope, spin and camera. Used to solve the hanging equilibrium.
  const raw = (x,y)=> rollPitch0(bendPoint(x,y));
  // phys(x,y): physical offset from the string end (attach point) after bend, roll, pitch and slope,
  // BEFORE spin and camera. X right, Y down, Z toward viewer. Used for swing-clearance geometry.
  const phys = (x,y)=>{
    const p = rollPitch(bendPoint(x,y));
    return [p[0]-A3[0], p[1]-A3[1], p[2]-A3[2]];
  };
  return { kappa, cA, sA, orient, point, raw, phys };
}

function shadePct(n){ // world normal -> lighten/darken percent (two-sided)
  if(n[2] < 0) n = [-n[0],-n[1],-n[2]];
  const d = Math.max(0, n[0]*LIGHT[0] + n[1]*LIGHT[1] + n[2]*LIGHT[2]);
  return (0.3 + 0.7*d - L_REST) * 90;
}

