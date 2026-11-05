"""Package generated 4x4 transparent sheets at a consistent pixel resolution."""
import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/assets/monsters/catalog-v1'
manifest_path = OUT / 'manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
OUT.mkdir(parents=True, exist_ok=True)
contact = Image.new('RGB', (1024, ((len(manifest['assets']) + 7) // 8) * 128), '#202a32')
draw = ImageDraw.Draw(contact)
sheets = []
for i, entry in enumerate(manifest['assets']):
    source = Image.open(entry['source']).convert('RGBA')
    if source.getchannel('A').getextrema()[0] != 0:
        raise ValueError(f"Sprite background is not transparent: {entry['code']}")
    # Crop by the authored grid, then apply the same scale to every frame.
    sheet = Image.new('RGBA', (256, 256))
    occupied = []
    for row in range(4):
        for col in range(4):
            box = (round(col * source.width / 4), round(row * source.height / 4), round((col + 1) * source.width / 4), round((row + 1) * source.height / 4))
            frame = source.crop(box).resize((64, 64), Image.Resampling.NEAREST)
            # Eliminate partial-alpha fringes while preserving generated transparency.
            frame.putalpha(frame.getchannel('A').point(lambda a: 255 if a >= 128 else 0))
            occupied.append(frame.getbbox() is not None)
            sheet.paste(frame, (col * 64, row * 64))
    if not all(occupied):
        raise ValueError(f"Empty animation frame: {entry['code']}")
    filename = entry['code'].lower() + '_sheet.png'
    sheet.save(OUT / filename, optimize=True)
    sheets.append(sheet)
    entry['img'] = './assets/monsters/catalog-v1/' + filename
    entry['animation'] = {'kind': 'grid', 'cols': 4, 'rows': 4, 'width': 22, 'height': 22}
    entry['sheetWidth'] = entry['sheetHeight'] = 256
    x, y = (i % 8) * 128, (i // 8) * 128
    first = sheet.crop((0, 0, 64, 64)).resize((96, 96), Image.Resampling.NEAREST)
    contact.paste(first, (x + 16, y), first)
    label = entry['code']
    draw.text((x + 2, y + 98), label[:20], fill='#e6e8dc')
    draw.text((x + 2, y + 110), label[20:], fill='#e6e8dc')
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
contact.save(OUT / 'preview.png')
demo_frames = []
sample_indices = list(range(0, len(sheets), 5))
for row, action in enumerate(['idle', 'walk', 'attack', 'hit']):
    for frame in range(4):
        demo = Image.new('RGB', (640, 320), '#202a32')
        labels = ImageDraw.Draw(demo)
        for slot, index in enumerate(sample_indices):
            x, y = (slot % 4) * 160, (slot // 4) * 160
            tile = sheets[index].crop((frame * 64, row * 64, (frame + 1) * 64, (row + 1) * 64)).resize((128, 128), Image.Resampling.NEAREST)
            demo.paste(tile, (x + 16, y), tile)
            labels.text((x + 6, y + 130), manifest['assets'][index]['code'][:23], fill='#e6e8dc')
            labels.text((x + 6, y + 144), action, fill='#b6ddbf')
        demo_frames.append(demo)
demo_frames[0].save(OUT / 'preview-animation.gif', save_all=True, append_images=demo_frames[1:], duration=180, loop=0)
print(json.dumps({'packaged': len(manifest['assets']), 'output': str(OUT)}))
