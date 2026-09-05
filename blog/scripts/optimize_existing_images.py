"""Create lossless WebP alternatives for article PNGs. Requires Pillow."""
from pathlib import Path
from PIL import Image
import io
import re

base = Path(__file__).resolve().parents[1] / "articles"
saved = count = 0
for article in base.glob("*/index.html"):
    source = article.read_text(encoding="utf-8")
    for path in article.parent.iterdir():
        if path.suffix.lower() != ".png" or path.name not in source:
            continue
        with Image.open(path) as original:
            if getattr(original, "n_frames", 1) > 1:
                continue
            output = io.BytesIO()
            original.save(output, format="WEBP", lossless=True, method=6, exact=True)
            data = output.getvalue()
            if len(data) >= path.stat().st_size * 0.9:
                continue
            with Image.open(io.BytesIO(data)) as result:
                assert original.convert("RGBA").tobytes() == result.convert("RGBA").tobytes()
            target = path.with_name(path.stem + "-optimized.webp")
            target.write_bytes(data)
            source = source.replace(path.name, target.name)
            saved += path.stat().st_size - len(data)
            count += 1

    def dimensions(match):
        tag = match.group(0)
        src = re.search(r'src="([^"]+)"', tag)
        if not src:
            return tag
        path = article.parent / src.group(1).split("/")[-1]
        if not path.is_file():
            return tag
        try:
            with Image.open(path) as image:
                width, height = image.size
        except OSError:
            return tag
        tag = re.sub(r'\s(?:width|height)="[^"]*"', "", tag)
        return tag[:-1] + f' width="{width}" height="{height}">'

    updated = re.sub(r"<img\b[^>]*>", dimensions, source)
    if updated != article.read_text(encoding="utf-8"):
        article.write_text(updated, encoding="utf-8")
print({"lossless_webp_images": count, "bytes_saved": saved})
