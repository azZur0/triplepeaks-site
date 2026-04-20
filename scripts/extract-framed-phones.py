"""Extract the iPhone (frame + screen) from the App Store marketing screenshots
and save it with a transparent background — no dark backdrop, no headline.

Geometry matches `screenshot-framer.html`:
    CANVAS_W = 1320, CANVAS_H = 2868
    deviceW = 1020, deviceH = 2176
    deviceX = (CANVAS_W - deviceW) / 2 = 150
    deviceY = CANVAS_H - deviceH - 80 = 612
    outerR  = 130 (rounded-rect corner radius, also used as the export mask)

The framer also renders tiny side buttons protruding 4px. We widen the crop
a bit so those aren't clipped, and shadow falls off naturally via PNG alpha.
"""

"""Run with: .tools/bin/python scripts/extract-framed-phones.py

Requires a sibling checkout of the main triplepeaks repo alongside this one,
with the App Store screenshots under docs/appstore/screenshots.
Override the source with the TRIPLEPEAKS_REPO environment variable if needed.
"""

import os
from pathlib import Path

from PIL import Image, ImageDraw

# Match screenshot-framer.html
CANVAS_W = 1320
CANVAS_H = 2868
DEVICE_W = 1020
DEVICE_H = 2176
DEVICE_X = (CANVAS_W - DEVICE_W) // 2  # 150
DEVICE_Y = CANVAS_H - DEVICE_H - 80    # 612
OUTER_R = 130

# Small pad around the device to include side buttons + a breathing shadow margin
PAD = 24

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_REPO = ROOT.parent / "triplepeaks"
REPO = Path(os.environ.get("TRIPLEPEAKS_REPO", DEFAULT_REPO))
SRC_DIR = REPO / "docs" / "appstore" / "screenshots"
OUT_DIR = ROOT / "img" / "app" / "framed"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def squircle_mask(w: int, h: int, radius: int, pad: int) -> Image.Image:
    """Alpha mask matching the phone body shape within the padded crop."""
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle(
        (pad, pad, w - pad, h - pad),
        radius=radius,
        fill=255,
    )
    return mask


def extract(src: Path, dst: Path) -> None:
    img = Image.open(src).convert("RGBA")
    if img.size != (CANVAS_W, CANVAS_H):
        print(f"skip {src.name} — unexpected size {img.size}")
        return

    left = DEVICE_X - PAD
    top = DEVICE_Y - PAD
    right = DEVICE_X + DEVICE_W + PAD
    bottom = DEVICE_Y + DEVICE_H + PAD

    crop = img.crop((left, top, right, bottom))
    mask = squircle_mask(crop.size[0], crop.size[1], OUTER_R, PAD)

    out = Image.new("RGBA", crop.size, (0, 0, 0, 0))
    out.paste(crop, (0, 0), mask)
    out.save(dst, optimize=True)
    print(f"{src.name} -> {dst.relative_to(ROOT)} ({out.size})")


def main() -> None:
    for i in range(1, 8):  # screenshot-01 through screenshot-07
        src = SRC_DIR / f"screenshot-{i:02d}-en.png"
        if not src.exists():
            print(f"missing: {src}")
            continue
        dst = OUT_DIR / f"phone-{i:02d}.png"
        extract(src, dst)


if __name__ == "__main__":
    main()
