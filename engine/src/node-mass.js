/* ---------------- shared node helpers ---------------- */
function clampBend(node){ return Math.max(-1.5, Math.min(1.5, node.bend||0)); }

// Static panel pitch; a bent panel with no `tilt` hangs hump-up from its attach point.
function panelPitch(node){
  const b = clampBend(node);
  return node.tilt !== undefined ? node.tilt : (b ? -Math.sign(b)*Math.PI/2 : 0);
}

// Area centroid of a polygon.
function polyCentroid(pts){
  let a = 0, cx = 0, cy = 0;
  for(let i=0;i<pts.length;i++){
    const [x1,y1] = pts[i], [x2,y2] = pts[(i+1)%pts.length], w = x1*y2 - x2*y1;
    a += w; cx += (x1+x2)*w; cy += (y1+y2)*w;
  }
  return [cx/(3*a), cy/(3*a)];
}

// Where the hanging string meets the flat shape. The default [0,0] is outside a crescent
// (it sits in the bite), so a crescent defaults to its own centre of mass, which lies in its body.
let crescentCentroid = null;
function attachOf(node){
  if(node.attach) return node.attach;
  if(node.shape === 'crescent'){
    if(!crescentCentroid) crescentCentroid = polyCentroid(shapeDef('crescent', 1).points);
    return [crescentCentroid[0]*node.size, crescentCentroid[1]*node.size];
  }
  return [0,0];
}

// Local x-extent of a rod: spans its children and the local origin.
function rodExtent(node){
  let lo = 0, hi = 0;
  for(const c of (node.children||[])){ lo = Math.min(lo, c.offset); hi = Math.max(hi, c.offset); }
  return [lo, hi];
}

// Length of the string a node hangs from (simulator units). The node's own valid `string` wins, then the
// parent's link `{ string }`; the root falls back to spec.string, then 60.
function ownString(node){
  const s = node.string;
  return (typeof s === 'number' && isFinite(s) && s >= 0) ? s : undefined;
}
function stringOf(c){
  const s = ownString(c.node);
  return s !== undefined ? s : (c.string || 0);
}
function rootStringOf(spec){
  const s = ownString(spec.root);
  return s !== undefined ? s : (spec.string || 60);
}

// Stable unique ids, shared by verifier messages and the build sheet. Duplicate `id`s get a suffix.
function assignIds(root){
  const used = new Set();
  let si = 0, ri = 0;
  (function walk(n){
    const base = n.id || (n.type === 'shape' ? `${n.shape}_${++si}` : `rod_${++ri}`);
    let id = base, k = 2;
    while(used.has(id)) id = `${base}_${k++}`;
    used.add(id);
    n._id = id;
    for(const c of (n.children||[])) walk(c.node);
  })(root);
}

/* ---------------- physical masses (grams) ----------------
   The ONE mass model. A shape's mass is wood + glue lines + finish on both faces
   (an explicit `weight`, in grams, or a per-area `density` overrides it); a rod's is its dowel.
   The simulator's balance points and hang solves, the build sheet and the verifier all read
   node._m, so they cannot drift apart. */
function shapeMass(node, cfg){
  const S = cfg.shapes, mm = cfg.mmPerUnit;
  const areaMm2 = areaOfShape(node.shape, node.size) * mm * mm;
  const areaM2 = areaMm2 * 1e-6;
  const wood = areaM2 * (S.totalThicknessMm * 1e-3) * S.densityKgM3 * 1000;
  const glue = areaM2 * Math.max(0, S.layers - 1) * S.glueArealGPerM2;
  const finish = areaM2 * 2 * S.finishCoatGPerM2;
  return { areaMm2, areaM2, wood, glue, finish, total: wood + glue + finish };
}

function rodMass(node, cfg){
  const [lo, hi] = rodExtent(node);
  const lengthMm = (hi - lo) * cfg.mmPerUnit;
  const area = Math.PI * (cfg.rods.diameterMm / 2) ** 2;
  return (area * lengthMm * 1e-9) * cfg.rods.densityKgM3 * 1000;
}

// Set node._m (own mass, grams) on every node. Never writes node.weight, so re-running with
// different materials always re-derives the masses instead of mistaking them for explicit input.
function resolveWeights(node, cfg){
  if(!node) return;
  if(node.type === 'shape'){
    if(node.weight !== undefined){ node._m = node.weight; node._massSource = 'weight'; }
    else if(node.density !== undefined){ node._m = weightFromShape(node.shape, node.size, node.density); node._massSource = 'density'; }
    else if(cfg){ node._m = shapeMass(node, cfg).total; node._massSource = 'material'; }
    else { node._m = weightFromShape(node.shape, node.size); node._massSource = 'material'; }
  } else {
    node._m = cfg ? rodMass(node, cfg) : 0.6;
  }
  for(const c of (node.children || [])) resolveWeights(c.node, cfg);
}

