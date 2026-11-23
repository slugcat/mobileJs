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
  const opt = (k, def)=> optIn[k] !== undefined ? optIn[k] : (spec && spec[k] !== undefined ? spec[k] : def);
  // Dynamic load factor: a pendulum swinging through amplitude th0 pulls its string with T = m*g*(3 - 2cos th0) at the bottom.
  const maxSwingDeg = opt('maxSwingDeg', 30);
  const dlfIn = opt('dynamicLoadFactor', undefined);
  const dynamicLoadFactor = Math.max(1, dlfIn !== undefined ? dlfIn : 3 - 2*Math.cos(maxSwingDeg*Math.PI/180));
  const clearanceSwingDeg = opt('clearanceSwingDeg', 5);
  const minSwingClearanceMm = opt('minSwingClearanceMm', 5);

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
    finishCoatGPerM2: sIn.finishCoatGPerM2 !== undefined ? sIn.finishCoatGPerM2
                    : (shapePresetGroup.finishCoatGPerM2 !== undefined ? shapePresetGroup.finishCoatGPerM2 : 20) // balsa: painted, grain hidden
  };

  // 2. Rod material normalization (round rod of specified diameter; see MATERIAL_PRESETS.rods)
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

  // Parameters that depend on more than one material group
  shapes.pinholeDiameterMm = sIn.pinholeDiameterMm !== undefined ? sIn.pinholeDiameterMm : Math.max(0.6, 2 * threads.diameterMm);
  shapes.minHoleSpacingMm  = sIn.minHoleSpacingMm  !== undefined ? sIn.minHoleSpacingMm  : 2 * shapes.minEdgeMarginMm;
  rods.grooveDepthMm = rIn.grooveDepthMm !== undefined ? rIn.grooveDepthMm
                     : (baseRod.grooveable === false ? 0   // carbon / glass / metal: no cut groove
                     : Math.min(0.25 * rods.diameterMm, Math.max(0.5, 2 * threads.diameterMm)));
  rods.grooveKt = rIn.grooveKt || 1.3;
  rods.minTieSpacingMm = rIn.minTieSpacingMm !== undefined ? rIn.minTieSpacingMm
                       : (rods.attachmentMethod === 'drilled_hole' ? Math.max(5 * rods.holeDiameterMm, 2 * rods.diameterMm)
                                                                   : Math.max(3, 1.5 * rods.diameterMm));

  return { mmPerUnit, shapes, rods, thread: threads, warnings,
           dynamicLoadFactor, maxSwingDeg, clearanceSwingDeg, minSwingClearanceMm };
}

