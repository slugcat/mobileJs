#!/usr/bin/env node
/* Quiet headless regression check (no browser needed, ~0.5 s).
   Rebuilds dist/, runs MobileEngine.verifyMobile on every mobiles/*.js, and compares a rounded
   snapshot (status, issues, per-node masses/tilts/margins, console warnings) to check.baseline.json.
   One line per mobile; at most a few diff lines each; exit 1 on any diff or exception.
   Usage: node check.js                 all mobiles
          node check.js teardropMobile  only that mobile
          node check.js --update        accept current numbers as the new baseline (intentional changes) */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const here = __dirname;
const args = process.argv.slice(2);
const update = args.includes('--update');
const want = new Set(args.filter(a => !a.startsWith('--')));
const BASE = path.join(here, 'check.baseline.json');
const MAX_DIFFS = 6, TOL = 1e-4;

try { cp.execFileSync('python3', [path.join(here, 'build.py')], { stdio: 'pipe' }); }
catch (e) { console.log('BUILD FAILED\n' + String(e.stderr || e.message).split('\n').slice(-6).join('\n')); process.exit(2); }

// dist/mobile-engine.js line -> engine/src part:line, so errors point at the file to edit
const partMap = JSON.parse(fs.readFileSync(path.join(here, 'dist', 'mobile-engine.map.json'), 'utf8')); // written by build.py
function where(text) {
  const m = /mobile-engine\.js:(\d+)/.exec(String(text));
  if (!m) return '';
  const n = +m[1], p = partMap.find(x => n >= x.startLine && n < x.startLine + x.lines);
  return p ? ` [${p.file}:${n - p.startLine + 1}]` : '';
}
let engine;
try { engine = require(path.join(here, 'dist', 'mobile-engine.js')); }
catch (e) {
  console.log(`ENGINE LOAD FAILED: ${e.name}: ${e.message}${where(e.stack)}`);
  process.exit(2);
}
const baseline = fs.existsSync(BASE) ? JSON.parse(fs.readFileSync(BASE, 'utf8')) : {};

const round = v => {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 1e5) / 1e5 : String(v);
  if (Array.isArray(v)) return v.map(round);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = round(v[k]); return o; }
  return v;
};
const flat = (v, p = '', out = {}) => {
  if (v && typeof v === 'object') for (const k of Object.keys(v)) flat(v[k], p ? (Array.isArray(v) ? `${p}[${k}]` : `${p}.${k}`) : k, out);
  else out[p] = v;
  return out;
};
const same = (a, b) => typeof a === 'number' && typeof b === 'number'
  ? Math.abs(a - b) <= TOL * Math.max(1, Math.abs(a)) : a === b;

function snapshot(file) {
  const src = fs.readFileSync(file, 'utf8');
  const w = {};
  const r = new Function('window', src + '\nreturn { M: window.MOBILE, shapeMat, rodMat, threadMat };')(w);
  const logs = [], orig = {};
  for (const k of ['log', 'info', 'warn', 'error', 'table', 'group', 'groupCollapsed', 'groupEnd']) {
    orig[k] = console[k];
    // keep engine warnings that are NOT the verifier's own per-issue log lines (those start with '[' and are already in `issues`)
    console[k] = (...a) => { if ((k === 'warn' || k === 'error') && !String(a[0]).startsWith('[')) logs.push(a.filter(x => typeof x === 'string').join(' ').slice(0, 110)); };
  }
  let rep;
  try { rep = engine.verifyMobile(r.M, r.shapeMat, r.rodMat, r.threadMat); }
  finally { Object.assign(console, orig); }
  return round({
    status: rep.status, errors: rep.errorCount, warns: rep.warnCount,
    totals: rep.physicalTotals,
    issues: rep.issues.map(i => `${i.severity}:${i.category}:${i.nodeId}`).sort(),
    nodes: rep.nodes,
    consoleWarnings: logs.sort()
  });
}

// mobiles/ (built into dist) + fixtures/ (check-only specs that cover extra code paths)
const files = ['mobiles', 'fixtures'].flatMap(d => fs.existsSync(path.join(here, d))
  ? fs.readdirSync(path.join(here, d)).filter(f => f.endsWith('.js')).sort().map(f => path.join(d, f)) : []);
let bad = 0;
for (const rel of files) {
  const name = path.basename(rel, '.js');
  if (want.size && !want.has(name)) continue;
  let snap;
  try { snap = snapshot(path.join(here, rel)); }
  catch (e) { bad++; console.log(`FAIL ${name}  threw: ${e.name}: ${String(e.message).slice(0, 140)}${where(e.stack)}`); continue; }
  const head = `${name.padEnd(28)} status=${snap.status} issues=${snap.issues.length} nodes=${snap.totals.nodeCount} mass=${snap.totals.totalMassGrams.toFixed(2)}g`;
  if (update) { baseline[name] = snap; console.log(`SAVED ${head}`); continue; }
  if (!baseline[name]) { console.log(`NEW  ${head}  (no baseline; run --update)`); continue; }
  const a = flat(baseline[name]), b = flat(snap);
  const diffs = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => !same(a[k], b[k]))
    .map(k => `  ${k}: ${JSON.stringify(a[k])} -> ${JSON.stringify(b[k])}`);
  if (!diffs.length) console.log(`PASS ${head}`);
  else {
    bad++;
    console.log(`DIFF ${head}\n${diffs.slice(0, MAX_DIFFS).join('\n')}${diffs.length > MAX_DIFFS ? `\n  (+${diffs.length - MAX_DIFFS} more)` : ''}`);
  }
}
if (update) fs.writeFileSync(BASE, JSON.stringify(baseline, null, 1) + '\n');
if (bad) { console.log(`check: ${bad} failed`); process.exit(1); }
