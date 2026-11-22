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
    const len = stringOf(c);
    const childWorldY = ay + len * ce;
    const nextDepth = childDepth - len * se;
    parentGroup.appendChild(el('line', {x1:ax, y1:ay, x2:ax, y2:childWorldY, stroke:'var(--string)', 'stroke-width':1.4}));
    drawNode(parentGroup, defs, c.node, ax, childWorldY, nextDepth);
  }
}

function countShapes(node){
  let n = node.type === 'shape' ? 1 : 0;
  for(const c of (node.children||[])) n += countShapes(c.node);
  return n;
}

