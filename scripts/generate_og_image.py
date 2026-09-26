#!/usr/bin/env python3
"""
GHOSTNAME WORLDWIDE — social preview generator (assets/og-image.png, 1200x630).

Dependency-free: rasterizes a blocky stroke font with supersampled
anti-aliasing and writes a PNG using only the Python standard library.

Run:  python3 scripts/generate_og_image.py
"""
import struct
import zlib
from array import array

W, H = 1200, 630
SS = 3  # supersampling factor

# ---------------------------------------------------------------- stroke font
# Each glyph is a list of segments (x0, y0, x1, y1) on a 10x14 cell grid.
G = {
    "G": [(8, 3, 3, 3), (3, 3, 2, 5), (2, 5, 2, 9), (2, 9, 3, 11), (3, 11, 8, 11), (8, 11, 8, 7), (8, 7, 5, 7)],
    "H": [(2, 2, 2, 12), (8, 2, 8, 12), (2, 7, 8, 7)],
    "O": [(2, 3, 3, 2), (3, 2, 7, 2), (7, 2, 8, 3), (8, 3, 8, 11), (8, 11, 7, 12), (7, 12, 3, 12), (3, 12, 2, 11), (2, 11, 2, 3)],
    "S": [(8, 3, 7, 2), (7, 2, 3, 2), (3, 2, 2, 3), (2, 3, 2, 6), (2, 6, 3, 7), (3, 7, 7, 7), (7, 7, 8, 8), (8, 8, 8, 11), (8, 11, 7, 12), (7, 12, 3, 12), (3, 12, 2, 11)],
    "T": [(2, 2, 8, 2), (5, 2, 5, 12)],
    "N": [(2, 12, 2, 2), (2, 2, 8, 12), (8, 12, 8, 2)],
    "A": [(2, 12, 5, 2), (5, 2, 8, 12), (3, 8, 7, 8)],
    "M": [(2, 12, 2, 2), (2, 2, 5, 8), (5, 8, 8, 2), (8, 2, 8, 12)],
    "E": [(2, 2, 2, 12), (2, 2, 8, 2), (2, 7, 7, 7), (2, 12, 8, 12)],
    "W": [(2, 2, 3, 12), (3, 12, 5, 6), (5, 6, 7, 12), (7, 12, 8, 2)],
    "R": [(2, 12, 2, 2), (2, 2, 7, 2), (7, 2, 8, 3), (8, 3, 8, 6), (8, 6, 7, 7), (7, 7, 2, 7), (5, 7, 8, 12)],
    "L": [(2, 2, 2, 12), (2, 12, 8, 12)],
    "D": [(2, 2, 2, 12), (2, 2, 6, 2), (6, 2, 8, 4), (8, 4, 8, 10), (8, 10, 6, 12), (6, 12, 2, 12)],
    "I": [(5, 2, 5, 12), (3, 2, 7, 2), (3, 12, 7, 12)],
    "V": [(2, 2, 5, 12), (5, 12, 8, 2)],
    ".": [(4.2, 11.2, 4.8, 11.2)],
    "—": [(1.5, 7, 8.5, 7)],
    "2": [(2, 3, 3, 2), (3, 2, 7, 2), (7, 2, 8, 3), (8, 3, 2, 11), (2, 11, 2, 12), (2, 12, 8, 12)],
    "6": [(8, 3, 7, 2), (7, 2, 3, 2), (3, 2, 2, 3), (2, 3, 2, 11), (2, 11, 3, 12), (3, 12, 7, 12), (7, 12, 8, 11), (8, 11, 8, 8), (8, 8, 7, 7), (7, 7, 2, 7)],
    "0": [(2, 3, 3, 2), (3, 2, 7, 2), (7, 2, 8, 3), (8, 3, 8, 11), (8, 11, 7, 12), (7, 12, 3, 12), (3, 12, 2, 11), (2, 11, 2, 3)],
    "F": [(2, 12, 2, 2), (2, 2, 8, 2), (2, 7, 7, 7)],
}

BG = (9, 9, 11)
WHITE = (244, 244, 245)
GRAY = (148, 148, 158)
DIM = (52, 52, 58)

img = [list(BG) for _ in range(W * H)]  # row-major pixel list
cov = array("f", bytes(4 * W * SS * H * SS))  # supersampled coverage buffer


def paint_disc(cx, cy, r):
    """Stamp an opaque disc into the coverage buffer (supersampled space)."""
    x0 = max(0, int(cx - r))
    x1 = min(W * SS - 1, int(cx + r))
    y0 = max(0, int(cy - r))
    y1 = min(H * SS - 1, int(cy + r))
    r2 = r * r
    for py in range(y0, y1 + 1):
        dy2 = (py - cy) ** 2
        row = py * W * SS
        for px in range(x0, x1 + 1):
            if (px - cx) ** 2 + dy2 <= r2:
                cov[row + px] = 1.0


def draw_text(text, x, y, cell, thick, color):
    """Stroke a string; y is the glyph top; advance = 12 cells per char."""
    cur = x * SS
    t = thick * cell * SS / 2.0
    for ch in text:
        if ch == " ":
            cur += 7 * cell * SS
            continue
        glyph = G.get(ch)
        if glyph is None:
            cur += 12 * cell * SS
            continue
        for (gx0, gy0, gx1, gy1) in glyph:
            length = max(abs(gx1 - gx0), abs(gy1 - gy0)) * cell * SS
            steps = int(length * 2) + 2
            for i in range(steps + 1):
                f = i / steps
                paint_disc(cur + (gx0 + (gx1 - gx0) * f) * cell * SS,
                           (y + (gy0 + (gy1 - gy0) * f) * cell) * SS, t)
        cur += 12 * cell * SS


def blend_pass(color):
    """Composite the coverage buffer onto the image, then reset it."""
    for py in range(H):
        base = py * W
        for px in range(W):
            acc = 0.0
            for sy in range(SS):
                row = (py * SS + sy) * W * SS + px * SS
                for sx in range(SS):
                    acc += cov[row + sx]
            a = acc / (SS * SS)
            if a > 0.004:
                i = base + px
                p = img[i]
                img[i] = [
                    p[0] * (1 - a) + color[0] * a,
                    p[1] * (1 - a) + color[1] * a,
                    p[2] * (1 - a) + color[2] * a,
                ]
    for i in range(len(cov)):
        cov[i] = 0.0


def fill_rect(x, y, w, h, color):
    for py in range(max(0, y), min(H, y + h)):
        base = py * W
        for px in range(max(0, x), min(W, x + w)):
            img[base + px] = list(color)


def write_png(path, w, h, pixels):
    raw = bytearray()
    for py in range(h):
        raw.append(0)  # filter type 0 per scanline
        base = py * w
        for px in range(w):
            p = pixels[base + px]
            raw.append(int(p[0] + 0.5))
            raw.append(int(p[1] + 0.5))
            raw.append(int(p[2] + 0.5))

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as fh:
        fh.write(png)


# ---------------------------------------------------------------- composition
# thin frame + brand tick
fill_rect(36, 36, W - 72, 2, DIM)
fill_rect(36, H - 38, W - 72, 2, DIM)
fill_rect(36, 36, 2, H - 72, DIM)
fill_rect(W - 38, 36, 2, H - 72, DIM)
fill_rect(92, 96, 34, 8, WHITE)

# headline, blended layer by layer
draw_text("GHOSTNAME", 72, 138, 10.0, 2.6, WHITE)
blend_pass(WHITE)
draw_text("WORLDWIDE", 72, 298, 10.0, 2.6, WHITE)
blend_pass(WHITE)
draw_text("FACELESS. FEARLESS. FOREVER.", 96, 508, 3.0, 2.0, GRAY)
blend_pass(GRAY)
draw_text("FW26 INAUGURAL DROP — EST. 2026", 96, 566, 2.7, 1.8, DIM)
blend_pass(DIM)

write_png("assets/og-image.png", W, H, img)
print("wrote assets/og-image.png (1200x630)")
