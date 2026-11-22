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
    const rootLen = rootStringOf(spec);
    const topStr = rootLen * Math.cos(camElev);
    const topDepth = -rootLen * Math.sin(camElev);
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
