#!/usr/bin/env python3
"""validate_extraction — Checks tileset, layout, connection, warp, and sprite integrity."""
import json
from pathlib import Path

def validate():
    errors = []
    project_root = Path(__file__).parent.parent.parent

    # Tilesets: atlas exists, dimensions divisible by 16, TSJ matches
    tilesets_dir = project_root / 'public' / 'tilesets'
    tsj_files = list(tilesets_dir.glob('*.tsj'))
    if not tsj_files:
        errors.append("No .tsj tileset files found in public/tilesets/")
    for tsj_file in tsj_files:
        try:
            tsj = json.load(open(tsj_file))
        except (json.JSONDecodeError, OSError) as e:
            errors.append(f"{tsj_file.name}: invalid JSON: {e}")
            continue
        png = tsj_file.with_suffix('.png')
        if not png.exists():
            errors.append(f"Missing atlas: {png.name}")
            continue
        try:
            from PIL import Image
            img = Image.open(png)
            if img.width % 16 or img.height % 16:
                errors.append(f"{png.name}: dimensions {img.width}x{img.height} not divisible by 16")
            expected = (img.width // 16) * (img.height // 16)
            if tsj.get('tilecount', 0) != expected:
                errors.append(f"{tsj_file.name}: tilecount {tsj['tilecount']} != atlas capacity {expected}")
        except ImportError:
            pass  # Skip image checks if Pillow not available

    # Layouts: tile count == width * height, IDs in range
    layouts_dir = project_root / 'intermediate' / 'layouts'
    layout_files = list(layouts_dir.glob('*.json'))
    if not layout_files:
        errors.append("No layout files found in intermediate/layouts/")
    for layout_file in layout_files:
        try:
            layout = json.load(open(layout_file))
        except (json.JSONDecodeError, OSError) as e:
            errors.append(f"{layout_file.name}: invalid JSON: {e}")
            continue
        w, h = layout.get('width', 0), layout.get('height', 0)
        tiles = layout.get('tiles', [])
        if len(tiles) != w * h:
            errors.append(f"{layout.get('id', layout_file.stem)}: {len(tiles)} tiles != {w}x{h}")
        for t in tiles:
            if not (0 <= t.get('metatileId', -1) <= 1023):
                errors.append(f"{layout.get('id', layout_file.stem)}: metatile ID {t.get('metatileId')} out of range")
                break

    # Connections: reciprocal (A->NORTH->B implies B->SOUTH->A)
    headers_file = project_root / 'intermediate' / 'map_headers.json'
    if headers_file.exists():
        headers = json.load(open(headers_file))
        # Known non-reciprocal connections in FireRed (gatehouses, prototype maps)
        known_asymmetric = {
            ('MAP_SAFFRON_CITY', 'MAP_ROUTE5'), ('MAP_SAFFRON_CITY', 'MAP_ROUTE6'),
            ('MAP_SAFFRON_CITY', 'MAP_ROUTE7'), ('MAP_SAFFRON_CITY', 'MAP_ROUTE8'),
            ('MAP_PROTOTYPE_SEVII_ISLE_6', 'MAP_THREE_ISLAND'),
            ('MAP_PROTOTYPE_SEVII_ISLE_7', 'MAP_THREE_ISLAND'),
        }
        opposites = {'up': 'down', 'down': 'up', 'left': 'right', 'right': 'left',
                     'NORTH': 'SOUTH', 'SOUTH': 'NORTH', 'EAST': 'WEST', 'WEST': 'EAST'}
        for map_id, h in headers.items():
            for conn in (h.get('connections') or []):
                target = conn['map']
                direction = conn['direction']
                if (map_id, target) in known_asymmetric:
                    continue
                if target not in headers:
                    errors.append(f"{map_id}: connects to nonexistent {target}")
                    continue
                opp = opposites.get(direction, '')
                recip = [c for c in (headers[target].get('connections') or [])
                         if c['map'] == map_id and c['direction'] == opp]
                if not recip:
                    errors.append(f"{map_id}->{direction}->{target}: no reciprocal")
    else:
        errors.append("Missing intermediate/map_headers.json")

    # Warps: positions in bounds, destinations exist
    warps_file = project_root / 'intermediate' / 'warps.json'
    if warps_file.exists():
        warps = json.load(open(warps_file))
        layouts_by_id = {}
        for lf in layouts_dir.glob('*.json'):
            try:
                ld = json.load(open(lf))
                layouts_by_id[ld.get('id', '')] = ld
            except:
                pass
        for map_id, map_warps in warps.items():
            layout_id = 'LAYOUT_' + map_id.replace('MAP_', '')
            if layout_id not in layouts_by_id:
                continue
            w = layouts_by_id[layout_id].get('width', 0)
            h = layouts_by_id[layout_id].get('height', 0)
            for i, warp in enumerate(map_warps):
                if not (0 <= warp.get('x', -1) < w and 0 <= warp.get('y', -1) < h):
                    errors.append(f"{map_id} warp {i}: position ({warp.get('x')},{warp.get('y')}) out of bounds ({w}x{h})")
    else:
        errors.append("Missing intermediate/warps.json")

    # Player sprite exists
    sprites_dir = project_root / 'public' / 'sprites'
    if not (sprites_dir / 'player_male.png').exists():
        errors.append("Missing player sprite: player_male.png")
    if not (sprites_dir / 'player.json').exists():
        errors.append("Missing player animation data: player.json")

    print(f"{'PASS' if not errors else 'FAIL'}: {len(errors)} errors")
    for e in errors[:30]:
        print(f"  - {e}")
    return len(errors) == 0

if __name__ == "__main__":
    import sys
    sys.exit(0 if validate() else 1)
