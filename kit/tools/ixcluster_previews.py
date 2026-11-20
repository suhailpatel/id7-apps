#!/usr/bin/env python3
"""iX Cluster's theme pictures for its centre-screen page (apps/ixcluster/previews.js reads them).

    BENCH_SHOT=1 BENCH_PORT=8092 node kit/bench/server.js ixcluster      # one terminal (the frame held still)
    uv run -q --no-project --with pillow python -I kit/tools/ixcluster_previews.py 8092 [theme ...]

Each theme is picked on the bench, shot by headless Chrome at 1920x720 (the car view off) and stored as
apps/ixcluster/hud/previews/<theme>.json = { big, small: {w, h, z} }, z = base64 of the zlib-deflated RGBA rows,
the format of bimmer-lab's tools/previews.py (MIT), which this follows. The demo setting must be On.
"""
import base64, json, os, subprocess, sys, time, urllib.request, zlib
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'apps', 'ixcluster', 'hud', 'previews')
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
THEMES = ['mview', 'sport', 'minimal', 'cruise', 'ribbon', 'gt3', 'm', 'vector', 'track', 'drag', 'rally', 'retro80s', 'dyno']
BIG, SMALL = (888, 333), (280, 105)


def post(port, key, value):
    req = urllib.request.Request('http://127.0.0.1:%d/setting' % port, data=json.dumps({'key': key, 'value': value}).encode(),
                                 headers={'Content-Type': 'application/json'}, method='POST')
    urllib.request.urlopen(req, timeout=5).read()


def shot(port, out):
    for attempt in range(3):
        if os.path.exists(out):
            os.remove(out)
        try:
            subprocess.run([CHROME, '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--virtual-time-budget=15000',
                            '--hide-scrollbars', '--window-size=1920,720', '--screenshot=' + out,
                            'http://localhost:%d/?only=1&backdrop=0&clean=1&car=0' % port],
                           check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60)
            if os.path.exists(out) and sum(Image.open(out).convert('L').point(lambda v: 255 if v > 40 else 0).histogram()[255:]) >= 400:
                return
        except subprocess.TimeoutExpired:
            subprocess.run(['pkill', '-f', '--screenshot=' + out], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print('  retry %d' % (attempt + 1), flush=True)
    raise SystemExit('no picture: ' + out)


def pack(img, size):
    im = img.resize(size, Image.LANCZOS).convert('RGBA')
    return {'w': size[0], 'h': size[1], 'z': base64.b64encode(zlib.compress(im.tobytes(), 9)).decode()}


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8092
    only = sys.argv[2:]          # theme names: just those pictures
    tmp = os.path.join(OUT, '..', '..', '..', '..', 'dist', 'ixcluster-previews')
    os.makedirs(tmp, exist_ok=True)
    post(port, 'demo', 'on')
    post(port, 'byMode', False)       # else the held drive mode (Comfort) picks the theme
    for name in [t for t in THEMES if not only or t in only]:
        post(port, 'hudLayout', name)
        time.sleep(5)
        png = os.path.join(tmp, name + '.png')
        shot(port, png)
        img = Image.open(png).convert('RGB').crop((0, 0, 1920, 720))
        with open(os.path.join(OUT, name + '.json'), 'w') as f:
            json.dump({'big': pack(img, BIG), 'small': pack(img, SMALL)}, f, separators=(',', ':'))
        print(name, 'ok', flush=True)
    post(port, 'hudLayout', 'mview')
    post(port, 'byMode', True)


if __name__ == '__main__':
    main()
