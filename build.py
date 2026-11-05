#!/usr/bin/env python3
"""Build standalone pages: dist/<name>.html = engine css + engine js + mobiles/<name>.js.
Usage: python3 build.py            (all mobiles)
       python3 build.py mobile_02  (one)"""
import glob, os, re, sys
here = os.path.dirname(os.path.abspath(__file__))
rd = lambda *p: open(os.path.join(here, *p)).read()
css, js = rd('engine', 'mobile-engine.css'), rd('engine', 'mobile-engine.js')
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
MobileEngine.start(window.MOBILE);
</script>
</body>
</html>
"""
want = set(sys.argv[1:])
os.makedirs(os.path.join(here, 'dist'), exist_ok=True)
for f in sorted(glob.glob(os.path.join(here, 'mobiles', '*.js'))):
    name = os.path.basename(f)[:-3]
    if want and name not in want: continue
    spec = open(f).read()
    t = re.search(r'title:\s*"([^"]+)"', spec)
    out = TEMPLATE.format(title='Mobile — ' + (t.group(1) if t else name), css=css, js=js, spec=spec)
    open(os.path.join(here, 'dist', name + '.html'), 'w').write(out)
    print('built dist/%s.html' % name)
