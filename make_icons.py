"""Generate simple PNG app icons with no external deps (stdlib zlib only)."""
import zlib, struct, math, os

OUT = os.path.dirname(os.path.abspath(__file__))

# Palette
BG = (46, 125, 50)        # green
STEM = (255, 255, 255)
LEAF1 = (165, 214, 167)
LEAF2 = (200, 230, 201)

def blend(dst, src, a):
    return tuple(int(dst[i] * (1 - a) + src[i] * a) for i in range(3))

def make(size):
    # start with green rounded square on transparent bg
    px = [[(0, 0, 0, 0) for _ in range(size)] for _ in range(size)]
    r = size * 0.20  # corner radius
    cx1, cy1 = r, r
    cx2, cy2 = size - r, size - r
    for y in range(size):
        for x in range(size):
            inside = True
            a = 1.0
            # rounded corners
            if x < r and y < r:
                d = math.hypot(x - cx1, y - cy1); inside = d <= r; a = max(0, min(1, r - d + 0.5))
            elif x > size - r and y < r:
                d = math.hypot(x - cx2, y - cy1); inside = d <= r; a = max(0, min(1, r - d + 0.5))
            elif x < r and y > size - r:
                d = math.hypot(x - cx1, y - cy2); inside = d <= r; a = max(0, min(1, r - d + 0.5))
            elif x > size - r and y > size - r:
                d = math.hypot(x - cx2, y - cy2); inside = d <= r; a = max(0, min(1, r - d + 0.5))
            if inside:
                px[y][x] = (BG[0], BG[1], BG[2], int(255 * a))

    def draw_ellipse(cx, cy, rx, ry, ang, color):
        ca, sa = math.cos(ang), math.sin(ang)
        for y in range(size):
            for x in range(size):
                dx, dy = x - cx, y - cy
                u = dx * ca + dy * sa
                v = -dx * sa + dy * ca
                if (u / rx) ** 2 + (v / ry) ** 2 <= 1:
                    base = px[y][x]
                    if base[3] == 0:
                        continue
                    px[y][x] = (color[0], color[1], color[2], base[3])

    s = size
    # two leaves
    draw_ellipse(0.40 * s, 0.44 * s, 0.17 * s, 0.09 * s, math.radians(-35), LEAF1)
    draw_ellipse(0.60 * s, 0.42 * s, 0.17 * s, 0.09 * s, math.radians(35), LEAF2)
    # stem
    for y in range(int(0.42 * s), int(0.78 * s)):
        for x in range(int(0.485 * s), int(0.515 * s)):
            base = px[y][x]
            if base[3] != 0:
                px[y][x] = (STEM[0], STEM[1], STEM[2], base[3])
    return px

def write_png(path, px):
    size = len(px)
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            raw.extend(px[y][x])
    compressed = zlib.compress(bytes(raw), 9)

    def chunk(typ, data):
        c = struct.pack(">I", len(data)) + typ + data
        c += struct.pack(">I", zlib.crc32(typ + data) & 0xffffffff)
        return c

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", compressed)
    png += chunk(b"IEND", b"")
    with open(path, "wb") as fp:
        fp.write(png)

for sz, name in [(180, "icon-180.png"), (192, "icon-192.png"), (512, "icon-512.png")]:
    write_png(os.path.join(OUT, name), make(sz))
    print("wrote", name)
