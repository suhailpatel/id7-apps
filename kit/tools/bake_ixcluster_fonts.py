#!/usr/bin/env python3
"""Re-bake the iX Cluster glyph atlases that need characters Cluster Themes' fonts lack.

    uv run --no-project --with pillow python kit/tools/bake_ixcluster_fonts.py [--src DIR]

The gear fonts gain B (the iX3's B position), the dial labels a minus sign (battery temperature -10 C) and
Ribbon's readouts a slash (km/h). Same
fonts, sizes and options as bimmer-lab's tools/bake_fonts.py (MIT), whose bake() is copied below unchanged, so cell
heights and the layouts built on them stay the same. --src: the folder with the TTFs (bimmer-lab's tools/fonts-src;
Barlow and Michroma, Outfit and Barlow Condensed under the SIL OFL 1.1, see apps/ixcluster/NOTICE). Runs on the Mac
only (needs Pillow); writes apps/ixcluster/hud/fonts/<name>.json.
"""
import argparse, base64, json, os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'apps', 'ixcluster', 'hud', 'fonts')
SRC = os.path.join(HERE, '..', '..', '..', 'bimmer-lab-apps', 'tools', 'fonts-src')
DIGITS = '0123456789'
UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
LOWER = 'abcdefghijklmnopqrstuvwxyz'
PAD = 2
ATLAS_W = 1024
FONTS = [
    ('s_gear', 'Michroma-Regular.ttf', 70, DIGITS + 'PRNDSMB-', 3),
    ('s_gl', 'Michroma-Regular.ttf', 21, DIGITS + '/-', 1),
    ('n_gear', 'BarlowSemiCondensed-SemiBold.ttf', 110, DIGITS + 'PRNDSMB-'),
    ('b_gear', 'Outfit[wght].ttf', 32, DIGITS + 'PRNDSMB-', 0, 'SemiBold'),
    # Ribbon's readouts: '/' for km/h (tucked, so the cell height and the layout stay as they were)
    ('b_val', 'Outfit[wght].ttf', 44, DIGITS + '.:-+\u00b0% ' + LOWER + UPPER + '/', 0, 'Light', None, '/'),
    ('value', 'BarlowCondensed-Bold.ttf', 92, DIGITS + '.:- PRNDB\u00b0', 0, None, None, '\u00b0'),
]


def bake(out, name, file, size, chars, stroke=0, weight=None, subs=None, tuck=''):
    """stroke: px of extra weight round every glyph (Michroma has one weight). weight: a named instance of a
    variable font (Orbitron: Regular .. Black), for the M theme's squared BMW-style gear, speed and numbers.
    subs: {char: glyph drawn for it} (Orbitron's zero is slashed; the M8's is plain, so its O stands in).
    tuck: characters added to a font after layouts were built on its cell height (° on value / y_val, Nov 7 2026):
    they don't count towards the cell, and one that rises above it is drawn lower so its top meets the cell's."""
    font = ImageFont.truetype(os.path.join(SRC, file), size)
    if weight: font.set_variation_by_name(weight)
    subs = subs or {}
    glyph = lambda c: subs.get(c, c)
    ink = [c for c in chars if c != ' ']
    boxes = {c: font.getbbox(glyph(c), anchor='ls', stroke_width=stroke) for c in ink}
    top = min(b[1] for c, b in boxes.items() if c not in tuck)
    bottom = max(b[3] for c, b in boxes.items() if c not in tuck)
    drop = {c: max(0, top - boxes[c][1]) for c in tuck if c in boxes}
    height = bottom - top + 2 * PAD
    tab = (max(font.getlength(glyph(d)) for d in DIGITS if d in chars) + 2 * stroke) if any(d in chars for d in DIGITS) else 0

    cells = []
    for c in chars:
        adv = font.getlength(glyph(c)) + (2 * stroke if c != ' ' else 0)
        if c == ' ':
            cells.append((c, None, 0, round(adv if adv else size * 0.25)))
            continue
        l, _, r, _ = boxes[c]
        w = r - l + 2 * PAD
        img = Image.new('L', (w, height), 0)
        ImageDraw.Draw(img).text((PAD - l, PAD - top + drop.get(c, 0)), glyph(c), font=font, fill=255, anchor='ls', stroke_width=stroke, stroke_fill=255)
        shift = (tab - adv) / 2 if c in DIGITS else 0
        cells.append((c, img, round(l - PAD + shift), round(tab if c in DIGITS else adv)))

    # simple row packing
    x = y = 0
    placed = {}
    for c, img, ox, adv in cells:
        if img is None:
            continue
        if x + img.width > ATLAS_W:
            x, y = 0, y + height
        placed[c] = (x, y)
        x += img.width
    atlas_h = y + height
    atlas = Image.new('L', (ATLAS_W, atlas_h), 0)
    glyphs = {}
    for c, img, ox, adv in cells:
        if img is None:
            glyphs[c] = {'x': 0, 'y': 0, 'w': 0, 'h': 0, 'ox': 0, 'advance': adv}
            continue
        gx, gy = placed[c]
        atlas.paste(img, (gx, gy))
        glyphs[c] = {'x': gx, 'y': gy, 'w': img.width, 'h': img.height, 'ox': ox, 'advance': adv}
    meta = {'source': file, 'size': size, 'cellHeight': height, 'baseline': PAD - top, 'glyphs': glyphs,
            'width': ATLAS_W, 'height': atlas_h, 'alpha': base64.b64encode(atlas.tobytes()).decode('ascii')}
    with open(os.path.join(out, name + '.json'), 'w') as f:
        json.dump(meta, f, separators=(',', ':'), ensure_ascii=False)
    print('%-6s %3dpx  cell height %3d  atlas %dx%d  %d glyphs' % (name, size, height, ATLAS_W, atlas_h, len(glyphs)))



if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--src', default=SRC)
    SRC = ap.parse_args().src
    for spec in FONTS:
        bake(OUT, *spec)
