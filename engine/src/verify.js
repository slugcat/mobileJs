function verifyMobile(spec, shapeMat, rodMat, threadMat, options){
  if(!spec || !spec.root){
    return { valid: false, status: 'ERROR', issues: [{ severity: 'ERROR', category: 'spec', message: 'Missing spec.root' }] };
  }

  const cfg = normalizeMaterialParams(spec, shapeMat, rodMat, threadMat, options);
  const { mmPerUnit, shapes: S, rods: R, thread: T } = cfg;
  const g_accel = 9.80665; // m/s^2 (N per kg)
  const DLF = cfg.dynamicLoadFactor; // swing amplification applied to every load check

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
      const cRes = inspectNode(c.node, depthLevel + 1, stringOf(c), nodeId);
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
        const designLoadN = totalLoadN * DLF; // static weight x dynamic (swing) factor
        if(designLoadN > tearOutCapacityN / 2.5){
          addIssue(designLoadN > tearOutCapacityN / SF_FAIL ? 'ERROR' : 'WARN', 'hole_tearout_stress', nodeId,
            `Suspension load (${totalMassGrams.toFixed(1)} g x ${DLF.toFixed(2)} dynamic) at upper pinhole of "${nodeId}" approaches ${S.material} tear-out strength (safety factor ${(tearOutCapacityN/Math.max(1e-5, designLoadN)).toFixed(1)}x).`,
            { loadN: totalLoadN, designLoadN, dynamicLoadFactor: DLF, tearOutCapacityN }
          );
        }
        // Check "cheese-wire" bearing pressure of ultra-thin thread cutting into the sheet
        const bearingStressMPa = designLoadN / (Math.max(0.08, T.diameterMm) * S.totalThicknessMm);
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

      // 5b. Hole-to-hole spacing: the upper hang hole and every child's lower hole share one sheet.
      //     Centres closer than the required spacing leave a thin ligament that splits or tears between them.
      {
        const holes = [{ label: 'hang hole', pt: attachPt }];
        for(const cr of childResults) holes.push({ label: `hole for "${cr.report.nodeId}"`, pt: childFlatPoint(node, cr.link) });
        for(let a = 0; a < holes.length; a++){
          for(let b = a + 1; b < holes.length; b++){
            const spMm = Math.hypot(holes[a].pt[0] - holes[b].pt[0], holes[a].pt[1] - holes[b].pt[1]) * mmPerUnit;
            if(spMm < S.pinholeDiameterMm + 0.1){
              addIssue('ERROR', 'holes_overlap', nodeId,
                `On "${nodeId}" the ${holes[a].label} and the ${holes[b].label} are ${spMm.toFixed(2)} mm apart; the ${S.pinholeDiameterMm.toFixed(2)} mm pinholes would run into each other.`,
                { spacingMm: spMm, pinholeDiameterMm: S.pinholeDiameterMm }
              );
            } else if(spMm < S.minHoleSpacingMm){
              addIssue('WARN', 'hole_spacing_tight', nodeId,
                `On "${nodeId}" the ${holes[a].label} and the ${holes[b].label} are ${spMm.toFixed(2)} mm apart (recommended >= ${S.minHoleSpacingMm.toFixed(1)} mm); the ligament between them may split or tear.`,
                { spacingMm: spMm, minHoleSpacingMm: S.minHoleSpacingMm }
              );
            }
          }
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
      // Tie spacing along the rod (the pivot tie plus one tie per child). Ties that close split the dowel
      // between them or make the knots foul each other. Skipped for under-populated rods (already flagged).
      if((node.children || []).length >= 2){
        const ties = [{ label: 'pivot', x: enginePivotUnits }];
        for(const cr of childResults) ties.push({ label: `"${cr.report.nodeId}"`, x: cr.link.offset });
        ties.sort((p, q) => p.x - q.x);
        const overlapMm = R.attachmentMethod === 'drilled_hole' ? R.holeDiameterMm + 0.1 : 1.0;
        for(let k = 1; k < ties.length; k++){
          const spMm = (ties[k].x - ties[k-1].x) * mmPerUnit;
          if(spMm < overlapMm){
            addIssue('ERROR', 'ties_overlap', nodeId,
              `On rod "${nodeId}" the ${ties[k-1].label} tie and the ${ties[k].label} tie are ${spMm.toFixed(2)} mm apart; they cannot be tied separately.`,
              { spacingMm: spMm }
            );
          } else if(spMm < R.minTieSpacingMm){
            addIssue('WARN', 'tie_spacing_tight', nodeId,
              `On rod "${nodeId}" the ${ties[k-1].label} tie and the ${ties[k].label} tie are ${spMm.toFixed(2)} mm apart (recommended >= ${R.minTieSpacingMm.toFixed(1)} mm for a ${R.diameterMm} mm ${R.material} rod); the dowel may split between them.`,
              { spacingMm: spMm, minTieSpacingMm: R.minTieSpacingMm }
            );
          }
        }
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

      const maxMomentNmm = Math.max(leftMomentNmm, rightMomentNmm) * DLF; // static moment x dynamic factor
      const maxBendStressMPa = (maxMomentNmm * radiusMm) / netI_Mm4;
      const allowableRodStressMPa = R.morMPa / 3.0; // 3x safety factor for wood knots/grain runout

      if(maxBendStressMPa > allowableRodStressMPa){
        addIssue(maxBendStressMPa > R.morMPa / SF_FAIL ? 'ERROR' : 'WARN', 'rod_bending_stress', nodeId,
          `${R.name} "${nodeId}" bending stress (${maxBendStressMPa.toFixed(1)} MPa) exceeds safe working limit (${allowableRodStressMPa.toFixed(1)} MPa).`,
          { maxBendStressMPa, allowableRodStressMPa }
        );
      }

      // Groove weakening. A tied groove cuts a ring out of the dowel, so at every tie the section is the
      // reduced core (diameter D - 2 x depth) with a notch allowance Kt. The pivot tie sees the largest moment,
      // so this is usually the weakest section on the rod. (drilled_hole rods are covered by the hole check above.)
      let maxGrooveStressMPa = 0;
      if(R.attachmentMethod === 'groove_tied' && R.grooveDepthMm > 0){
        const dNet = R.diameterMm - 2 * R.grooveDepthMm;
        if(dNet <= 0.2 * R.diameterMm){
          addIssue('ERROR', 'rod_groove_too_deep', nodeId,
            `A ${R.grooveDepthMm.toFixed(2)} mm groove leaves only a ${Math.max(0, dNet).toFixed(2)} mm core in the ${R.diameterMm} mm ${R.material} rod "${nodeId}".`,
            { grooveDepthMm: R.grooveDepthMm, coreDiameterMm: dNet }
          );
        } else {
          const coreI = (Math.PI * (dNet ** 4)) / 64;
          // bending moment (N*mm, static) at distance s from the pivot on one side (side = -1 left, +1 right)
          const momentAt = (side, s)=>{
            const armEnd = side < 0 ? leftArmMm : rightArmMm;
            let M = 0.5 * qRodNPerMm * (Math.max(0, armEnd - s) ** 2);
            for(const cr of childResults){
              const out = (cr.link.offset - enginePivotUnits) * mmPerUnit * side; // distance out along this side
              if(out >= s - 1e-9) M += ((cr.report.totalMassGrams * 1e-3) * g_accel) * (out - s);
            }
            return M;
          };
          let where = 'pivot';
          const probe = (side, s, label)=>{
            const sigma = R.grooveKt * (momentAt(side, s) * DLF) * (dNet / 2) / coreI;
            if(sigma > maxGrooveStressMPa){ maxGrooveStressMPa = sigma; where = label; }
          };
          probe(-1, 0, 'pivot'); probe(1, 0, 'pivot');
          for(const cr of childResults){
            const armMm = (cr.link.offset - enginePivotUnits) * mmPerUnit;
            probe(armMm < 0 ? -1 : 1, Math.abs(armMm), `"${cr.report.nodeId}"`);
          }
          if(maxGrooveStressMPa > allowableRodStressMPa){
            addIssue(maxGrooveStressMPa > R.morMPa / SF_FAIL ? 'ERROR' : 'WARN', 'rod_groove_weakening', nodeId,
              `Tie groove (${R.grooveDepthMm.toFixed(2)} mm deep) at the ${where} tie leaves a ${dNet.toFixed(2)} mm core in the ${R.diameterMm} mm ${R.material} rod "${nodeId}": ${maxGrooveStressMPa.toFixed(1)} MPa exceeds the safe ${allowableRodStressMPa.toFixed(1)} MPa. Use a shallower nick, a thicker dowel, or glue a bead instead of cutting.`,
              { maxGrooveStressMPa, allowableRodStressMPa, grooveDepthMm: R.grooveDepthMm, coreDiameterMm: dNet, where }
            );
          }
        }
      }

      const maxDeflMm = Math.max(leftDeflMm, rightDeflMm);
      const maxArmMm = Math.max(leftArmMm, rightArmMm, 1);
      // ratio test applies at every scale; the small absolute floor only ignores numerical dust
      if(maxDeflMm / maxArmMm > R.maxDeflectionRatio && maxDeflMm > 0.05){
        addIssue('WARN', 'rod_sagging', nodeId,
          `${R.name} "${nodeId}" tips sag by ${maxDeflMm.toFixed(2)} mm (${(maxDeflMm/maxArmMm*100).toFixed(2)}% of arm span); increase rod diameter above ${R.diameterMm} mm or switch to a stiffer rod (oak, birch, carbon_fiber).`,
          { maxDeflMm, maxArmMm, ratio: maxDeflMm / maxArmMm }
        );
      }

      const rep = {
        nodeId, type: 'rod', material: R.material, depthLevel,
        lengthMm, selfMassGrams, childrenMassGrams, totalMassGrams,
        enginePivotMm: enginePivotUnits * mmPerUnit,
        truePivotMm: truePivotUnits * mmPerUnit,
        pivotOffsetMm, leanDeg: leanRad * 180 / Math.PI,
        maxDeflMm, maxBendStressMPa, maxGrooveStressMPa
      };
      nodeReports.push(rep);
      checkIncomingString(nodeId, parentLabel, incomingStringUnits, totalMassGrams, totalLoadN);
      return rep;
    }
  }

  function checkIncomingString(nodeId, parentLabel, stringUnits, supportedMassGrams, tensionN){
    const stringLengthMm = (stringUnits || 0) * mmPerUnit;
    const dynamicN = tensionN * DLF; // static weight x swing amplification
    if(dynamicN > threadSafeWorkingN){
      const actualSF = threadKnottedBreakN / Math.max(1e-6, dynamicN);
      addIssue(actualSF < SF_FAIL ? 'ERROR' : 'WARN', 'thread_overload', nodeId,
        `String above "${nodeId}" carries ${supportedMassGrams.toFixed(1)} g x ${DLF.toFixed(2)} dynamic (safety factor ${actualSF.toFixed(1)}x vs knotted break strength ${(threadKnottedBreakN/g_accel*1000).toFixed(0)} g for ${T.diameterMm} mm ${T.name}).`,
        { supportedMassGrams, safetyFactor: actualSF, recommendedSafetyFactor: T.safetyFactor, dynamicLoadFactor: DLF }
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

  // Swing clearance. Every part spins about its own string, the strings above it carry it round (each ancestor's
  // spin moves the next attach point), strings sway as pendulums, and rods lean. Anything above the pair's lowest
  // common ancestor (LCA) turns both parts together, so only the chain below the LCA adds slack.
  //
  // Each part is compared by what it really occupies at each height, not by one bounding cylinder, so a tilted or
  // bent sheet is a thin diagonal slab and not a fat drum:
  //   - a part that spins freely about its own string sweeps a RING PROFILE: for each height bin, the radial
  //     intervals (distance from its string axis) its surface occupies there.
  //   - a part that is the LCA of the other turns rigidly with the other's hang point, so it is NOT swept round
  //     its own axis; its actual fixed geometry is compared with the other's ring profile about that other axis.
  // Overlap with zero slack is a certain hit (ERROR). Overlap only once string sway / intermediate spin is
  // allowed for is a risk (WARN); less than minSwingClearanceMm of room is a tight-clearance WARN.
  function checkSwingClearance(){
    const SW = Math.sin(cfg.clearanceSwingDeg * Math.PI / 180);
    const minClear = cfg.minSwingClearanceMm / mmPerUnit;
    const BIN = Math.max(minClear / 4, 0.25);   // height / radius resolution, simulator units
    const MAX_CELLS = 100000;                   // cap on grid cells sampled per sheet
    const recs = [];

    // Surface of a sheet in its own frame (X right, Y down, Z toward viewer, origin at the string end).
    // The bend is a cylinder (isometric), so flat-grid spacing `step` bounds the 3-D gap between samples.
    function surfacePoints(node, fr){
      const ol = node._outline || (node._outline = outlinePoints(node.shape, node.size));
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for(const [x, y] of ol){ x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      let step = BIN / 2;
      const cells = ((x1 - x0) / step) * ((y1 - y0) / step);
      if(cells > MAX_CELLS) step *= Math.sqrt(cells / MAX_CELLS);
      const pts = [];
      for(let y = y0 + step / 2; y < y1; y += step){   // scanline fill, same even-odd rule as pointInPoly
        const xs = [];
        for(let i = 0; i < ol.length; i++){
          const p = ol[i], q = ol[(i + 1) % ol.length];
          if((p[1] > y) !== (q[1] > y)) xs.push(p[0] + (y - p[1]) * (q[0] - p[0]) / (q[1] - p[1]));
        }
        xs.sort((u, v) => u - v);
        for(let k = 0; k + 1 < xs.length; k += 2)
          for(let x = x0 + step / 2 + Math.ceil((xs[k] - x0 - step / 2) / step) * step; x <= xs[k + 1]; x += step)
            pts.push(fr.phys(x, y));
      }
      for(let i = 0; i < ol.length; i++){          // the cut edge, densified
        const a = ol[i], b = ol[(i + 1) % ol.length];
        const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
        for(let k = 0; k < n; k++) pts.push(fr.phys(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n));
      }
      return { pts, step };
    }

    // Ring profile of a point set: per height bin, merged radial intervals about the vertical axis.
    function ringProfile(pts, pad, bin){
      const cellsMap = new Map();
      let rho = 0, yLo = Infinity, yHi = -Infinity;
      for(const p of pts){
        const r = Math.hypot(p[0], p[2]), y = p[1];
        const iy = Math.floor(y / bin), ir = Math.floor(r / bin), key = (iy + 100000) * 100000 + ir;
        const c = cellsMap.get(key);
        if(!c) cellsMap.set(key, [r, r, y, y, iy, ir]);
        else { if(r < c[0]) c[0] = r; if(r > c[1]) c[1] = r; if(y < c[2]) c[2] = y; if(y > c[3]) c[3] = y; }
        if(r > rho) rho = r;
        if(y < yLo) yLo = y;
        if(y > yHi) yHi = y;
      }
      const byRow = new Map();
      for(const c of cellsMap.values()){
        let row = byRow.get(c[4]);
        if(!row){ row = []; byRow.set(c[4], row); }
        row.push(c);
      }
      const rows = [], index = new Map();
      for(const [iy, cs] of byRow){
        cs.sort((p, q) => p[5] - q[5]);
        const iv = [];
        let cur = [cs[0][0], cs[0][1]], last = cs[0][5], lo = cs[0][2], hi = cs[0][3];
        for(let k = 1; k < cs.length; k++){
          lo = Math.min(lo, cs[k][2]); hi = Math.max(hi, cs[k][3]);
          if(cs[k][5] <= last + 1){ cur[0] = Math.min(cur[0], cs[k][0]); cur[1] = Math.max(cur[1], cs[k][1]); }
          else { iv.push([Math.max(0, cur[0] - pad), cur[1] + pad]); cur = [cs[k][0], cs[k][1]]; }
          last = cs[k][5];
        }
        iv.push([Math.max(0, cur[0] - pad), cur[1] + pad]);
        const row = { lo: lo - pad, hi: hi + pad, iv };
        rows.push(row); index.set(iy, row);
      }
      return { rows, index, bin, rho: rho + pad, yLo: yLo - pad, yHi: yHi + pad };
    }

    (function walk(node, path, edges, X, Z, Y){
      const rec = { node, id: node._id, path: path.concat([node]), edges, X, Z, Y };
      if(node.type === 'shape'){
        const fr = shapeFrame(node), sp = surfacePoints(node, fr);
        rec.fr = fr; rec.pts = sp.pts; rec.pad = 0;
        rec.prof = ringProfile(sp.pts, 0, Math.max(BIN, 2 * sp.step));
      } else {
        // a rod rocks about its balance point: sample it at lean +/- (static lean + sway)
        const [mn, mx] = rodExtent(node), piv = node._pivot || 0;
        const L = Math.abs(node._leanBase || 0) + SWAY_AMPLITUDE;
        const n = Math.max(2, Math.ceil((mx - mn) / (BIN / 2))), pts = [];
        for(const lean of [-L, L])
          for(let k = 0; k <= n; k++){
            const lx = (mn - piv) + (mx - mn) * k / n;
            pts.push([lx * Math.cos(lean), -lx * Math.sin(lean), 0]);
          }
        rec.pts = pts; rec.pad = R.diameterMm / 2 / mmPerUnit;
        rec.prof = ringProfile(pts, rec.pad, BIN);
      }
      recs.push(rec);
      for(const c of (node.children || [])){
        let vx, vz, vy, yTol = 0;
        if(node.type === 'shape'){
          const q = childFlatPoint(node, c), p = rec.fr.phys(q[0], q[1]);
          vx = p[0]; vz = p[2]; vy = p[1];
        } else {
          const lx = c.offset - (node._pivot || 0), lean = node._leanBase || 0;
          vx = lx * Math.cos(lean); vz = 0; vy = -lx * Math.sin(lean);
          yTol = Math.abs(lx) * SWAY_AMPLITUDE; // the rod rocks, so one end rises while the other drops
        }
        const len = stringOf(c);
        walk(c.node, rec.path, edges.concat([{ m: Math.hypot(vx, vz), len, yTol }]), X + vx, Z + vz, Y + vy + len);
      }
    })(spec.root, [], [], 0, 0, 0);

    // Two free spinners: rings about axes D apart, which the slack can move D +/- slack. Worst (smallest) of
    // max(horizontal gap, vertical gap) over every pair of height bins that could interact.
    function ringGap(A, B, D, slack, vt){
      let best = null;
      for(const ra of A.prof.rows){
        const a0 = A.Y + ra.lo, a1 = A.Y + ra.hi;
        for(const rb of B.prof.rows){
          const v = Math.max((B.Y + rb.lo) - (a1 + vt), (a0 - vt) - (B.Y + rb.hi));
          if(v >= minClear) continue;
          let h = Infinity;
          for(const [p1, p2] of ra.iv) for(const [q1, q2] of rb.iv){
            const lo0 = Math.max(p1 - q2, q1 - p2), hi0 = p2 + q2; // axis separations at which the two annuli touch
            h = Math.min(h, Math.max(lo0 - (D + slack), (D - slack) - hi0));
          }
          const c = Math.max(h, v);
          if(!best || c < best.clear) best = { clear: c, h, v };
        }
      }
      return best;
    }

    // A is the LCA: its fixed geometry turns with B's hang point. Each point of A against B's ring profile.
    function rigidGap(A, B, slack, vt){
      const dX = B.X - A.X, dZ = B.Z - A.Z, bp = B.prof;
      const w = 1 + Math.ceil(A.pad / bp.bin);
      let best = null;
      for(const p of A.pts){
        const rho = Math.hypot(p[0] - dX, p[2] - dZ);
        if(rho - slack - bp.rho - A.pad >= minClear) continue;
        const h0 = A.Y + p[1];
        const i0 = Math.floor((h0 - B.Y - vt - minClear - A.pad) / bp.bin) - w;
        const i1 = Math.floor((h0 - B.Y + vt + minClear + A.pad) / bp.bin) + w;
        for(let i = i0; i <= i1; i++){
          const rb = bp.index.get(i);
          if(!rb) continue;
          const v = Math.max((B.Y + rb.lo) - (h0 + vt), (h0 - vt) - (B.Y + rb.hi)) - A.pad;
          if(v >= minClear) continue;
          let h = Infinity;
          for(const [q1, q2] of rb.iv) h = Math.min(h, Math.max(q1 - (rho + slack), (rho - slack) - q2));
          h -= A.pad;
          const c = Math.max(h, v);
          if(!best || c < best.clear) best = { clear: c, h, v };
        }
      }
      return best;
    }

    for(let i = 0; i < recs.length; i++){
      for(let j = i + 1; j < recs.length; j++){
        const A = recs[i], B = recs[j];
        let d = 0; // depth of the lowest common ancestor
        while(d + 1 < A.path.length && d + 1 < B.path.length && A.path[d + 1] === B.path[d + 1]) d++;
        const tail = (r)=>{
          let spin = 0, sway = 0, vtol = 0;
          r.edges.forEach((e, k)=>{
            if(k >= d){ sway += e.len * SW; vtol += e.yTol; }   // own string sways, shared rod rocks
            if(k >= d + 1) spin += e.m;                          // spinners strictly below the ancestor
          });
          return { spin, sway, vtol };
        };
        const a = tail(A), b = tail(B);
        const D = Math.hypot(A.X - B.X, A.Z - B.Z);
        const measure = (useSlack)=>{
          if(A.path.length === d + 1) return rigidGap(A, B, useSlack ? b.spin + b.sway : 0, useSlack ? b.vtol : 0);
          if(B.path.length === d + 1) return rigidGap(B, A, useSlack ? a.spin + a.sway : 0, useSlack ? a.vtol : 0);
          return ringGap(A, B, D, useSlack ? a.spin + a.sway + b.spin + b.sway : 0, useSlack ? a.vtol + b.vtol : 0);
        };
        const worst = measure(true);                 // slack only ever brings parts closer
        if(!worst || worst.clear >= minClear) continue;
        const nominal = measure(false);
        const certain = nominal && nominal.clear < 0;
        const m = certain ? nominal : worst;
        const hMm = m.h * mmPerUnit, vMm = m.v * mmPerUnit;
        const slack = a.spin + a.sway + b.spin + b.sway;
        const detail = { a: A.id, b: B.id, horizontalGapMm: hMm, verticalGapMm: vMm,
                         sweepRadiusMm: [A.prof.rho * mmPerUnit, B.prof.rho * mmPerUnit], slackMm: slack * mmPerUnit,
                         method: (A.path.length === d + 1 || B.path.length === d + 1) ? 'rigid ancestor vs swept ring' : 'swept rings' };
        if(m.clear < 0){
          // overlap with no slack at all: at some spin phase the parts occupy the same space
          addIssue(certain ? 'ERROR' : 'WARN', certain ? 'swing_collision' : 'swing_collision_risk', A.id,
            `"${A.id}" and "${B.id}" ${certain ? 'will' : 'can'} hit each other while spinning or swaying: at the worst height their swept volumes overlap by ${(-hMm).toFixed(1)} mm horizontally and ${(-vMm).toFixed(1)} mm vertically.`,
            detail
          );
        } else {
          addIssue('WARN', 'swing_clearance_tight', A.id,
            `"${A.id}" and "${B.id}" keep only ${Math.max(hMm, vMm).toFixed(1)} mm of clearance while spinning or swaying (recommended >= ${cfg.minSwingClearanceMm} mm).`,
            detail
          );
        }
      }
    }
  }

  // String lengths: reject unusable values and flag a node whose own `string` overrides a different one.
  (function checkStrings(){
    const check = (node, linkLen, linkWhere)=>{
      const id = node._id, own = ownString(node);
      if(node.string !== undefined && own === undefined){
        addIssue('ERROR', 'string_length', id,
          `"${id}" has string ${JSON.stringify(node.string)}; it must be a number >= 0 (simulator units).`,
          { value: node.string });
      } else if(own !== undefined && linkLen !== undefined && linkLen !== own){
        addIssue('WARN', 'string_conflict', id,
          `"${id}" sets string ${own} but ${linkWhere} gives ${linkLen}; using ${own}.`,
          { string: own, ignored: linkLen });
      }
    };
    check(spec.root, spec.string, 'spec.string');
    (function walk(n){
      for(const c of (n.children || [])){ check(c.node, c.string, 'its parent link'); walk(c.node); }
    })(spec.root);
  })();

  const rootReport = inspectNode(spec.root, 0, rootStringOf(spec), 'ceiling');
  checkSwingClearance();
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
      dynamicLoadFactor: DLF,
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

