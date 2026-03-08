#!/usr/bin/env python3
"""validate_stitch — Checks the overworld is structurally sound."""
import json
from pathlib import Path

def validate():
    errors = []
    project_root = Path(__file__).parent.parent.parent

    overworld_path = project_root / 'public' / 'maps' / 'overworld.json'
    placement_path = project_root / 'public' / 'data' / 'overworld_placement.json'
    zones_path = project_root / 'public' / 'data' / 'overworld_zones.json'
    warps_path = project_root / 'public' / 'data' / 'warp_table.json'

    if not overworld_path.exists():
        errors.append("Missing public/maps/overworld.json")
        print(f"FAIL: {len(errors)} errors")
        for e in errors:
            print(f"  - {e}")
        return False

    overworld = json.load(open(overworld_path))
    ow_w, ow_h = overworld['width'], overworld['height']

    # Required layers exist
    layer_names = {l['name'] for l in overworld['layers']}
    for name in ['bottom', 'top', 'collision', 'warps', 'zones']:
        if name not in layer_names:
            errors.append(f"Missing layer: {name}")

    # Tile layer data lengths match dimensions
    for layer in overworld['layers']:
        if layer['type'] == 'tilelayer':
            expected = ow_w * ow_h
            actual = len(layer.get('data', []))
            if actual != expected:
                errors.append(f"Layer '{layer['name']}': data length {actual} != {expected}")

    # Placement checks
    if placement_path.exists():
        placement = json.load(open(placement_path))

        # No map overlaps
        occupied = {}
        for map_id, pos in placement.items():
            for y in range(pos['y'], pos['y'] + pos['h']):
                for x in range(pos['x'], pos['x'] + pos['w']):
                    if (x, y) in occupied:
                        errors.append(f"Overlap at ({x},{y}): {occupied[(x,y)]} and {map_id}")
                        break
                    occupied[(x, y)] = map_id
                else:
                    continue
                break

        # Every placed map has tile data (not all zeros)
        bottom_layer = next((l for l in overworld['layers'] if l['name'] == 'bottom'), None)
        if bottom_layer:
            bottom = bottom_layer['data']
            for map_id, pos in placement.items():
                has_data = False
                for y in range(pos['y'], pos['y'] + pos['h']):
                    for x in range(pos['x'], pos['x'] + pos['w']):
                        idx = y * ow_w + x
                        if 0 <= idx < len(bottom) and bottom[idx] != 0:
                            has_data = True
                            break
                    if has_data:
                        break
                if not has_data:
                    errors.append(f"{map_id}: all zeros in overworld (no tile data)")
    else:
        errors.append("Missing public/data/overworld_placement.json")

    # Zone checks
    if zones_path.exists():
        zones = json.load(open(zones_path))
        zone_ids = {z['id'] for z in zones.get('zones', [])}
        if placement_path.exists():
            placement = json.load(open(placement_path))
            for map_id in placement:
                if map_id not in zone_ids:
                    errors.append(f"{map_id}: no zone defined")
    else:
        errors.append("Missing public/data/overworld_zones.json")

    # Warp checks
    if warps_path.exists():
        warps = json.load(open(warps_path))

        for w in warps.get('overworldWarps', []):
            dest = w['destMap']
            if not ((project_root / 'public' / 'maps' / 'interiors' / f"{dest}.json").exists() or
                    (project_root / 'public' / 'maps' / 'dungeons' / f"{dest}.json").exists()):
                errors.append(f"Warp to {dest}: file not found")

        for w in warps.get('overworldWarps', []):
            if not (0 <= w['overworldX'] < ow_w and 0 <= w['overworldY'] < ow_h):
                errors.append(f"Warp at ({w['overworldX']},{w['overworldY']}): outside overworld")
    else:
        errors.append("Missing public/data/warp_table.json")

    # Tileset files exist
    for ts in overworld.get('tilesets', []):
        ts_path = project_root / 'public' / 'tilesets' / ts['source']
        if not ts_path.exists():
            errors.append(f"Tileset {ts['source']}: file not found")

    print(f"{'PASS' if not errors else 'FAIL'}: {len(errors)} errors")
    for e in errors[:30]:
        print(f"  - {e}")
    return len(errors) == 0

if __name__ == "__main__":
    import sys
    sys.exit(0 if validate() else 1)
