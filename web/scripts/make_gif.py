"""Builds docs/screenshots/demo.gif from the frames written by screenshots.mjs (needs Pillow)."""

from pathlib import Path

from PIL import Image

out = Path(__file__).resolve().parents[2] / "docs" / "screenshots"
frames = sorted((out / "frames").glob("f*.png"))
if not frames:
    raise SystemExit("no frames: run `npm run screenshots` first")
width = 1000
images = []
for f in frames:
    im = Image.open(f).convert("RGB")
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    images.append(im.quantize(colors=128, method=Image.MEDIANCUT, dither=Image.NONE))
durations = [1800 for _ in images]
durations[2] = 2400  # linger on Monitor -> Enforce
images[0].save(out / "demo.gif", save_all=True, append_images=images[1:], duration=durations, loop=0, optimize=True, disposal=2)
print(f"wrote {out / 'demo.gif'} ({(out / 'demo.gif').stat().st_size // 1024} KiB, {len(images)} frames)")
