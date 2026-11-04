/* ============================================================
   MOBILE STUDIO — shared engine
   Include this after mobile-engine.css, then call:
     MobileEngine.start({ title, string, root });
   from your mobile's own small HTML file.
   ------------------------------------------------------------
   SCHEMA
   Any node (rod OR shape) can have children:
     children: [ { offset:<number>, string:<number>, anchorY?:<0..1>, node:<node> }, ... ]

   "rod" node:
     { type:'rod',
       pivot: <number|undefined> }   // local x of hang point; omit to auto-balance

   "shape" node:
     { type:'shape', shape:'disc'|'blob'|'crescent'|'diamond'|'leaf'|'triangle',
       size:<number>, color:'#hex', weight:<number|undefined>, // omit weight to auto-derive from area
       density:<number optional>,    // material density used only when weight is omitted
       orientation:<degrees, static in-plane rotation, default 0>,
       tilt:<radians, static panel pitch (foreshortens vertically), default 0>,
       curve:<-1..1 optional, shaded cue for a curved/cupped panel>,
       curveDirection:'up'|'down'|'left'|'right' (default 'down') }

   A shape's children hang from a point on the shape itself:
     offset = horizontal distance from the shape's center
     anchorY = fraction of size below center to attach (default 1 = bottom edge)
   ============================================================ */
(function(){

const DEFAULT_AREAL_DENSITY = 0.0016; // weight per unit area when a shape omits `weight`

/* ---------------- geometry / area ---------------- */
function shapeDef(shape, size){
  switch(shape){
    case 'disc':
      return {kind:'circle', r:size};
    case 'diamond':
      return {kind:'polygon', points:[[0,-size],[size*0.72,0],[0,size],[-size*0.72,0]]};
    case 'triangle':
      return {kind:'polygon', points:[[0,-size],[size,size*0.8],[-size,size*0.8]]};
    case 'crescent': {
      const r = size;
      return {kind:'path', d:`M ${-r*0.2} ${-r} A ${r} ${r} 0 1 0 ${-r*0.2} ${r} A ${r*0.78} ${r*0.78} 0 1 1 ${-r*0.2} ${-r} Z`};
    }
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

// hidden scratch <svg><path> used to measure the area of curved (bezier) shapes
let scratchPath = null;
function getScratchPath(){
  if(scratchPath) return scratchPath;
  const holder = document.createElementNS('http://www.w3.org/2000/svg','svg');
  holder.setAttribute('style','position:fixed;width:0;height:0;overflow:hidden;visibility:hidden;');
  scratchPath = document.createElementNS('http://www.w3.org/2000/svg','path');
  holder.appendChild(scratchPath);
  document.body.appendChild(holder);
  return scratchPath;
}
function areaFromPathD(d, samples){
  samples = samples || 72;
  const p = getScratchPath();
  p.setAttribute('d', d);
  const len = p.getTotalLength();
  const pts = [];
  for(let i=0;i<samples;i++){
    const pt = p.getPointAtLength(len * i / samples);
    pts.push([pt.x, pt.y]);
  }
  return shoelace(pts);
}

// Area of a shape at a given size, in the same square-unit system as `size`.
// Exact for disc/diamond/triangle; numerically sampled (shoelace on the
// actual rendered outline) for the curved shapes, so it stays accurate if
// their path formulas ever change.
function areaOfShape(shape, size){
  const def = shapeDef(shape, size);
  if(def.kind === 'circle') return Math.PI * def.r * def.r;
  if(def.kind === 'polygon') return shoelace(def.points);
  return areaFromPathD(def.d);
}

// Derive a plausible weight from a flat cut shape, the way an actual
// mobile-maker's material would: weight scales with area. `density` is
// mass per unit area (default tuned so a size-34 disc weighs about 6,
// matching the original hand-picked example weights). Pass a smaller
// density for thin wire-hung shapes, larger for heavier stock.
function weightFromShape(shape, size, density){
  return areaOfShape(shape, size) * (density !== undefined ? density : DEFAULT_AREAL_DENSITY);
}

// Fill in node.weight for any shape node that omitted it, recursively.
function resolveWeights(node){
  if(!node) return;
  if(node.type === 'shape' && node.weight === undefined){
    node.weight = weightFromShape(node.shape, node.size, node.density);
  }
  for(const c of (node.children || [])) resolveWeights(c.node);
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

function massOf(node){
  let m = node.type === 'shape' ? node.weight : 0.6;
  for(const c of (node.children || [])) m += massOf(c.node);
  return m;
}

function initPhysics(node){
  node._mass = massOf(node);
  if(node.type === 'rod'){
    if(node.pivot === undefined){
      let sum = 0, wsum = 0;
      for(const c of (node.children||[])){
        const m = massOf(c.node);
        sum += m * c.offset; wsum += m;
      }
      node._pivot = wsum > 0 ? sum / wsum : 0;
    } else {
      node._pivot = node.pivot;
    }
    let imbalance = 0;
    for(const c of (node.children||[])){
      imbalance += massOf(c.node) * (c.offset - node._pivot);
    }
    node._leanBase = Math.max(-LEAN_MAX, Math.min(LEAN_MAX, imbalance / (node._mass * LEAN_SPAN)));
  } else {
    node._pivot = 0;
    node._leanBase = 0;
  }
  node._swayPhase = Math.random() * Math.PI * 2;
  node._swayFreq = SWAY_FREQ * (0.7 + Math.random()*0.6);
  node._yaw = (Math.random()-0.5) * 0.6;
  node._yawOmega = (Math.random()-0.5) * 0.3;
  for(const c of (node.children||[])) initPhysics(c.node);
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
// the vertical axis. Yaw never touches height, so relative heights hold
// as a piece turns -- exactly like the real thing.
function project(lx, lean, yaw){
  const liftY = lx * Math.sin(lean);
  const spanH = lx * Math.cos(lean);
  const dx = spanH * Math.cos(yaw);
  const z  = spanH * Math.sin(yaw);
  return { dx, dy: -liftY, z };
}

let gradientCounter = 0;
function curveFill(defs, baseColor, curve, direction){
  if(!curve) return baseColor;
  const id = 'curve' + (gradientCounter++);
  const dirs = {
    down:  [0,0,0,1],
    up:    [0,1,0,0],
    right: [0,0,1,0],
    left:  [1,0,0,0],
  };
  const [x1,y1,x2,y2] = dirs[direction || 'down'];
  const amt = Math.min(1, Math.abs(curve)) * 38;
  const g = el('linearGradient', {id, x1,y1,x2,y2});
  const stopA = el('stop', {offset:'0%', 'stop-color': curve>0 ? shadeColor(baseColor, amt) : shadeColor(baseColor, -amt)});
  const stopB = el('stop', {offset:'100%', 'stop-color': curve>0 ? shadeColor(baseColor, -amt) : shadeColor(baseColor, amt)});
  g.appendChild(stopA); g.appendChild(stopB);
  defs.appendChild(g);
  return `url(#${id})`;
}

function drawShapeSelf(parentGroup, defs, node, worldX, worldY, depth){
  const depthScale = 1 + Math.max(-0.18, Math.min(0.18, -depth*0.0009));
  const scaleX = depthScale * Math.cos(node._yaw);
  const scaleY = depthScale * Math.cos(node.tilt || 0);
  const g = el('g', {transform:`translate(${worldX},${worldY}) rotate(${node.orientation||0}) scale(${scaleX},${scaleY})`});
  const shape = shapePath(node.shape, node.size);
  const baseFill = resolveColor(node.color);
  const fill = node.curve ? curveFill(defs, baseFill, node.curve, node.curveDirection) : baseFill;
  shape.setAttribute('fill', fill);
  shape.setAttribute('stroke', baseFill === resolveColor('var(--white-shape)') ? '#1a1a1a' : 'none');
  shape.setAttribute('stroke-width', '1.2');
  shape.setAttribute('opacity', Math.max(0.8, Math.min(1, 1 - depth*0.0006)));
  g.appendChild(shape);
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
function drawNode(parentGroup, defs, node, worldX, worldY, depth){
  depth = depth || 0;
  const yaw = node._yaw || 0, lean = node._lean || 0, pivot = node._pivot || 0;

  if(node.type === 'shape') drawShapeSelf(parentGroup, defs, node, worldX, worldY, depth);
  else drawRodSelf(parentGroup, node, worldX, worldY, yaw, lean);

  hitList.push({x:worldX, y:worldY, r:(node.size||14)+6, node});

  for(const c of (node.children||[])){
    const lx = c.offset - pivot;
    const anchorY = node.type === 'shape' ? (c.anchorY !== undefined ? c.anchorY : 1) * node.size : 0;
    const p = project(lx, lean, yaw);
    const ax = worldX + p.dx, ay = worldY + p.dy + anchorY;
    const childDepth = depth + p.z;
    parentGroup.appendChild(el('circle', {cx:ax, cy:ay, r:2.6, fill:'var(--steel)'}));
    const childWorldY = ay + c.string;
    parentGroup.appendChild(el('line', {x1:ax, y1:ay, x2:ax, y2:childWorldY, stroke:'var(--string)', 'stroke-width':1.4}));
    drawNode(parentGroup, defs, c.node, ax, childWorldY, childDepth);
  }
}

function countShapes(node){
  let n = node.type === 'shape' ? 1 : 0;
  for(const c of (node.children||[])) n += countShapes(c.node);
  return n;
}

/* ---------------- DOM scaffold ---------------- */
function buildDOM(spec){
  const eyebrow = document.createElement('div');
  eyebrow.className = 'eyebrow';
  eyebrow.innerHTML = `MOBILE STUDIO<span>a simulator for Calder-style hanging mobiles</span>`;
  document.body.appendChild(eyebrow);

  const controls = document.createElement('div');
  controls.id = 'controls';
  controls.innerHTML = `<button class="btn" id="btnPuff">Puff of Air</button><button class="btn" id="btnReset">Reset</button>`;
  document.body.appendChild(controls);

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
function start(spec){
  resolveWeights(spec.root);
  initPhysics(spec.root);

  const svg = buildDOM(spec);
  document.getElementById('placardTitle').textContent = spec.title || 'Untitled';
  document.getElementById('placardMeta').textContent =
    `${countShapes(spec.root)} elements \u00b7 hand-balanced \u00b7 2026`;

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
    layer.appendChild(el('line', {x1:rootTop.x, y1:rootTop.y, x2:rootTop.x, y2:rootTop.y+(spec.string||60),
      stroke:'var(--string)', 'stroke-width':1.4}));
    drawNode(layer, defs, spec.root, rootTop.x, rootTop.y+(spec.string||60), 0);
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
  document.getElementById('btnReset').addEventListener('click', ()=> initPhysics(spec.root));

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

window.MobileEngine = { start, weightFromShape, areaOfShape };
})();
