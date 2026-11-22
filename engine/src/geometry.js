/* ---------------- geometry / area ---------------- */
function shapeDef(shape, size){
  switch(shape){
    case 'disc':
      return {kind:'circle', r:size};
    case 'rect':
      return {kind:'polygon', points:[[-size*1.2,-size*0.8],[size*1.2,-size*0.8],[size*1.2,size*0.8],[-size*1.2,size*0.8]]};
    case 'diamond':
      return {kind:'polygon', points:[[0,-size],[size*0.72,0],[0,size],[-size*0.72,0]]};
    case 'triangle':
      return {kind:'polygon', points:[[0,-size],[size,size*0.8],[-size,size*0.8]]};
    case 'crescent': { // outer circle (r) minus an offset inner circle (0.78r); horns point right
      const r = size, ri = 0.78*r, c = 0.42*r;
      const xh = (r*r - ri*ri + c*c) / (2*c), yh = Math.sqrt(r*r - xh*xh); // where the two circles meet
      const al = Math.atan2(yh, xh), be = Math.atan2(yh, xh - c), N = 72, pts = [];
      for(let i=0;i<=N;i++){ const a = al + (2*Math.PI - 2*al)*i/N; pts.push([r*Math.cos(a), r*Math.sin(a)]); }
      for(let i=1;i<N;i++){ const a = (2*Math.PI - be) - (2*Math.PI - 2*be)*i/N; pts.push([c + ri*Math.cos(a), ri*Math.sin(a)]); }
      return {kind:'polygon', points:pts};
    }
    case 'ovate': // asymmetric leaf: pointed tip at y=-size, fat rounded end at y=+size, axis of symmetry = y axis
      return {kind:'path', d:`M 0 ${-size} C ${size*0.25} ${-size*0.45}, ${size*0.78} ${-size*0.05}, ${size*0.62} ${size*0.5}
                 C ${size*0.52} ${size*0.88}, ${size*0.22} ${size}, 0 ${size}
                 C ${-size*0.22} ${size}, ${-size*0.52} ${size*0.88}, ${-size*0.62} ${size*0.5}
                 C ${-size*0.78} ${-size*0.05}, ${-size*0.25} ${-size*0.45}, 0 ${-size} Z`};
    case 'leaf':
      return {kind:'path', d:`M 0 ${-size} C ${size*1.1} ${-size*0.4}, ${size*1.1} ${size*0.4}, 0 ${size} C ${-size*1.1} ${size*0.4}, ${-size*1.1} ${-size*0.4}, 0 ${-size} Z`};
    case 'blob':
    default:
      return {kind:'path', d:`M ${0} ${-size} C ${size*1.15} ${-size*0.9}, ${size*1.05} ${size*0.3}, ${size*0.35} ${size*0.85}
                 C ${-size*0.5} ${size*1.2}, ${-size*1.15} ${size*0.15}, ${-size*0.85} ${-size*0.45}
                 C ${-size*0.6} ${-size*1.05}, ${size*0.15} ${-size*1.15}, ${0} ${-size} Z`};
  }
}

function shoelace(pts){
  let s = 0;
  for(let i=0;i<pts.length;i++){
    const [x1,y1] = pts[i], [x2,y2] = pts[(i+1)%pts.length];
    s += x1*y2 - x2*y1;
  }
  return Math.abs(s)/2;
}

// Pure-JS sampler for the absolute M/L/C/Z path strings above, so area and outline math
// never need a DOM (verifyMobile runs standalone). Each cubic is flattened, then the polyline
// is resampled at equal arc-length steps from the path start.
function samplePathD(d, n){
  const tok = d.match(/[MLCZ]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || [];
  const dense = [];
  let i = 0, cmd = null, cur = [0,0], start = [0,0];
  const num = ()=> parseFloat(tok[i++]);
  while(i < tok.length){
    if(/^[MLCZ]$/i.test(tok[i])) cmd = tok[i++].toUpperCase();
    else if(cmd === null || cmd === 'Z'){ i++; continue; }
    if(cmd === 'M'){ cur = [num(), num()]; start = cur; dense.push(cur); cmd = 'L'; }
    else if(cmd === 'L'){ cur = [num(), num()]; dense.push(cur); }
    else if(cmd === 'C'){
      const p0 = cur, p1 = [num(),num()], p2 = [num(),num()], p3 = [num(),num()];
      for(let k=1;k<=64;k++){
        const t = k/64, u = 1-t;
        dense.push([
          u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
          u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1]
        ]);
      }
      cur = p3;
    }
    else if(cmd === 'Z'){ dense.push(start); cur = start; }
  }
  const cum = [0];
  for(let k=1;k<dense.length;k++) cum.push(cum[k-1] + Math.hypot(dense[k][0]-dense[k-1][0], dense[k][1]-dense[k-1][1]));
  const total = cum[cum.length-1];
  const pts = [];
  let seg = 1;
  for(let j=0;j<n;j++){
    const target = total * j / n;
    while(seg < cum.length-1 && cum[seg] < target) seg++;
    const span = cum[seg] - cum[seg-1], t = span > 0 ? (target - cum[seg-1]) / span : 0;
    const a = dense[seg-1], b = dense[seg];
    pts.push([a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t]);
  }
  return pts;
}

// Area of a shape at a given size, in the same square-unit system as `size`.
// Exact for disc/polygons; numerically sampled (shoelace on the actual outline) for the
// bezier shapes, so it stays accurate if their path formulas ever change.
const areaCache = new Map();
function areaOfShape(shape, size){
  const key = shape + '|' + size;
  if(areaCache.has(key)) return areaCache.get(key);
  const def = shapeDef(shape, size);
  let a;
  if(def.kind === 'circle') a = Math.PI * def.r * def.r;
  else if(def.kind === 'polygon') a = shoelace(def.points);
  else a = shoelace(samplePathD(def.d, 360));
  areaCache.set(key, a);
  return a;
}

// Legacy abstract weight: area x mass-per-unit-area. Still used for an explicit per-shape
// `density`, and as a fallback when no material model is available.
function weightFromShape(shape, size, density){
  return areaOfShape(shape, size) * (density !== undefined ? density : DEFAULT_AREAL_DENSITY);
}

