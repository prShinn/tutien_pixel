"""Crop authored elemental icon atlases into the images referenced by the skill bank."""
import json
import unicodedata
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/assets/skills/bank-v1'
plan = json.loads((ROOT / 'data/skill-bank-v1.json').read_text(encoding='utf-8'))
manifest = json.loads((OUT / 'manifest.json').read_text(encoding='utf-8'))
skills = {entry['code']: entry for entry in plan['skills']}
preview = Image.new('RGB', (1152, ((len(skills) + 11) // 12) * 96), '#202a32')
labels = ImageDraw.Draw(preview)
count = 0
seen = set()
for atlas in manifest['atlases']:
    source = Image.open(atlas['source']).convert('RGBA')
    for index, code in enumerate(atlas['codes']):
        if code in seen:
            raise ValueError('Duplicate artwork code: ' + code)
        seen.add(code)
        col, row = index % atlas['cols'], index // atlas['cols']
        box = (round(col * source.width / atlas['cols']), round(row * source.height / atlas['rows']), round((col + 1) * source.width / atlas['cols']), round((row + 1) * source.height / atlas['rows']))
        tile = source.crop(box).resize((64, 64), Image.Resampling.NEAREST)
        if not tile.getbbox():
            raise ValueError('Empty artwork: ' + code)
        tile.save(ROOT / 'public' / skills[code]['img'], optimize=True)
        x, y = count % 12 * 96, count // 12 * 96
        preview.paste(tile, (x + 16, y), tile)
        label = unicodedata.normalize('NFD', code).encode('ascii', errors='ignore').decode()
        labels.text((x + 4, y + 65), label[:13], fill='#e8e5cf')
        labels.text((x + 4, y + 77), label[13:26], fill='#e8e5cf')
        count += 1
if seen != set(skills):
    raise ValueError('Missing skill artwork: ' + ', '.join(set(skills) - seen))
preview.save(OUT / 'preview.png')
print(json.dumps({'packaged': count, 'preview': str(OUT / 'preview.png')}))
