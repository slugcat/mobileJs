#!/usr/bin/env python3
"""Build standalone pages: dist/<name>.html = engine css + engine js + mobiles/<name>.js.
The engine is the engine/src parts listed in PARTS below: the first is the doc header (outside the
IIFE), the rest are slices of one shared IIFE body, wrapped here. Also writes dist/mobile-engine.js and
dist/mobile-engine.map.json (dist line -> part, used by check.js for error locations).
Usage: python3 build.py            (all mobiles)
       python3 build.py mobile_02  (one)"""
import glob, json, os, re, sys
here = os.path.dirname(os.path.abspath(__file__))
rd = lambda *p: open(os.path.join(here, *p)).read()

# Engine parts in concatenation order. First = doc header; last must export the api (start-export.js).
# Order of the others is irrelevant at load time (they only define functions/constants), so group by topic.
PARTS = ['schema.js', 'constants-presets.js', 'geometry.js', 'node-mass.js', 'color-physics.js',
         'projection-panel.js', 'hang-equilibrium.js', 'material-params.js', 'verify.js',
         'buildsheet-draw.js', 'dom-ui.js', 'start-export.js']
src_dir = os.path.join(here, 'engine', 'src')
on_disk = {os.path.basename(p) for p in glob.glob(os.path.join(src_dir, '*.js'))}
missing, unlisted = [p for p in PARTS if p not in on_disk], sorted(on_disk - set(PARTS))
if missing or unlisted or len(set(PARTS)) != len(PARTS):
    sys.exit('build.py: engine/src and PARTS disagree.\n  listed but missing: %s\n  on disk but not listed: %s\n  (duplicates in PARTS: %s)'
             % (missing, unlisted, len(set(PARTS)) != len(PARTS)))
chunks = [open(os.path.join(src_dir, PARTS[0])).read(), '(function(){\n'] + [open(os.path.join(src_dir, p)).read() for p in PARTS[1:]] + ['})();\n']
js, line, pmap = ''.join(chunks), 1, []
for name, text in zip([PARTS[0], '(iife open)'] + PARTS[1:] + ['(iife close)'], chunks):
    pmap.append({'file': name, 'startLine': line, 'lines': text.count('\n')}); line += text.count('\n')
css = rd('engine', 'mobile-engine.css')
TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>{title}</title>
<style>
{css}
</style>
</head>
<body>
<script>
{js}
</script>
<script>
{spec}
MobileEngine.start(window.MOBILE, shapeMat, rodMat, threadMat);
</script>
</body>
</html>
"""
want = set(sys.argv[1:])
os.makedirs(os.path.join(here, 'dist'), exist_ok=True)
open(os.path.join(here, 'dist', 'mobile-engine.js'), 'w').write(js)
json.dump(pmap, open(os.path.join(here, 'dist', 'mobile-engine.map.json'), 'w'))
for f in sorted(glob.glob(os.path.join(here, 'mobiles', '*.js'))):
    name = os.path.basename(f)[:-3]
    if want and name not in want: continue
    spec = open(f).read()
    t = re.search(r'title:\s*"([^"]+)"', spec)
    out = TEMPLATE.format(title='Mobile — ' + (t.group(1) if t else name), css=css, js=js, spec=spec)
    open(os.path.join(here, 'dist', name + '.html'), 'w').write(out)
    print('built dist/%s.html' % name)
