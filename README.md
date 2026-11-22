# Mobile simulator

Workflow (keeps sessions cheap):
1. Read this file first; open only the engine part(s) the change touches. Never read `dist/`.
2. `python3 build.py` -> `dist/<mobile>.html` (open in a browser). Also writes `dist/mobile-engine.js`.
3. `node check.js` -> one line per spec, in ~0.5 s, no browser. Exit 1 on any change vs `check.baseline.json`.
   After an intentional numbers change: `node check.js --update` (then review the diff of the baseline file).
4. New shape / node type / spec field: add one instance to `fixtures/zooFixture.js`, then `--update`.

`check.js` covers: material params, masses, geometry/area, hang equilibrium, every verifier issue.
It does NOT cover rendering or animation (`project`, `shapeFrame`, lighting, `stepPhysics`, DOM/UI): look at those in a browser.
Engine load/syntax errors print as `[part-file:line]`.

## Engine map (`engine/src/*.js`, concatenated in the order of `PARTS` in build.py, inside one IIFE)
Sizes are rough token counts for reading the whole part.

| part | ~tok | contents |
|---|---|---|
| schema.js | 2.8k | doc comment: spec schema, material params (outside the IIFE) |
| constants-presets.js | 1.4k | constants, `MATERIAL_PRESETS` |
| geometry.js | 1.4k | `shapeDef` (all shape outlines), area, `weightFromShape` |
| node-mass.js | 1.2k | node helpers (`attachOf`, `assignIds`, string lengths), `shapeMass`, `rodMass`, `resolveWeights` |
| color-physics.js | 1.1k | colors; sway/lean constants, `computeBalance`, `initPhysics`, `stepPhysics` |
| projection-panel.js | 1.5k | SVG helpers, `project`, `shapeFrame` (3D panel pose), lighting |
| hang-equilibrium.js | 1.3k | `hangModel`, `solveHang`, `resolveTilts` (targetSlope) |
| material-params.js | 2.1k | `normalizeMaterialParams` (defaults + unknown-param warnings), edge-margin helpers |
| verify.js | 12.4k | `verifyMobile` (one big function: all strength/clearance checks, console report) |
| buildsheet-draw.js | 1.7k | `buildSheet`, `drawShapeSelf/RodSelf/Node` |
| dom-ui.js | 1.4k | slider styles, `buildDOM` |
| start-export.js | 1.8k | `start` (page entry, animation loop), `api` export |

Part files are slices of one scope, not standalone modules: parts share top-level names.
Adding/renaming/removing a part: edit `PARTS` in build.py (first = schema header, last = start-export.js which
exports the api; middle order doesn't matter). build.py fails loudly if `PARTS` and `engine/src/` disagree.

Next split candidate: `verifyMobile` (verify.js) is one closure sharing `cfg`, `issues`, `addIssue`; breaking it up means refactoring, not slicing.
