/* Check-only fixture (not built into dist): exercises every shape kind, nested rods, bend,
   orientation and targetSlope so check.js covers code paths the real mobiles do not.
   Its verifier status (FAIL, crowded on purpose) is irrelevant: only changes vs check.baseline.json matter.
   When you add a shape or node type, add one instance here, then run: node check.js --update */
const shapeMat = {
  material: 'balsa', grade: 'medium', thicknessMm: 1.588, layers: 2, crossGrainLayers: false,
  glueType: 'pva', warmWetBent: true, grainAngleDeg: 90, holeReinforced: true,
  minEdgeMarginMm: 3.0, finishCoatGPerM2: 20
};
const rodMat = { material: 'pine', diameterMm: 3.175, attachmentMethod: 'groove_tied', maxDeflectionRatio: 0.01 };
const threadMat = { material: 'cotton_glace', diameterMm: 0.25, safetyFactor: 4.0 };

const sh = (id, shape, size, extra) => Object.assign(
  { id, type: 'shape', shape, size, color: '#4a7', string: 40, children: [] }, extra || {});

window.MOBILE = {
  title: 'fixture: all shapes and rods',
  mmPerUnit: 2.0,
  root: { type: 'rod', id: 'R0', string: 60, children: [
    { offset: -70, node: sh('disc1', 'disc', 18) },
    { offset: -35, node: sh('blob1', 'blob', 18, { bend: 0.6, bendAxis: 0 }) },
    { offset: 0, node: { type: 'rod', id: 'R1', string: 50, children: [
      { offset: -40, node: sh('cres1', 'crescent', 20) },
      { offset: 0, node: sh('dia1', 'diamond', 18, { orientation: 30 }) },
      { offset: 40, node: sh('leaf1', 'leaf', 20, { bend: 1.0, bendAxis: 90 }) }
    ] } },
    { offset: 45, node: { type: 'rod', id: 'R2', string: 50, children: [
      { offset: -30, node: sh('teardrop1', 'teardrop', 22, { orientation: 90, targetSlope: -15, bend: 1.0, bendAxis: 90 }) },
      { offset: 5, node: sh('tri1', 'triangle', 18) },
      { offset: 40, node: sh('rect1', 'rect', 16, { weight: 4 }) }
    ] } }
  ] }
};
