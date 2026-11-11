/* ============================================================
   MOBILE STUDIO — shared engine
   Include this after mobile-engine.css, then call:
     MobileEngine.start({ title, string, root, hideJoints? }, shapeMat, rodMat, threadMat);
   from your mobile's own small HTML file.
   ------------------------------------------------------------
   SCHEMA
   Any node (rod OR shape) can have children:
     children: [ { offset:<number>, string:<number>, anchorY?:<0..1>, node:<node> }, ... ]

   "rod" node:
     { type:'rod',
       pivot: <number|undefined> }   // local x of hang point; omit to auto-balance

   "shape" node:
     { type:'shape', shape:'disc'|'blob'|'crescent'|'diamond'|'leaf'|'ovate'|'triangle'|'rect',
       size:<number>, color:'#hex', weight:<number|undefined>, // grams; omit to derive from area x thickness x density (shapeMat)
       density:<number optional>,    // mass per unit area (g/unit^2); overrides the material-derived mass when weight is omitted
       orientation:<degrees, static in-plane rotation, default 0>,
       tilt:<radians, static panel pitch (foreshortens vertically), default 0>,
       bend:<-1.5..1.5, real out-of-plane curvature: total turning angle (radians)
             at distance `size` from center, like a card pressed on two opposite
             edges (one-axis cylinder bend, not a saddle). + cups toward viewer,
             - bows away. default 0 = flat>,
       attach:<[x,y] in the flat shape's own coords where the hanging string meets
             it; default [0,0] = center (crescent: its centre of mass, inside its body). The shape spins about the vertical line
             through this point.>,
       (bent shapes with no `tilt` hang hump-up from their attach point; give
        `tilt` in radians to override. A child may use `at:[x,y]` to hang from a
        specific point on this shape instead of offset/anchorY.)
       slope:<degrees, rotation about the view axis applied after the panel's pose
             (before it spins): positive raises the right-hand end. default 0.
             'auto' = computed from physics (see "hanging equilibrium")>,
       targetSlope:<degrees, desired tilt; the engine solves `attach` along the
             shape's y axis to achieve it (physical equilibrium)>,
       id:<optional name shown in the build sheet>,
   Spec option buildSheet:true shows a table of sizes, weights, hang points.
       bendAxis:<degrees, direction (in the shape's own plane) along which it
             curves; 0 = curves left-right, 90 = curves top-bottom. default 0> }

   A shape's children hang from a point on the shape itself:
     offset = horizontal distance from the shape's center
     anchorY = fraction of size below center to attach (default 1 = bottom edge)

   MATERIAL & STRUCTURAL VERIFICATION
   Call via:
     MobileEngine.start(spec, shapeMat, rodMat, threadMat);
   or standalone:
     const report = MobileEngine.verifyMobile(spec, shapeMat, rodMat, threadMat);

   Scale option on `spec`:
     mmPerUnit: <number, default 2.0> // real-world millimeters per simulator unit

   1. `shapeMat` (Sheet Material & Lamination Parameters):
     {
       material: <'balsa'|'basswood'|'birch_ply', default 'balsa'>,
              // !! for any wood:
              // Pre-bend the wet plies on the cylinder until dry so they hold the 24mm radius stress-free.
              // Apply PVA glue between the pre-curved plies and clamp them back onto the cylinder.
              // This is what is meant by warmWetBent == true.
       grade: <'soft'|'medium'|'hard', default 'medium'>,

              // balsa density: soft=100, medium=160 (craft store), hard=220 kg/m^3
       thicknessMm: <number, default 1.588>,
              // single-layer sheet thickness in mm (1.588 = 1/16", 2.38 = 3/32", 3.175 = 1/8")
       layers: <number, default 1>,
              // number of glued layers (use 2+ to hold out-of-plane `bend` without relaxing)
       crossGrainLayers: <boolean, default false>,
              // true if adjacent plies alternate grain to prevent splitting and cross-grain sag
       glueType: <'pva'|'ca'|'epoxy', default 'pva'>,
              // adhesive mass & stiffness (pva=35, ca=20, epoxy=60 g/m^2 per glue line)
       grainAngleDeg: <number, default 90>,
              // wood grain direction in shape's flat coords (90 = along y-axis, 0 = along x-axis)
       warmWetBent: <boolean, default false>,
              // true if steamed/water-formed (relaxes outer-fiber fracture strain limit by 1.85x, counted once);
              // off by default so the verifier never assumes a forming process you did not declare
       holeReinforced: <boolean, default false>,
              // true if pinholes are hardened with thin CA glue or micro-grommets (2.8x tear-out)
       minEdgeMarginMm: <number, default 3.0>,
              // minimum safe distance in mm from any attachment hole to the cut edge
       finishCoatGPerM2: <number, default 20>
              // paint/sealer mass per face in g/m^2 (applied to both sides)
     }

   2. `rodMat` (Round Dowel Parameters):
     {
       material: <'pine'|'oak', default 'pine'>,
              // pine (500 kg/m^3, E=9.0 GPa, MOR=60 MPa) | oak (750 kg/m^3, E=12.5 GPa, MOR=95 MPa)
       diameterMm: <number, default 3.175>,
              // round dowel diameter in mm (3.175 = 1/8", 4.763 = 3/16", 6.35 = 1/4")
       attachmentMethod: <'groove_tied'|'drilled_hole', default 'groove_tied'>,
              // 'drilled_hole' accounts for cross-section weakening from a through-hole
       holeDiameterMm: <number, default 1.0>,
              // drill bit diameter in mm when attachmentMethod is 'drilled_hole'
       maxDeflectionRatio: <number, default 0.01>
              // max allowable cantilever tip sag as a fraction of arm span (0.01 = L/100)
     }

   3. `threadMat` (Suspension String & Monofilament Parameters):
     {
       material: <'cotton_glace'|'linen_waxed'|'silk_buttonhole'|'polyester_bonded'|
                  'braided_spectra'|'nylon_monofilament'|'fluorocarbon_mono'|'copolymer_clear',
                  default 'nylon_monofilament'>,
              // opaque threads: 'cotton_glace' (mercerized #40), 'linen_waxed', 'silk_buttonhole'
              // transparent lines: 'nylon_monofilament', 'fluorocarbon_mono', 'copolymer_clear'
       diameterMm: <number, default 0.20>,
              // thread diameter in mm (0.14 = 2 lb mono, 0.20 = 4 lb mono, 0.25 = #40 cotton)
       safetyFactor: <number, default 4.0>
              // minimum required ratio of knotted breaking strength to suspended load
     }

   EXAMPLE (Standard Craft-Store Balsa, 1/8" Pine Dowel, & Common Thread):
     const shapeMat = {
       material: 'balsa',
       grade: 'medium',
       thicknessMm: 1.588,      // 1/16" sheet
       layers: 2,               // 2 layers glued with PVA to hold curve
       crossGrainLayers: false,
       glueType: 'pva',
       grainAngleDeg: 90,
       holeReinforced: true,    // CA-hardened pinholes
       minEdgeMarginMm: 3.0,
       finishCoatGPerM2: 20
     };
     const rodMat = {
       material: 'pine',
       diameterMm: 3.175,       // 1/8" dowel
       attachmentMethod: 'groove_tied',
       maxDeflectionRatio: 0.01
     };
     const threadMat = {
       material: 'cotton_glace', // or 'nylon_monofilament' with diameterMm: 0.14 (2 lb test)
       diameterMm: 0.25,
       safetyFactor: 4.0
     };
     spec.mmPerUnit = 2.0;
     MobileEngine.start(spec, shapeMat, rodMat, threadMat);
   ============================================================ */

(function(){

const DEFAULT_AREAL_DENSITY = 0.0016; // weight per unit area when a shape omits `weight`
const DEFAULT_CAM_ELEV = 0.3;         // default camera elevation in radians (~17 deg above)
let camElev = DEFAULT_CAM_ELEV;       // live camera elevation controlled by right-hand slider
const SF_FAIL = 1.5;                  // ERROR below this safety factor on any strength check (WARN below the design factor)
const EDGE_EPS_MM = 0.1;              // a hole within this distance of the cut edge counts as ON the edge

/* ---------------- material catalogs & presets ---------------- */
const MATERIAL_PRESETS = {
  shapes: {
    balsa: {
      grades: {
        soft:   { densityKgM3: 100, E_L_MPa: 2100, E_T_MPa: 35, sigmaBendMPa: 11.0, tauShearMPa: 1.2 },
        medium: { densityKgM3: 160, E_L_MPa: 3400, E_T_MPa: 55, sigmaBendMPa: 18.0, tauShearMPa: 2.0 },
        hard:   { densityKgM3: 220, E_L_MPa: 4800, E_T_MPa: 80, sigmaBendMPa: 25.0, tauShearMPa: 2.8 }
      }
    },
    basswood: {
      grades: {
        medium: { densityKgM3: 415, E_L_MPa: 9500, E_T_MPa: 380, sigmaBendMPa: 55.0, tauShearMPa: 6.5 }
      }
    },
    birch_ply: {
      grades: {
        medium: { densityKgM3: 680, E_L_MPa: 11000, E_T_MPa: 9000, sigmaBendMPa: 75.0, tauShearMPa: 12.0 }
      }
    }
  },
  glues: {
    pva:   { name: 'PVA / Aliphatic Wood Glue', arealGPerM2: 35, creepFactor: 1.0, stiffnessBoost: 1.1 },
    ca:    { name: 'Cyanoacrylate (CA)',        arealGPerM2: 20, creepFactor: 0.9, stiffnessBoost: 1.05 },
    epoxy: { name: 'Laminating Epoxy',          arealGPerM2: 60, creepFactor: 0.7, stiffnessBoost: 1.25 }
  },
  rods: {
    pine: {
      name: 'Pine Round Rod',
      densityKgM3: 500,
      E_MPa: 9000,
      morMPa: 60
    },
    oak: {
      name: 'Oak Round Rod',
      densityKgM3: 750,
      E_MPa: 12500,
      morMPa: 95
    }
  },
  threads: {
    cotton_glace: {
      name: 'Glacé Mercerized Cotton Thread',
      transparent: false,
      densityKgM3: 1520,
      tensileMPa: 420,
      E_MPa: 7500,
      knotEfficiency: 0.75,
      memoryStiffness: 0.15 // low coil memory
    },
    linen_waxed: {
      name: 'Waxed Linen Thread',
      transparent: false,
      densityKgM3: 1500,
      tensileMPa: 580,
      E_MPa: 14000,
      knotEfficiency: 0.80,
      memoryStiffness: 0.25
    },
    silk_buttonhole: {
      name: 'Twisted Silk Buttonhole Thread',
      transparent: false,
      densityKgM3: 1340,
      tensileMPa: 500,
      E_MPa: 8500,
      knotEfficiency: 0.72,
      memoryStiffness: 0.08 // extremely supple
    },
    polyester_bonded: {
      name: 'Bonded Polyester Thread',
      transparent: false,
      densityKgM3: 1380,
      tensileMPa: 620,
      E_MPa: 10500,
      knotEfficiency: 0.74,
      memoryStiffness: 0.20
    },
    braided_spectra: {
      name: 'Micro-Braided UHMWPE (Spectra/Dyneema)',
      transparent: false,
      densityKgM3: 970,
      tensileMPa: 2400,
      E_MPa: 75000,
      knotEfficiency: 0.55,
      memoryStiffness: 0.05
    },
    nylon_monofilament: {
      name: 'Clear Nylon Monofilament',
      transparent: true,
      densityKgM3: 1140,
      tensileMPa: 520,
      E_MPa: 2600,
      knotEfficiency: 0.65, // requires clinch/blood knot; slips easily
      memoryStiffness: 1.00 // high spool coil memory on light loads
    },
    fluorocarbon_mono: {
      name: 'Clear Fluorocarbon (PVDF) Monofilament',
      transparent: true,
      densityKgM3: 1780,
      tensileMPa: 480,
      E_MPa: 3200,
      knotEfficiency: 0.62,
      memoryStiffness: 1.15
    },
    copolymer_clear: {
      name: 'Clear Low-Memory Copolymer Monofilament',
      transparent: true,
      densityKgM3: 1160,
      tensileMPa: 560,
      E_MPa: 2900,
      knotEfficiency: 0.68,
      memoryStiffness: 0.65
    }
  }
};

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
  return { kappa, cA, sA, orient, point, raw };
}

function shadePct(n){ // world normal -> lighten/darken percent (two-sided)
  if(n[2] < 0) n = [-n[0],-n[1],-n[2]];
  const d = Math.max(0, n[0]*LIGHT[0] + n[1]*LIGHT[1] + n[2]*LIGHT[2]);
  return (0.3 + 0.7*d - L_REST) * 90;
}

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

/* ---------------- physical & material verification ---------------- */
function pointToSegmentDist(px, py, x1, y1, x2, y2){
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx*dx + dy*dy;
  let t = len2 > 0 ? ((px - x1)*dx + (py - y1)*dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t*dx), py - (y1 + t*dy));
}

function signedEdgeMargin(outline, px, py){
  let minD = Infinity;
  for(let i=0;i<outline.length;i++){
    const [x1,y1] = outline[i], [x2,y2] = outline[(i+1)%outline.length];
    const d = pointToSegmentDist(px, py, x1, y1, x2, y2);
    if(d < minD) minD = d;
  }
  const inside = pointInPoly(outline, px, py);
  return { inside, distUnits: minD, signedUnits: inside ? minD : -minD };
}

function normalizeMaterialParams(spec, shapeArg, rodArg, threadArg, optionsArg){
  let sIn = shapeArg, rIn = rodArg, tIn = threadArg, optIn = optionsArg || {};
  // Support combined object: verifyMobile(spec, { shapes, rods, thread, mmPerUnit })
  if(shapeArg && !rodArg && !threadArg && (shapeArg.shapes || shapeArg.rods || shapeArg.thread || shapeArg.strings)){
    sIn = shapeArg.shapes || shapeArg.shape;
    rIn = shapeArg.rods   || shapeArg.rod;
    tIn = shapeArg.thread || shapeArg.strings || shapeArg.string;
    optIn = shapeArg;
  } else if(!shapeArg && !rodArg && !threadArg && spec && spec.materials){
    sIn = spec.materials.shapes || spec.materials.shape;
    rIn = spec.materials.rods   || spec.materials.rod;
    tIn = spec.materials.thread || spec.materials.strings || spec.materials.string;
    optIn = spec.materials;
  }
  sIn = sIn || {};
  rIn = rIn || {};
  tIn = tIn || {};

  // An unknown name still falls back to a sensible default, but never silently.
  const warnings = [];
  const pick = (table, raw, fallback, label)=>{
    const key = String(raw).toLowerCase();
    if(Object.prototype.hasOwnProperty.call(table, key)) return key;
    warnings.push(`Unknown ${label} "${raw}"; falling back to "${fallback}".`);
    return fallback;
  };

  const mmPerUnit = optIn.mmPerUnit || sIn.mmPerUnit || (spec && spec.mmPerUnit) || 2.0;

  // 1. Shape material normalization (balsa + thickness + layers + grain/glue/hole params)
  const shapeKey = pick(MATERIAL_PRESETS.shapes, sIn.material || sIn.type || 'balsa', 'balsa', 'shape material');
  const shapePresetGroup = MATERIAL_PRESETS.shapes[shapeKey];
  const gradeKey = pick(shapePresetGroup.grades, sIn.grade || 'medium', 'medium', `${shapeKey} grade`);
  const baseWood = shapePresetGroup.grades[gradeKey];

  const layers = Math.max(1, Math.round(sIn.layers !== undefined ? sIn.layers : (sIn.gluedLayers || 1)));
  const layerThicknessMm = sIn.thicknessMm !== undefined ? sIn.thicknessMm
                         : (sIn.thickness !== undefined ? sIn.thickness : 1.588); // 1/16 inch default
  const totalThicknessMm = layers * layerThicknessMm;
  const glueKey = pick(MATERIAL_PRESETS.glues, sIn.glueType || sIn.glue || 'pva', 'pva', 'glue type');
  const glueSpec = MATERIAL_PRESETS.glues[glueKey];

  const shapes = {
    material: shapeKey,
    grade: gradeKey,
    densityKgM3: sIn.densityKgM3 || baseWood.densityKgM3,
    E_L_MPa: sIn.E_L_MPa || baseWood.E_L_MPa,
    E_T_MPa: sIn.E_T_MPa || baseWood.E_T_MPa,
    sigmaBendMPa: sIn.sigmaBendMPa || baseWood.sigmaBendMPa,
    tauShearMPa: sIn.tauShearMPa || baseWood.tauShearMPa,
    thicknessMm: layerThicknessMm,
    layers,
    totalThicknessMm,
    crossGrainLayers: !!sIn.crossGrainLayers,
    glueType: glueKey,
    glueArealGPerM2: sIn.glueArealGPerM2 !== undefined ? sIn.glueArealGPerM2 : glueSpec.arealGPerM2,
    stiffnessBoost: glueSpec.stiffnessBoost,
    grainAngleDeg: sIn.grainAngleDeg !== undefined ? sIn.grainAngleDeg : 90, // default along shape Y-axis
    warmWetBent: !!sIn.warmWetBent, // default false: never assume a forming process the builder did not declare
    holeReinforced: !!sIn.holeReinforced,
    minEdgeMarginMm: sIn.minEdgeMarginMm !== undefined ? sIn.minEdgeMarginMm : 3.0,
    finishCoatGPerM2: sIn.finishCoatGPerM2 !== undefined ? sIn.finishCoatGPerM2 : 20
  };

  // 2. Rod material normalization (pine or oak round rod of specified diameter)
  const rodKey = pick(MATERIAL_PRESETS.rods, rIn.material || rIn.type || rIn.wood || 'pine', 'pine', 'rod material');
  const baseRod = MATERIAL_PRESETS.rods[rodKey];
  const rods = {
    material: rodKey,
    name: baseRod.name,
    diameterMm: rIn.diameterMm !== undefined ? rIn.diameterMm
              : (rIn.diameter !== undefined ? rIn.diameter : 3.175), // 1/8 inch default
    densityKgM3: rIn.densityKgM3 || baseRod.densityKgM3,
    E_MPa: rIn.E_MPa || baseRod.E_MPa,
    morMPa: rIn.morMPa || baseRod.morMPa,
    attachmentMethod: rIn.attachmentMethod || 'groove_tied', // 'groove_tied' | 'drilled_hole'
    holeDiameterMm: rIn.holeDiameterMm || 1.0,
    maxDeflectionRatio: rIn.maxDeflectionRatio || 0.01 // L/100
  };

  // 3. Thread material normalization (traditional mobile threads + transparent monofilaments)
  const threadKey = pick(MATERIAL_PRESETS.threads, tIn.material || tIn.type || 'nylon_monofilament', 'nylon_monofilament', 'thread material');
  const baseThread = MATERIAL_PRESETS.threads[threadKey];
  const threads = {
    material: threadKey,
    name: baseThread.name,
    transparent: tIn.transparent !== undefined ? !!tIn.transparent : baseThread.transparent,
    diameterMm: tIn.diameterMm !== undefined ? tIn.diameterMm
              : (tIn.thicknessMm !== undefined ? tIn.thicknessMm
              : (tIn.thickness !== undefined ? tIn.thickness : 0.20)),
    densityKgM3: tIn.densityKgM3 || baseThread.densityKgM3,
    tensileMPa: tIn.tensileMPa || baseThread.tensileMPa,
    E_MPa: tIn.E_MPa || baseThread.E_MPa,
    knotEfficiency: tIn.knotEfficiency || baseThread.knotEfficiency,
    memoryStiffness: tIn.memoryStiffness !== undefined ? tIn.memoryStiffness : baseThread.memoryStiffness,
    safetyFactor: tIn.safetyFactor || 4.0
  };

  return { mmPerUnit, shapes, rods, thread: threads, warnings };
}

function verifyMobile(spec, shapeMat, rodMat, threadMat, options){
  if(!spec || !spec.root){
    return { valid: false, status: 'ERROR', issues: [{ severity: 'ERROR', category: 'spec', message: 'Missing spec.root' }] };
  }

  const cfg = normalizeMaterialParams(spec, shapeMat, rodMat, threadMat, options);
  const { mmPerUnit, shapes: S, rods: R, thread: T } = cfg;
  const g_accel = 9.80665; // m/s^2 (N per kg)

  // Ids, masses (grams), hang tilts and balance points all come from this one material model,
  // so the simulator, build sheet and verifier can never disagree about weight.
  assignIds(spec.root);
  resolveWeights(spec.root, cfg);
  resolveTilts(spec.root);
  computeBalance(spec.root);
  if(spec.root._swayPhase === undefined) initPhysics(spec.root);

  const issues = [];
  const nodeReports = [];

  function addIssue(severity, category, nodeId, message, details){
    issues.push({ severity, category, nodeId, message, details });
  }
  for(const w of cfg.warnings) addIssue('WARN', 'unknown_parameter', 'materials', w);

  // Hole / hang point vs. cut edge. A point within EDGE_EPS_MM of the outline counts as ON it
  // (the default bottom-edge anchor lands exactly on the outline, so float noise must not
  // decide between ERROR and WARN).
  function classifyEdge(outline, pt){
    const e = signedEdgeMargin(outline, pt[0], pt[1]);
    const mm = e.signedUnits * mmPerUnit;
    const onEdge = Math.abs(mm) < EDGE_EPS_MM;
    return { outside: !e.inside && !onEdge, marginMm: onEdge ? 0 : mm };
  }

  // Orthotropic modulus helper (Hankinson formula) for wood at angle deltaRad to grain
  function effectiveWoodModulus(deltaRad){
    if(S.layers >= 2 && S.crossGrainLayers){
      return (0.5 * S.E_L_MPa + 0.5 * S.E_T_MPa) * S.stiffnessBoost;
    }
    const c2 = Math.cos(deltaRad)**2, s2 = Math.sin(deltaRad)**2;
    const E = (S.E_L_MPa * S.E_T_MPa) / (S.E_L_MPa * s2 + S.E_T_MPa * c2);
    return E * (S.layers > 1 ? S.stiffnessBoost : 1.0);
  }

  // Thread cross-section and strength
  const threadAreaMm2 = Math.PI * (T.diameterMm / 2)**2;
  const threadLinearBreakN = threadAreaMm2 * T.tensileMPa;
  const threadKnottedBreakN = threadLinearBreakN * T.knotEfficiency;
  const threadSafeWorkingN = threadKnottedBreakN / T.safetyFactor;
  // Minimum mass (grams) needed to pull stiff monofilament straight against spool memory
  const minStraightGrams = T.memoryStiffness * 65 * (T.diameterMm ** 2);

  // Recursive post-order pass: calculates physical masses (grams) and checks every node
  function inspectNode(node, depthLevel, incomingStringUnits, parentLabel){
    const isShape = node.type === 'shape';
    const nodeId = node._id;
    const outline = isShape ? (node._outline || (node._outline = outlinePoints(node.shape, node.size))) : null;

    // Inspect children first so we know their exact physical masses in grams
    const childResults = [];
    for(const c of (node.children || [])){
      const cRes = inspectNode(c.node, depthLevel + 1, c.string || 0, nodeId);
      childResults.push({ link: c, report: cRes });
    }

    let selfMassGrams = 0;
    let childrenMassGrams = 0;
    for(const cr of childResults) childrenMassGrams += cr.report.totalMassGrams;

    if(isShape){
      // 1. Physical mass: an explicit weight/density wins, else wood + glue lines + finish on 2 faces
      const mb = shapeMass(node, cfg);
      const areaMm2 = mb.areaMm2;
      selfMassGrams = node._m;
      node._selfMassGrams = selfMassGrams; // <-- store physical mass in grams for buildSheet
      if(node._massSource !== 'material' && mb.total > 0){
        const off = Math.abs(selfMassGrams / mb.total - 1);
        if(off > 0.35){
          addIssue('WARN', 'weight_override_mismatch', nodeId,
            `Explicit ${node._massSource} gives ${selfMassGrams.toFixed(2)} g but the material spec predicts ${mb.total.toFixed(2)} g (${(off*100).toFixed(0)}% off); every check uses the explicit value.`,
            { explicitGrams: selfMassGrams, predictedGrams: mb.total }
          );
        }
      }

      const totalMassGrams = selfMassGrams + childrenMassGrams;
      const totalLoadN = (totalMassGrams * 1e-3) * g_accel;

      // 2. Check forming bend stress & single-layer springback/humidity relaxation
      const rawBend = node.bend || 0;
      const bendRad = Math.abs(clampBend(node)); // same clamp the renderer applies
      if(Math.abs(rawBend) > 1.5){
        addIssue('WARN', 'bend_clamped', nodeId,
          `bend=${rawBend} is outside +/-1.5 rad; the renderer clamps it to ${clampBend(node)} and verification uses the clamped value.`,
          { bend: rawBend, clamped: clampBend(node) }
        );
      }
      const sizeMm = node.size * mmPerUnit;
      if(bendRad > 1e-4){
        const radiusMm = sizeMm / bendRad;
        const bendAxisDeg = node.bendAxis || 0;
        // angle between the curvature direction and the grain: 0 = fibres wrap the curve (stiff, ~0.5% strain limit),
        // 90 = curve runs across the fibres (soft, tolerates far more strain)
        const grainDeltaRad = ((bendAxisDeg - S.grainAngleDeg) * Math.PI) / 180;

        // Each single ply bends before the glue cures.
        const c2 = Math.cos(grainDeltaRad)**2, s2 = Math.sin(grainDeltaRad)**2;
        const E_forming = (S.E_L_MPa * S.E_T_MPa) / (S.E_L_MPa * s2 + S.E_T_MPa * c2);

        const outerStrain = S.thicknessMm / (2 * radiusMm);
        const formingStressMPa = E_forming * outerStrain;
        // Wet/steam forming is credited ONCE: a 1.85x allowance on the outer-fibre limit
        // (it is not also applied as a softer modulus, which would multiply to ~5x).
        const maxFormingStressMPa = S.sigmaBendMPa * (S.warmWetBent ? 1.85 : 1.0) * (c2 + 0.25 * s2);

        if(formingStressMPa > maxFormingStressMPa){
          addIssue('ERROR', 'shape_bending_fracture', nodeId,
            `${S.material} sheet will crack during bending: outer-fiber stress ${formingStressMPa.toFixed(1)} MPa exceeds allowable ${maxFormingStressMPa.toFixed(1)} MPa (R=${radiusMm.toFixed(1)} mm, layer t=${S.thicknessMm} mm).`,
            { radiusMm, formingStressMPa, maxFormingStressMPa, recommendation: 'Use thinner sheets laminated in multiple layers, wet/steam-form (warmWetBent), or run the grain across the curve (grain perpendicular to the curvature direction).' }
          );
        } else if(formingStressMPa > 0.75 * maxFormingStressMPa){
          addIssue('WARN', 'shape_tight_bend', nodeId,
            `Tight bend radius (${radiusMm.toFixed(1)} mm) is at ${(formingStressMPa/maxFormingStressMPa*100).toFixed(0)}% of the ${S.material} fracture limit.`,
            { radiusMm, formingStressMPa, maxFormingStressMPa }
          );
        }

        if(bendRad >= 0.25 && S.layers === 1){
          addIssue('WARN', 'single_layer_unbending', nodeId,
            `Curved shape (bend=${clampBend(node)} rad) uses only 1 layer of ${S.material}; unlaminated sheet will relax and flatten over time with humidity changes.`,
            { bend: clampBend(node), layers: S.layers, recommendation: 'Laminate at least 2 thinner glued layers over a form to lock in curvature.' }
          );
        }
      }

      // 3. Gravity droop. Only the weight component acting NORMAL to the sheet bends it, so a sheet
      //    hanging in a vertical plane (tilt 0, slope 0) carries gravity in-plane and cannot sag.
      const slopeNow = node._slopeDeg !== undefined ? node._slopeDeg : (typeof node.slope === 'number' ? node.slope : 0);
      const normalG = Math.abs(Math.sin(panelPitch(node)) * Math.cos(slopeNow * Math.PI / 180));
      let panelDeflectionMm = 0;
      if(normalG > 0.05){
        const H = attachOf(node);
        let reachUnits = 0;
        for(const [x, y] of outline) reachUnits = Math.max(reachUnits, Math.hypot(x - H[0], y - H[1]));
        const spanMm = Math.max(1, reachUnits * mmPerUnit);          // longest arm from the hang point
        const widthMm = Math.max(1, areaMm2 / (2 * sizeMm));         // mean arm width (no artificial floor)

        // child loads sit at their real distance from the hang point; the dominant span direction
        // comes from the load-weighted direction (doubled-angle average, so +/- sides agree)
        const loads = [];
        let sc = 0, ss = 0;
        for(const cr of childResults){
          const p = childFlatPoint(node, cr.link);
          const dx = p[0] - H[0], dy = p[1] - H[1];
          const F = (cr.report.totalMassGrams * 1e-3) * g_accel * normalG;
          const x = Math.min(spanMm, Math.hypot(dx, dy) * mmPerUnit);
          loads.push({ F, x, side: dx < 0 ? 'neg' : 'pos' });
          if(F * x > 0){ const a = Math.atan2(dy, dx); sc += F * x * Math.cos(2 * a); ss += F * x * Math.sin(2 * a); }
        }
        const phi = (sc === 0 && ss === 0) ? Math.PI / 2 : 0.5 * Math.atan2(ss, sc);

        const E_span = effectiveWoodModulus(phi - (S.grainAngleDeg * Math.PI) / 180);
        const archRiseMm = bendRad > 0.05 ? sizeMm * (1 - Math.cos(bendRad)) / bendRad : 0;
        const bendAxisRad = ((node.bendAxis || 0) * Math.PI) / 180;
        // a cylinder curved along bendAxis only arches a strip running along it, by cos^2 of the angle between them
        const archAlongSpan = Math.cos(phi - bendAxisRad) ** 2;
        const h_effMm = S.totalThicknessMm + 0.35 * archRiseMm * archAlongSpan;
        const EI = E_span * (widthMm * (h_effMm ** 3) / 12);

        const L = spanMm;
        const selfF = 0.5 * (selfMassGrams * 1e-3) * g_accel * normalG; // half the sheet's weight per arm, spread uniformly
        const defl = { neg: selfF * L**3 / (8 * EI), pos: selfF * L**3 / (8 * EI) };
        for(const ld of loads) defl[ld.side] += ld.F * ld.x**2 * (3 * L - ld.x) / (6 * EI);
        panelDeflectionMm = Math.max(defl.neg, defl.pos);

        if(panelDeflectionMm > spanMm * 0.03){
          addIssue('WARN', 'shape_drooping', nodeId,
            `Shape "${nodeId}" may sag/droop by ~${panelDeflectionMm.toFixed(2)} mm (${(panelDeflectionMm/spanMm*100).toFixed(1)}% of span) under gravity/child loads.`,
            { panelDeflectionMm, spanMm, E_span_MPa: E_span, layers: S.layers, normalGravityFraction: normalG }
          );
        }
      }
      node._droopMm = panelDeflectionMm;

      // 4. Check parent attachment hole margin & tear-out
      const attachPt = attachOf(node);
      const topEdge = classifyEdge(outline, attachPt);
      const topMarginMm = topEdge.marginMm;

      if(topEdge.outside){
        addIssue('ERROR', 'attach_outside_shape', nodeId,
          `Upper hang point [${attachPt[0].toFixed(1)}, ${attachPt[1].toFixed(1)}] lies OUTSIDE the boundary of "${nodeId}" by ${Math.abs(topMarginMm).toFixed(1)} mm.`,
          { attach: attachPt, marginMm: topMarginMm }
        );
      } else {
        if(topMarginMm < S.minEdgeMarginMm){
          addIssue('WARN', 'fragile_edge_margin', nodeId,
            `Upper hang hole on "${nodeId}" is only ${topMarginMm.toFixed(2)} mm from the cut edge (min recommended: ${S.minEdgeMarginMm} mm); high risk of grain splitting.`,
            { attach: attachPt, marginMm: topMarginMm }
          );
        }
        // Shear tear-out capacity F_tear = 2 * margin * thickness * tau
        const reinfFactor = (S.holeReinforced ? 2.8 : 1.0) * (S.crossGrainLayers && S.layers > 1 ? 1.8 : 1.0);
        const tearOutCapacityN = 2 * Math.max(0.2, topMarginMm) * S.totalThicknessMm * S.tauShearMPa * reinfFactor;
        if(totalLoadN > tearOutCapacityN / 2.5){
          addIssue(totalLoadN > tearOutCapacityN / SF_FAIL ? 'ERROR' : 'WARN', 'hole_tearout_stress', nodeId,
            `Suspension load (${totalMassGrams.toFixed(1)} g) at upper pinhole of "${nodeId}" approaches ${S.material} tear-out strength (safety factor ${(tearOutCapacityN/Math.max(1e-5, totalLoadN)).toFixed(1)}x).`,
            { loadN: totalLoadN, tearOutCapacityN }
          );
        }
        // Check "cheese-wire" bearing pressure of ultra-thin thread cutting into the sheet
        const bearingStressMPa = totalLoadN / (Math.max(0.08, T.diameterMm) * S.totalThicknessMm);
        const maxBearingMPa = S.tauShearMPa * 1.6 * reinfFactor;
        if(bearingStressMPa > maxBearingMPa){
          addIssue('WARN', 'thread_cheesewire', nodeId,
            `Thin ${T.diameterMm} mm thread under ${totalMassGrams.toFixed(1)} g load creates ${bearingStressMPa.toFixed(2)} MPa bearing pressure and may cut into ${S.material} at "${nodeId}" unless pinhole is CA-hardened.`,
            { bearingStressMPa, maxBearingMPa }
          );
        }
      }

      // 5. Check lower child attachment points on this shape
      for(const cr of childResults){
        const cPt = childFlatPoint(node, cr.link);
        const cEdge = classifyEdge(outline, cPt);
        const cMarginMm = cEdge.marginMm;
        const cId = cr.report.nodeId;
        if(cEdge.outside){
          addIssue('ERROR', 'child_attach_outside', nodeId,
            `Lower attachment point [${cPt[0].toFixed(1)}, ${cPt[1].toFixed(1)}] for child "${cId}" lies OUTSIDE parent shape "${nodeId}" (${Math.abs(cMarginMm).toFixed(1)} mm past edge).`,
            { childId: cId, point: cPt, marginMm: cMarginMm }
          );
        } else if(cMarginMm < S.minEdgeMarginMm){
          addIssue('WARN', 'child_attach_fragile', nodeId,
            `Lower attachment hole for child "${cId}" on "${nodeId}" is only ${cMarginMm.toFixed(2)} mm from the edge (recommended >= ${S.minEdgeMarginMm} mm); fragile tip may tear.`,
            { childId: cId, point: cPt, marginMm: cMarginMm }
          );
        }
      }

      // 6. Hanging equilibrium for EVERY shape (not only slope:'auto' / targetSlope), from the gram masses
      const solved = node.slope === 'auto' || node.targetSlope !== undefined;
      const heq = hangModel(node).eq(attachPt[1], attachPt[0]);
      if(solved){
        if(node._targetSlopeFailed){
          addIssue('ERROR', 'target_slope_unreachable', nodeId,
            `No stable hang point on "${nodeId}" can achieve targetSlope=${node.targetSlope}°.`,
            { targetSlope: node.targetSlope, actualSlope: node._slopeDeg }
          );
        } else if(node.targetSlope !== undefined && Math.abs((node._slopeDeg || 0) - node.targetSlope) > 0.75){
          addIssue('WARN', 'target_slope_deviation', nodeId,
            `Solved tilt (${(node._slopeDeg||0).toFixed(1)}°) on "${nodeId}" deviates from targetSlope (${node.targetSlope}°).`,
            { targetSlope: node.targetSlope, actualSlope: node._slopeDeg }
          );
        }
      }
      if(heq.inverted){
        addIssue('ERROR', 'unstable_hang_inversion', nodeId,
          `Shape "${nodeId}" has its combined center of mass ABOVE the hang point and will flip upside-down.`,
          { attach: attachPt }
        );
      } else if(!heq.neutral){
        if(solved){
          if(heq.metacentricDepth * mmPerUnit < 1.5){
            addIssue('WARN', 'marginal_pendulum_stability', nodeId,
              `Shape "${nodeId}" has a very small pendulum restoring arm (${(heq.metacentricDepth*mmPerUnit).toFixed(2)} mm); light air drafts will cause erratic rocking.`,
              { metacentricDepthMm: heq.metacentricDepth * mmPerUnit }
            );
          }
        } else {
          const declared = typeof node.slope === 'number' ? node.slope : 0;
          const diff = ((heq.theta - declared + 540) % 360) - 180;
          if(Math.abs(diff) > 5){
            addIssue('WARN', 'hang_slope_mismatch', nodeId,
              `"${nodeId}" is drawn at slope ${declared.toFixed(1)}° but its weights and hang point settle it at ${heq.theta.toFixed(1)}°; use slope:'auto' or targetSlope, or move the hang point.`,
              { declaredSlope: declared, equilibriumSlope: heq.theta }
            );
          }
        }
      }

      const rep = {
        nodeId, type: 'shape', shape: node.shape, depthLevel,
        lengthMm: node.size * 2 * mmPerUnit,
        areaCm2: areaMm2 / 100,
        selfMassGrams, childrenMassGrams, totalMassGrams,
        topMarginMm, tiltDeg: slopeNow,
        hangTiltDeg: heq.theta, droopMm: panelDeflectionMm
      };
      nodeReports.push(rep);
      checkIncomingString(nodeId, parentLabel, incomingStringUnits, totalMassGrams, totalLoadN);
      return rep;

    } else {
      // ROD NODE VERIFICATION (Pine / Oak round dowel of diameterMm)
      const [minOff, maxOff] = rodExtent(node);
      const spanUnits = maxOff - minOff;
      const lengthMm = spanUnits * mmPerUnit;
      const radiusMm = R.diameterMm / 2;

      // Physical mass of the wooden dowel (same figure the simulator balances with)
      selfMassGrams = node._m;
      const totalMassGrams = selfMassGrams + childrenMassGrams;
      const totalLoadN = (totalMassGrams * 1e-3) * g_accel;

      if((node.children || []).length < 2){
        addIssue('WARN', 'rod_underpopulated', nodeId,
          `Rod "${nodeId}" has fewer than 2 suspended children and cannot balance horizontally on its own.`,
          { childCount: (node.children || []).length }
        );
      }

      // True physical balance point including dowel self-weight. Auto-balanced rods already use it,
      // so the offset is only non-zero for an explicit `pivot`, which is the documented way to ask for a lean.
      const enginePivotUnits = node._pivot || 0;
      const rodMidpointUnits = (minOff + maxOff) / 2;
      let trueTorqueSum = selfMassGrams * rodMidpointUnits;
      for(const cr of childResults){
        trueTorqueSum += cr.report.totalMassGrams * cr.link.offset;
      }
      const truePivotUnits = totalMassGrams > 0 ? trueTorqueSum / totalMassGrams : enginePivotUnits;
      const pivotOffsetMm = (enginePivotUnits - truePivotUnits) * mmPerUnit;
      const leanRad = (truePivotUnits - enginePivotUnits) / LEAN_SPAN; // same lean model the renderer uses, unclamped

      if(node.pivot !== undefined && Math.abs(leanRad) > LEAN_MAX){
        addIssue('WARN', 'rod_lean_clamped', nodeId,
          `Explicit pivot on "${nodeId}" is ${Math.abs(pivotOffsetMm).toFixed(1)} mm from the physical balance point; the lean model gives ${(leanRad*180/Math.PI).toFixed(0)}°, beyond the ${(LEAN_MAX*180/Math.PI).toFixed(0)}° the renderer shows.`,
          { enginePivotMm: enginePivotUnits * mmPerUnit, truePivotMm: truePivotUnits * mmPerUnit, leanDeg: leanRad * 180 / Math.PI }
        );
      }
      if(selfMassGrams > childrenMassGrams * 1.5 && childrenMassGrams > 0){
        addIssue('WARN', 'heavy_rod_vs_balsa', nodeId,
          `Rod "${nodeId}" (${selfMassGrams.toFixed(2)} g of ${R.material}) weighs more than 1.5x the entire payload hanging from it (${childrenMassGrams.toFixed(2)} g); consider a thinner dowel.`,
          { rodMassGrams: selfMassGrams, childrenMassGrams }
        );
      }

      // Check drilled hole weakening if attachmentMethod === 'drilled_hole'
      let netI_Mm4 = (Math.PI * (R.diameterMm ** 4)) / 64;
      if(R.attachmentMethod === 'drilled_hole'){
        if(R.holeDiameterMm > R.diameterMm * 0.35){
          addIssue('WARN', 'rod_hole_weakening', nodeId,
            `Drilled hole (${R.holeDiameterMm} mm) in ${R.diameterMm} mm ${R.material} rod "${nodeId}" removes ${(R.holeDiameterMm/R.diameterMm*100).toFixed(0)}% of diameter; tie a groove instead to avoid snapping.`,
            { holeDiameterMm: R.holeDiameterMm, rodDiameterMm: R.diameterMm }
          );
        }
        // Rectangular cross-section removed through center of circle
        const holeI = (R.holeDiameterMm * (R.diameterMm ** 3)) / 12;
        netI_Mm4 = Math.max(netI_Mm4 * 0.15, netI_Mm4 - holeI);
      }

      // Cantilever bending stress & tip deflection (left and right arms from pivot)
      const leftArmMm = Math.max(0, (enginePivotUnits - minOff) * mmPerUnit);
      const rightArmMm = Math.max(0, (maxOff - enginePivotUnits) * mmPerUnit);
      const qRodNPerMm = lengthMm > 0 ? ((selfMassGrams * 1e-3) * g_accel) / lengthMm : 0;

      let leftMomentNmm = 0.5 * qRodNPerMm * (leftArmMm ** 2);
      let rightMomentNmm = 0.5 * qRodNPerMm * (rightArmMm ** 2);
      let leftDeflMm = (qRodNPerMm * (leftArmMm ** 4)) / (8 * R.E_MPa * netI_Mm4);
      let rightDeflMm = (qRodNPerMm * (rightArmMm ** 4)) / (8 * R.E_MPa * netI_Mm4);

      for(const cr of childResults){
        const armMm = (cr.link.offset - enginePivotUnits) * mmPerUnit;
        const F_childN = (cr.report.totalMassGrams * 1e-3) * g_accel;
        const absArm = Math.abs(armMm);
        if(armMm < 0){
          leftMomentNmm += F_childN * absArm;
          leftDeflMm += (F_childN * (absArm ** 3)) / (3 * R.E_MPa * netI_Mm4);
        } else {
          rightMomentNmm += F_childN * absArm;
          rightDeflMm += (F_childN * (absArm ** 3)) / (3 * R.E_MPa * netI_Mm4);
        }
      }

      const maxMomentNmm = Math.max(leftMomentNmm, rightMomentNmm);
      const maxBendStressMPa = (maxMomentNmm * radiusMm) / netI_Mm4;
      const allowableRodStressMPa = R.morMPa / 3.0; // 3x safety factor for wood knots/grain runout

      if(maxBendStressMPa > allowableRodStressMPa){
        addIssue(maxBendStressMPa > R.morMPa / SF_FAIL ? 'ERROR' : 'WARN', 'rod_bending_stress', nodeId,
          `${R.name} "${nodeId}" bending stress (${maxBendStressMPa.toFixed(1)} MPa) exceeds safe working limit (${allowableRodStressMPa.toFixed(1)} MPa).`,
          { maxBendStressMPa, allowableRodStressMPa }
        );
      }

      const maxDeflMm = Math.max(leftDeflMm, rightDeflMm);
      const maxArmMm = Math.max(leftArmMm, rightArmMm, 1);
      // ratio test applies at every scale; the small absolute floor only ignores numerical dust
      if(maxDeflMm / maxArmMm > R.maxDeflectionRatio && maxDeflMm > 0.05){
        addIssue('WARN', 'rod_sagging', nodeId,
          `${R.name} "${nodeId}" tips sag by ${maxDeflMm.toFixed(2)} mm (${(maxDeflMm/maxArmMm*100).toFixed(2)}% of arm span); increase rod diameter above ${R.diameterMm} mm or switch to oak.`,
          { maxDeflMm, maxArmMm, ratio: maxDeflMm / maxArmMm }
        );
      }

      const rep = {
        nodeId, type: 'rod', material: R.material, depthLevel,
        lengthMm, selfMassGrams, childrenMassGrams, totalMassGrams,
        enginePivotMm: enginePivotUnits * mmPerUnit,
        truePivotMm: truePivotUnits * mmPerUnit,
        pivotOffsetMm, leanDeg: leanRad * 180 / Math.PI,
        maxDeflMm, maxBendStressMPa
      };
      nodeReports.push(rep);
      checkIncomingString(nodeId, parentLabel, incomingStringUnits, totalMassGrams, totalLoadN);
      return rep;
    }
  }

  function checkIncomingString(nodeId, parentLabel, stringUnits, supportedMassGrams, tensionN){
    const stringLengthMm = (stringUnits || 0) * mmPerUnit;
    if(tensionN > threadSafeWorkingN){
      const actualSF = threadKnottedBreakN / Math.max(1e-6, tensionN);
      addIssue(actualSF < SF_FAIL ? 'ERROR' : 'WARN', 'thread_overload', nodeId,
        `String above "${nodeId}" carries ${supportedMassGrams.toFixed(1)} g (safety factor ${actualSF.toFixed(1)}x vs knotted break strength ${(threadKnottedBreakN/g_accel*1000).toFixed(0)} g for ${T.diameterMm} mm ${T.name}).`,
        { supportedMassGrams, safetyFactor: actualSF, recommendedSafetyFactor: T.safetyFactor }
      );
    }
    // Check elastic stretch
    if(stringLengthMm > 0){
      const stretchMm = (tensionN * stringLengthMm) / (T.E_MPa * threadAreaMm2);
      if(stretchMm > 2.0){
        addIssue('WARN', 'thread_stretch', nodeId,
          `String above "${nodeId}" stretches by ${stretchMm.toFixed(2)} mm under load (${T.name}).`,
          { stretchMm, stringLengthMm }
        );
      }
    }
    // Check monofilament coil memory under very light loads
    if(supportedMassGrams < minStraightGrams && stringLengthMm > 15){
      addIssue('WARN', 'thread_coil_memory', nodeId,
        `Light load (${supportedMassGrams.toFixed(2)} g) on "${nodeId}" is below the ~${minStraightGrams.toFixed(1)} g threshold needed to pull ${T.diameterMm} mm ${T.name} straight against spool coil memory.`,
        { supportedMassGrams, minStraightGrams, recommendation: 'Use thinner monofilament (0.10-0.12 mm), heat-relax the line under tension, or use silk/glacé cotton on bottom tiers.' }
      );
    }
  }

  const rootReport = inspectNode(spec.root, 0, spec.string || 60, 'ceiling');
  const errorCount = issues.filter(i => i.severity === 'ERROR').length;
  const warnCount  = issues.filter(i => i.severity === 'WARN').length;
  const status = errorCount > 0 ? 'FAIL' : (warnCount > 0 ? 'WARN' : 'PASS');

  const report = {
    valid: errorCount === 0,
    status,
    errorCount,
    warnCount,
    materialsUsed: cfg,
    physicalTotals: {
      totalMassGrams: rootReport.totalMassGrams,
      nodeCount: nodeReports.length,
      shapeCount: nodeReports.filter(n => n.type === 'shape').length,
      rodCount: nodeReports.filter(n => n.type === 'rod').length
    },
    issues,
    nodes: nodeReports
  };

  // Log clear summary to developer console
  const badgeColor = status === 'PASS' ? '#1f7a3f' : (status === 'WARN' ? '#b87d14' : '#c8341f');
  console.groupCollapsed(
    `%c[MobileEngine Verify: ${status}]%c "${spec.title || 'Untitled'}" — Total mass: ${rootReport.totalMassGrams.toFixed(2)} g (${errorCount} errors, ${warnCount} warnings)`,
    `color:${badgeColor};font-weight:bold;`, 'color:inherit;'
  );
  console.log('Materials:', {
    shapes: `${S.layers}x ${S.thicknessMm}mm (total ${S.totalThicknessMm.toFixed(2)}mm) ${S.grade} ${S.material} (${S.glueType} glue)`,
    rods: `${R.diameterMm}mm ${R.name}`,
    thread: `${T.diameterMm}mm ${T.name}${T.transparent ? ' [transparent]' : ''}`
  });
  console.table(nodeReports.map(n => ({
    id: n.nodeId,
    type: n.type,
    spanOrLenMm: n.lengthMm.toFixed(1),
    selfGrams: n.selfMassGrams.toFixed(2),
    totalGrams: n.totalMassGrams.toFixed(2),
    edgeMarginOrDeflMm: n.type === 'shape' ? `${n.topMarginMm.toFixed(1)} mm edge` : `${n.maxDeflMm.toFixed(2)} mm sag`
  })));
  for(const iss of issues){
    if(iss.severity === 'ERROR') console.error(`[${iss.category}] (${iss.nodeId}): ${iss.message}`, iss.details);
    else console.warn(`[${iss.category}] (${iss.nodeId}): ${iss.message}`, iss.details);
  }
  console.groupEnd();

  return report;
}

// One line per shape: physical dimensions to cut and where to tie the thread.
function buildSheet(node, rows, mmPerUnit){
  mmPerUnit = mmPerUnit || 2.0;
  if(node.type === 'shape'){
    const s = node.size, h = attachOf(node)[1];
    rows.push({
      id: node._id || node.id || node.shape,
      lengthMm: s * 2 * mmPerUnit,
      weightG: node._selfMassGrams !== undefined ? node._selfMassGrams : (node._m !== undefined ? node._m : 0),
      fromEndMm: (s - h) * mmPerUnit,
      fromOtherMm: (s + h) * mmPerUnit,
      tiltDeg: node._slopeDeg !== undefined ? node._slopeDeg : (typeof node.slope === 'number' ? node.slope : 0)
    });
  }
  for(const c of (node.children||[])) buildSheet(c.node, rows, mmPerUnit);
  return rows;
}

// Sutherland-Hodgman clip of a polygon to the half-plane f(x,y) >= 0 (f linear).
function clipPoly(pts, f){
  const out = [];
  for(let i=0;i<pts.length;i++){
    const a = pts[i], b = pts[(i+1)%pts.length];
    const fa = f(a[0],a[1]), fb = f(b[0],b[1]);
    if(fa >= 0) out.push(a);
    if((fa >= 0) !== (fb >= 0)){
      const t = fa/(fa-fb);
      out.push([a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t]);
    }
  }
  return out;
}

function drawShapeSelf(parentGroup, defs, node, worldX, worldY, depth){
  const fr = shapeFrame(node);
  node._frame = fr; // children's attach points use the same transform
  if(!node._outline) node._outline = outlinePoints(node.shape, node.size);
  const outline = node._outline;

  const depthScale = 1 + Math.max(-0.18, Math.min(0.18, -depth*0.0009));
  const g = el('g', {transform:`translate(${worldX},${worldY}) scale(${depthScale})`});
  const baseFill = resolveColor(node.color);
  const strokeCol = baseFill === resolveColor('var(--white-shape)') ? '#1a1a1a' : 'none';
  const opacity = Math.max(0.8, Math.min(1, 1 - depth*0.0006));

  if(Math.abs(fr.kappa) < 1e-6){
    const pts = outline.map(([x,y])=>{ const p = fr.point(x,y); return p[0].toFixed(2)+','+p[1].toFixed(2); }).join(' ');
    const poly = el('polygon', {points:pts});
    poly.setAttribute('fill', shadeColor(baseFill, shadePct(fr.orient([0,0,1]))));
    poly.setAttribute('stroke', strokeCol);
    poly.setAttribute('stroke-width', '1.2');
    poly.setAttribute('stroke-linejoin', 'round');
    poly.setAttribute('opacity', opacity);
    g.appendChild(poly);
  } else {
    // A bent card is drawn as a stack of narrow strips cut across the bend
    // direction. Each strip is (nearly) planar, so it gets its own true
    // Lambert shade, and strips are painted far-to-near so the front of the
    // card correctly hides its back instead of the outline folding over itself.
    let umin = Infinity, umax = -Infinity;
    for(const [x,y] of outline){ const u = x*fr.cA + y*fr.sA; if(u<umin) umin=u; if(u>umax) umax=u; }
    const N = 28, strips = [];
    for(let i=0;i<N;i++){
      const u0 = umin + (umax-umin)*i/N, u1 = umin + (umax-umin)*(i+1)/N;
      let poly = clipPoly(outline, (x,y)=> (x*fr.cA + y*fr.sA) - u0);
      poly = clipPoly(poly, (x,y)=> u1 - (x*fr.cA + y*fr.sA));
      if(poly.length < 3) continue;
      const mp = poly.map(([x,y])=> fr.point(x,y));
      const zc = mp.reduce((a,q)=>a+q[2],0) / mp.length;
      const um = (u0+u1)/2, ks = fr.kappa*um;
      const n = fr.orient([-Math.sin(ks)*fr.cA, -Math.sin(ks)*fr.sA, Math.cos(ks)]);
      strips.push({mp, zc, col: shadeColor(baseFill, shadePct(n))});
    }
    strips.sort((a,b)=>a.zc-b.zc); // far first
    for(const st of strips){
      const poly = el('polygon', {points: st.mp.map(q=>q[0].toFixed(2)+','+q[1].toFixed(2)).join(' ')});
      poly.setAttribute('fill', st.col);
      poly.setAttribute('stroke', st.col); // hides hairline seams between strips
      poly.setAttribute('stroke-width', '0.8');
      poly.setAttribute('stroke-linejoin', 'round');
      poly.setAttribute('opacity', opacity);
      g.appendChild(poly);
    }
  }
  if(!HIDE_JOINTS) g.appendChild(el('circle', {cx:0, cy:0, r:2.6, fill:'var(--steel)'}));
  parentGroup.appendChild(g);
}

function drawRodSelf(parentGroup, node, worldX, worldY, yaw, lean){
  let minOff = 0, maxOff = 0;
  for(const c of (node.children||[])){ minOff = Math.min(minOff, c.offset); maxOff = Math.max(maxOff, c.offset); }
  const leftLocal = minOff - node._pivot, rightLocal = maxOff - node._pivot;
  const p1 = project(leftLocal, lean, yaw), p2 = project(rightLocal, lean, yaw);
  const rodLine = el('line', {
    x1: worldX+p1.dx, y1: worldY+p1.dy, x2: worldX+p2.dx, y2: worldY+p2.dy,
    stroke:'var(--steel)', 'stroke-width':4, 'stroke-linecap':'round'
  });
  parentGroup.appendChild(rodLine);
  parentGroup.appendChild(el('circle', {cx:worldX, cy:worldY, r:4.5, fill:'var(--steel)'}));
}

let hitList = [];
let HIDE_JOINTS = false; // spec.hideJoints: don't draw the dots where strings meet shapes
function drawNode(parentGroup, defs, node, worldX, worldY, depth){
  depth = depth || 0;
  const yaw = node._yaw || 0, lean = node._lean || 0, pivot = node._pivot || 0;
  const ce = Math.cos(camElev), se = Math.sin(camElev);

  if(node.type === 'shape') drawShapeSelf(parentGroup, defs, node, worldX, worldY, depth);
  else drawRodSelf(parentGroup, node, worldX, worldY, yaw, lean);

  hitList.push({x:worldX, y:worldY, r:(node.size||14)+6, node});

  for(const c of (node.children||[])){
    let ax, ay, childDepth;
    if(node.type === 'shape'){
      const q = c.at ? node._frame.point(c.at[0], c.at[1]) : node._frame.point(c.offset, (c.anchorY !== undefined ? c.anchorY : 1) * node.size);
      ax = worldX + q[0]; ay = worldY + q[1]; childDepth = depth + q[2];
    } else {
      const p = project(c.offset - pivot, lean, yaw);
      ax = worldX + p.dx; ay = worldY + p.dy; childDepth = depth + p.z;
    }
    if(!HIDE_JOINTS) parentGroup.appendChild(el('circle', {cx:ax, cy:ay, r:2.6, fill:'var(--steel)'}));
    const childWorldY = ay + c.string * ce;
    const nextDepth = childDepth - c.string * se;
    parentGroup.appendChild(el('line', {x1:ax, y1:ay, x2:ax, y2:childWorldY, stroke:'var(--string)', 'stroke-width':1.4}));
    drawNode(parentGroup, defs, c.node, ax, childWorldY, nextDepth);
  }
}

function countShapes(node){
  let n = node.type === 'shape' ? 1 : 0;
  for(const c of (node.children||[])) n += countShapes(c.node);
  return n;
}

/* ---------------- DOM scaffold ---------------- */
function injectSliderStyles(){
  if(document.getElementById('mobile-engine-slider-styles')) return;
  const style = document.createElement('style');
  style.id = 'mobile-engine-slider-styles';
  style.textContent = `
    #camControl {
      position: absolute;
      right: 26px;
      top: 50%;
      transform: translateY(-50%);
      background: var(--card, #F4F2EA);
      border: 1px solid #cfccbc;
      padding: 12px 10px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.08);
      user-select: none;
      z-index: 10;
    }
    #camControl .cam-title {
      font-size: 9.5px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--label-ink, #55534A);
      font-weight: 600;
      text-align: center;
      line-height: 1.2;
    }
    #camControl .cam-bound {
      font-size: 9px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--label-ink, #55534A);
      opacity: 0.75;
    }
    #camSlider {
      writing-mode: vertical-lr;
      direction: rtl;
      width: 18px;
      height: 170px;
      margin: 2px 0;
      cursor: ns-resize;
      accent-color: var(--ink, #17181A);
    }
    #camValue {
      font-size: 11px;
      font-weight: 600;
      color: var(--ink, #17181A);
      font-variant-numeric: tabular-nums;
      min-width: 36px;
      text-align: center;
    }
    
    #sheet {
      max-width: 340px;
      z-index: 10;
    }
    #sheet .verify-section {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid #cfccbc;
    }
    #sheet .verify-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      font-weight: 700;
      color: var(--ink, #17181A);
      margin: 0 0 6px;
    }
    #sheet .verify-badge {
      font-size: 9.5px;
      padding: 1px 6px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #fff;
      border-radius: 2px;
    }
    #sheet .verify-badge.pass { background: #1f7a3f; }
    #sheet .verify-badge.warn { background: #b87d14; }
    #sheet .verify-badge.fail { background: #c8341f; }
    #sheet .verify-pane {
      max-height: 150px;
      overflow-y: auto;
      overflow-x: hidden;
      border: 1px solid #d8d5c6;
      background: rgba(255, 255, 255, 0.45);
      padding: 6px 8px;
      font-size: 10px;
      line-height: 1.38;
    }
    #sheet .verify-item {
      padding: 4px 0 4px 7px;
      margin-bottom: 5px;
      border-left: 3px solid #9a9788;
      word-break: break-word;
    }
    #sheet .verify-item:last-child {
      margin-bottom: 0;
    }
    #sheet .verify-item.ERROR {
      border-left-color: var(--red, #C8341F);
    }
    #sheet .verify-item.WARN {
      border-left-color: #b87d14;
    }
    #sheet .verify-item-head {
      font-weight: 700;
      color: var(--ink, #17181A);
      margin-bottom: 1px;
    }
    #sheet .verify-item.ERROR .verify-item-head {
      color: var(--red, #C8341F);
    }
    #sheet .verify-item.WARN .verify-item-head {
      color: #8f5f0a;
    }
    #sheet .verify-ok {
      color: #1f7a3f;
      font-weight: 600;
    }
    
    
  `;
  document.head.appendChild(style);
}

function buildDOM(spec){
  injectSliderStyles();

  const eyebrow = document.createElement('div');
  eyebrow.className = 'eyebrow';
  eyebrow.innerHTML = `MOBILE STUDIO<span>a simulator for Calder-style hanging mobiles</span>`;
  document.body.appendChild(eyebrow);

  const controls = document.createElement('div');
  controls.id = 'controls';
  controls.innerHTML = `<button class="btn" id="btnPuff">Puff of Air</button><button class="btn" id="btnReset">Reset</button>`;
  document.body.appendChild(controls);

  const camControl = document.createElement('div');
  camControl.id = 'camControl';
  camControl.title = 'Adjust camera height relative to the mobile (double-click to reset)';
  const initDeg = Math.round(camElev * 180 / Math.PI);
  camControl.innerHTML = `
    <div class="cam-title">Camera<br>Height</div>
    <div class="cam-bound">High</div>
    <input type="range" id="camSlider" min="-60" max="60" step="1" value="${initDeg}" aria-label="Camera height">
    <div class="cam-bound">Low</div>
    <div id="camValue">${initDeg > 0 ? '+' + initDeg : initDeg}&deg;</div>
  `;
  document.body.appendChild(camControl);

  const svg = el('svg', {id:'stage', viewBox:'0 0 1000 700', preserveAspectRatio:'xMidYMid meet'});
  document.body.appendChild(svg);

  const placard = document.createElement('div');
  placard.id = 'placard';
  placard.innerHTML = `<p class="title" id="placardTitle"></p><p class="meta" id="placardMeta"></p>`;
  document.body.appendChild(placard);

  const hint = document.createElement('div');
  hint.id = 'hint';
  hint.innerHTML = `Click and drag any piece<br>to give it a spin`;
  document.body.appendChild(hint);

  return svg;
}

/* ---------------- entry point ---------------- */
function start(spec, shapeMat, rodMat, threadMat){
  HIDE_JOINTS = !!spec.hideJoints;
  if(typeof spec.cameraElevation === 'number'){
    camElev = spec.cameraElevation * Math.PI / 180;
  } else {
    camElev = DEFAULT_CAM_ELEV;
  }
  // One material model drives ids, masses (grams), hang tilts, balance points AND verification.
  const cfg = normalizeMaterialParams(spec, shapeMat, rodMat, threadMat);
  assignIds(spec.root);
  resolveWeights(spec.root, cfg);
  resolveTilts(spec.root);
  initPhysics(spec.root);

  // Run material & structural verification
  const verification = verifyMobile(spec, shapeMat, rodMat, threadMat);
  spec._verification = verification;

  const svg = buildDOM(spec);
  document.getElementById('placardTitle').textContent = spec.title || 'Untitled';
  document.getElementById('placardMeta').textContent =
    `${countShapes(spec.root)} elements · ${verification.physicalTotals.totalMassGrams.toFixed(1)} g · Verify: ${verification.status}`;

  // here
  if(spec.buildSheet || verification.issues.length > 0){
    const mmPerUnit = verification.materialsUsed.mmPerUnit;
    const rows = buildSheet(spec.root, [], mmPerUnit);
    const f1 = v => v.toFixed(1);
    const f2 = v => v.toFixed(2);
    const sheet = document.createElement('div');
    sheet.id = 'sheet';

    let html = '';
    if(spec.buildSheet){
      html +=
        '<p class="title">Build sheet</p>' +
        '<table>' +
          '<tr>' +
            '<th>leaf</th>' +
            '<th>len (mm)</th>' +
            '<th>wt (g)</th>' +
            '<th>hang (mm)</th>' +
            '<th>tilt (deg)</th>' +
          '</tr>' +
          rows.map(r =>
            `<tr>` +
              `<td>${r.id}</td>` +
              `<td>${f1(r.lengthMm)}</td>` +
              `<td>${f2(r.weightG)}</td>` +
              `<td>${f1(r.fromEndMm)}</td>` +
              `<td>${f1(Math.abs(r.tiltDeg))}°</td>` +
            `</tr>`
          ).join('') +
        '</table>' +
        `<p class="meta">scale = ${mmPerUnit} mm/unit; len = tip to base; hang = thread tie distance from fat end</p>`;
    }

    const statusCls = verification.status.toLowerCase();
    const issueItems = verification.issues.length === 0
      ? `<div class="verify-ok">All ${verification.physicalTotals.nodeCount} components passed material &amp; stability checks.</div>`
      : verification.issues.map(iss =>
          `<div class="verify-item ${iss.severity}">` +
            `<div class="verify-item-head">[${iss.severity}] ${iss.nodeId} &middot; ${iss.category}</div>` +
            `<div>${iss.message}</div>` +
          `</div>`
        ).join('');

    html +=
      `<div class="verify-section">` +
        `<div class="verify-header">` +
          `<span>Verification (${verification.errorCount} err, ${verification.warnCount} warn)</span>` +
          `<span class="verify-badge ${statusCls}">${verification.status}</span>` +
        `</div>` +
        `<div class="verify-pane">${issueItems}</div>` +
      `</div>`;

    sheet.innerHTML = html;
    document.body.appendChild(sheet);
    if(spec.buildSheet) console.table(rows);
  }

  const camSlider = document.getElementById('camSlider');
  const camValue = document.getElementById('camValue');
  function updateCamFromDeg(deg){
    camElev = deg * Math.PI / 180;
    camSlider.value = String(deg);
    camValue.innerHTML = `${deg > 0 ? '+' + deg : deg}&deg;`;
  }
  camSlider.addEventListener('input', ()=>{
    updateCamFromDeg( parseFloat(camSlider.value) );
  });
  camSlider.addEventListener('dblclick', ()=>{
    updateCamFromDeg( Math.round(DEFAULT_CAM_ELEV * 180 / Math.PI) );
  });

  let layer, defs;
  function rebuildScene(){
    svg.innerHTML = '';
    defs = el('defs', {});
    svg.appendChild(defs);
    layer = el('g', {id:'mobileLayer'});
    svg.appendChild(layer);
    svg.appendChild(el('rect', {x:495, y:14, width:10, height:10, fill:'var(--steel)'}));
  }
  function render(){
    rebuildScene();
    hitList = [];
    const rootTop = {x:500, y:24};
    const topStr = (spec.string||60) * Math.cos(camElev);
    const topDepth = -(spec.string||60) * Math.sin(camElev);
    layer.appendChild(el('line', {x1:rootTop.x, y1:rootTop.y, x2:rootTop.x, y2:rootTop.y+topStr,
      stroke:'var(--string)', 'stroke-width':1.4}));
    drawNode(layer, defs, spec.root, rootTop.x, rootTop.y+topStr, topDepth);
  }

  // interaction
  let dragging = null, lastPt = null;
  function svgPoint(evt){
    const pt = svg.createSVGPoint();
    const t = evt.touches ? evt.touches[0] : evt;
    pt.x = t.clientX; pt.y = t.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  function onDown(evt){
    const p = svgPoint(evt);
    let nearest = null, bestD = Infinity;
    for(const h of hitList){
      const d = Math.hypot(h.x-p.x, h.y-p.y);
      if(d < h.r+10 && d < bestD){ bestD = d; nearest = h; }
    }
    if(nearest){ dragging = nearest.node; lastPt = p; evt.preventDefault(); }
  }
  function onMove(evt){
    if(!dragging) return;
    const p = svgPoint(evt);
    dragging._yawOmega += (p.x - lastPt.x) * 0.02;
    lastPt = p;
    evt.preventDefault();
  }
  function onUp(){ dragging = null; }
  svg.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  svg.addEventListener('touchstart', onDown, {passive:false});
  window.addEventListener('touchmove', onMove, {passive:false});
  window.addEventListener('touchend', onUp);

  document.getElementById('btnPuff').addEventListener('click', ()=>{
    (function puff(node){
      node._yawOmega += (Math.random()-0.5) * 2.2;
      for(const c of (node.children||[])) puff(c.node);
    })(spec.root);
  });
  document.getElementById('btnReset').addEventListener('click', ()=>{
    initPhysics(spec.root);
    updateCamFromDeg( Math.round(DEFAULT_CAM_ELEV * 180 / Math.PI) );
  });

  let last = performance.now();
  const startTime = last;
  function frame(now){
    const dt = Math.min((now-last)/1000, 0.033);
    last = now;
    stepPhysics(spec.root, dt, (now-startTime)/1000);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

const api = { start, verifyMobile, weightFromShape, areaOfShape, MATERIAL_PRESETS };
if(typeof window !== 'undefined') window.MobileEngine = api;
if(typeof module !== 'undefined' && module.exports) module.exports = api;
})();
