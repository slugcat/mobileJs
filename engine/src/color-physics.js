/* ---------------- color ---------------- */
function resolveColor(c){
  if(c.startsWith('var(')){
    const name = c.slice(4,-1).trim();
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  return c;
}
function hexToRgb(hex){
  const h = hex.replace('#','');
  const full = h.length===3 ? h.split('').map(c=>c+c).join('') : h;
  const n = parseInt(full,16);
  return [(n>>16)&255, (n>>8)&255, n&255];
}
function shadeColor(hex, pct){ // pct: -100..100, negative darkens
  if(!/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(hex)) return hex;
  try{
    const [r,g,b] = hexToRgb(hex);
    const f = pct/100;
    const mix = (v)=> Math.max(0, Math.min(255, Math.round(v + (f>0 ? (255-v)*f : v*f))));
    return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
  }catch(e){ return hex; }
}

/* ---------------- physics ----------------
   1. SPIN (yaw): free rotation about the vertical string axis, driven by
      momentum + gentle random air current, lightly damped. This is the
      dominant, ever-present motion of a real mobile. Every node that can
      be independently suspended (rods AND shapes with their own string)
      gets this.
   2. LEAN: only rods have an arm to balance. A rod with no explicit pivot
      auto-balances at the weighted center of mass of its children (level,
      like a real mobile maker calculates it); an explicit off-center pivot
      produces a fixed static lean, not an oscillation. A small ambient
      sway is layered on top just for liveliness.
   ---------------------------------------- */
const YAW_JITTER = 0.5;
const YAW_DAMPING = 0.995;
const LEAN_SPAN = 260;
const LEAN_MAX = 0.5;
const SWAY_AMPLITUDE = 0.045;
const SWAY_FREQ = 0.35;

// Mass of a node plus everything hanging from it. node._m is the node's own mass in GRAMS,
// set by resolveWeights from the material model (or an explicit weight).
function massOf(node){
  let m;
  if(node._m !== undefined) m = node._m;
  else if(node.type === 'shape') m = node.weight !== undefined ? node.weight : weightFromShape(node.shape, node.size, node.density);
  else m = 0.6;
  for(const c of (node.children || [])) m += massOf(c.node);
  return m;
}

// Deterministic part of the physics: total mass, balance pivot, static lean. Safe to re-run any time.
function computeBalance(node){
  node._mass = massOf(node);
  if(node.type === 'rod'){
    const [lo, hi] = rodExtent(node), mid = (lo + hi) / 2;
    const self = node._m !== undefined ? node._m : 0.6;
    if(node.pivot === undefined){
      // true balance point: children plus the dowel's own weight at its midpoint
      let sum = self * mid, wsum = self;
      for(const c of (node.children||[])){
        const m = massOf(c.node);
        sum += m * c.offset; wsum += m;
      }
      node._pivot = wsum > 0 ? sum / wsum : 0;
    } else {
      node._pivot = node.pivot;
    }
    let imbalance = self * (mid - node._pivot);
    for(const c of (node.children||[])){
      imbalance += massOf(c.node) * (c.offset - node._pivot);
    }
    node._leanBase = node._mass > 0
      ? Math.max(-LEAN_MAX, Math.min(LEAN_MAX, imbalance / (node._mass * LEAN_SPAN)))
      : 0;
  } else {
    node._pivot = 0;
    node._leanBase = 0;
  }
  for(const c of (node.children||[])) computeBalance(c.node);
}

// Random motion state (spin, sway phase) on top of the balance; used at start and on Reset.
function initPhysics(node){
  computeBalance(node);
  (function seed(n){
    n._swayPhase = Math.random() * Math.PI * 2;
    n._swayFreq = SWAY_FREQ * (0.7 + Math.random()*0.6);
    n._yaw = (Math.random()-0.5) * 0.6;
    n._yawOmega = (Math.random()-0.5) * 0.3;
    for(const c of (n.children||[])) seed(c.node);
  })(node);
}

function stepPhysics(node, dt, t){
  node._yawOmega += (Math.random()-0.5) * YAW_JITTER * dt;
  node._yawOmega *= YAW_DAMPING;
  node._yaw += node._yawOmega * dt;
  node._lean = node._leanBase + SWAY_AMPLITUDE * Math.sin(t*node._swayFreq + node._swayPhase);
  for(const c of (node.children||[])) stepPhysics(c.node, dt, t);
}

