"""Builds the icons' font from the icons' SVG paths (see build-icon-font.mjs, which runs it).

Reads a JSON list of `{"unicode": int, "name": str, "path": str, "center": bool}` from stdin and
writes an OpenType font with one glyph per icon, as big as its 960-unit box. Run with
`uv run --no-project --with fonttools python -I build-icon-font.py OUT`.
"""

import json
import sys

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path

EM = 960
# The line of a text in this font is exactly the icon's box, so a box of the font's size holds it.
ASCENT = 720
DESCENT = 240
FAMILY = "AllRun Icons"


def charstring(path: str, center: bool) -> object:
    """A glyph from an SVG path in the icon's box, whose y grows downward.

    Args:
        path: The icon's SVG path.
        center: Whether to move it to the middle of its box by its shape.

    Returns:
        The glyph's Type 2 charstring.
    """
    dx = dy = 0.0
    if center:
        bounds = BoundsPen(None)
        parse_path(path, bounds)
        left, top, right, bottom = bounds.bounds
        dx = EM / 2 - (left + right) / 2
        dy = EM / 2 - (top + bottom) / 2
    pen = T2CharStringPen(EM, {})
    parse_path(path, TransformPen(pen, (1, 0, 0, -1, dx, ASCENT - dy)))
    return pen.getCharString()


def main(out: str) -> None:
    """Writes the font.

    Args:
        out: Where to write it.
    """
    icons = json.load(sys.stdin)
    names = [".notdef", *(icon["name"] for icon in icons)]
    empty = T2CharStringPen(EM, {})
    charstrings = {".notdef": empty.getCharString()}
    for icon in icons:
        charstrings[icon["name"]] = charstring(icon["path"], icon["center"])

    font = FontBuilder(EM, isTTF=False)
    font.setupGlyphOrder(names)
    font.setupCharacterMap({icon["unicode"]: icon["name"] for icon in icons})
    font.setupCFF(FAMILY, {"FullName": FAMILY}, charstrings, {})
    font.setupHorizontalMetrics({name: (EM, 0) for name in names})
    font.setupHorizontalHeader(ascent=ASCENT, descent=-DESCENT, lineGap=0)
    font.setupNameTable({"familyName": FAMILY, "styleName": "Regular"})
    font.setupOS2(
        version=4,
        sTypoAscender=ASCENT,
        sTypoDescender=-DESCENT,
        sTypoLineGap=0,
        usWinAscent=ASCENT,
        usWinDescent=DESCENT,
        # USE_TYPO_METRICS: every system takes the same line.
        fsSelection=0x40 | 0x80,
    )
    font.setupPost()
    font.save(out)


if __name__ == "__main__":
    main(sys.argv[1])
