/* ============================================================
   MOBILE STUDIO — shared engine
   Include this after mobile-engine.css, then call:
     MobileEngine.start({ title, string, root, hideJoints? }, shapeMat, rodMat, threadMat);
   from your mobile's own small HTML file.
   ------------------------------------------------------------
   SCHEMA
   Any node (rod OR shape) can have children:
     children: [ { offset:<number>, string:<number>, anchorY?:<0..1>, node:<node> }, ... ]

   Every node (rod OR shape) can also set its own
     string:<number >= 0>   // length of the string it hangs from, in simulator units
   A node's own `string` wins over the `string` on its parent's child entry (which still works, so older
   specs are unchanged) and, for the root, over spec.string (default 60). A negative or non-numeric value
   is an ERROR (string_length); giving both and different values is a WARN (string_conflict).

   "rod" node:
     { type:'rod',
       pivot: <number|undefined> }   // local x of hang point; omit to auto-balance

   "shape" node:
     { type:'shape', shape:'disc'|'blob'|'crescent'|'diamond'|'leaf'|'teardrop'|'triangle'|'rect',
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
       finishCoatGPerM2: <number, default 60 for balsa, 20 for other woods>
              // paint/sealer mass per face in g/m^2 (applied to both sides).
              // Balsa is assumed spray-painted opaque enough to hide the grain (sealer/primer + ~2 colour coats);
              // 60 is a rough estimate. Grain still governs strength (grainAngleDeg), painting only hides it.
     }

   2. `rodMat` (Round Dowel Parameters):
     {
       material: <'pine'|'oak'|'basswood'|'spruce'|'birch'|'bamboo'|'carbon_fiber'|'fiberglass'|'aluminum',
                  default 'pine'>,
              // kg/m^3 | E (GPa) | strength (MPa)  (typical handbook values; MOR for wood/composites, yield for aluminum)
              //   pine 500 | 9.0 | 60       oak 750 | 12.5 | 95      basswood 415 | 9.5 | 55
              //   spruce 400 | 10.8 | 70    birch 650 | 13.5 | 105   bamboo 700 | 12 | 100
              //   carbon_fiber 1550 | 125 | 1200   fiberglass 1900 | 40 | 800   aluminum 2700 | 69 | 275
              // carbon_fiber, fiberglass and aluminum cannot be grooved: their default grooveDepthMm is 0,
              // so tie each string with a CA-glued bead or wrap instead (the cut-groove checks are skipped).
              // Override any value with densityKgM3 / E_MPa / morMPa.
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

   4. Dynamic loads, swing clearance & hole spacing (optional; put on `spec` or the `options` argument):
     maxSwingDeg: <number, default 30>
              // worst pendulum swing; dynamic load factor = 3 - 2*cos(angle) (1.27 at 30 deg)
     dynamicLoadFactor: <number, default derived from maxSwingDeg>
              // multiplies every load check (string, tear-out, bearing, rod bending, tie grooves); sag stays static
     clearanceSwingDeg: <number, default 5>
              // string sway assumed when checking whether neighbouring parts can meet
     minSwingClearanceMm: <number, default 5>
              // required gap between parts whose spin sweeps / strings could bring them together
   shapeMat also takes:
     pinholeDiameterMm: <default max(0.6, 2 x thread diameter)>
     minHoleSpacingMm:  <default 2 x minEdgeMarginMm>  // centre-to-centre between hang/child holes on one sheet
   rodMat also takes:
     grooveDepthMm:   <default min(0.25 x diameter, max(0.5, 2 x thread diameter)); 0 for materials that cannot be grooved>  // groove_tied ring groove
     grooveKt:        <default 1.3>   // notch allowance on the reduced section
     minTieSpacingMm: <default groove: max(3, 1.5 x D); drilled: max(5 x hole dia, 2 x D)>

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
       finishCoatGPerM2: 60     // spray-painted opaque (grain hidden); omit to get this balsa default
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

