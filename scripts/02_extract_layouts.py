#!/usr/bin/env python3
"""02_extract_layouts — Extract map.bin layout files to intermediate JSON.

Reads data/layouts/layouts.json from decomp + each map.bin binary file.
Outputs one JSON per layout to intermediate/layouts/.
"""
import json
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from config import DECOMP_DIR, INTERMEDIATE_DIR


def parse_map_bin(data: bytes, width: int, height: int) -> list[dict]:
    """Parse map.bin: 2 bytes per tile, row-major."""
    tiles = []
    for i in range(width * height):
        raw = struct.unpack_from('<H', data, i * 2)[0]
        tiles.append({
            'metatileId': raw & 0x3FF,
            'collision': (raw >> 10) & 0x3,
            'elevation': (raw >> 12) & 0xF,
        })
    return tiles


def main():
    layouts_json = DECOMP_DIR / 'data' / 'layouts' / 'layouts.json'
    if not layouts_json.exists():
        print("ERROR: decomp/data/layouts/layouts.json not found")
        sys.exit(1)

    with open(layouts_json) as f:
        data = json.load(f)

    output_dir = INTERMEDIATE_DIR / 'layouts'
    output_dir.mkdir(parents=True, exist_ok=True)

    print("Extracting map layouts...")
    count = 0
    errors = 0

    for layout in data['layouts']:
        layout_id = layout.get('id', '')
        if not layout_id or layout_id == 'LAYOUT_NONE':
            continue

        width = layout.get('width', 0)
        height = layout.get('height', 0)
        blockdata = layout.get('blockdata_filepath', '')
        primary = layout.get('primary_tileset', '')
        secondary = layout.get('secondary_tileset', '')

        if not blockdata or not width or not height:
            continue

        map_bin_path = DECOMP_DIR / blockdata
        if not map_bin_path.exists():
            print(f"  WARN: {layout_id}: {blockdata} not found")
            errors += 1
            continue

        bin_data = map_bin_path.read_bytes()
        expected = width * height * 2
        if len(bin_data) < expected:
            print(f"  WARN: {layout_id}: map.bin too small ({len(bin_data)} < {expected})")
            errors += 1
            continue

        tiles = parse_map_bin(bin_data, width, height)

        output = {
            'id': layout_id,
            'name': layout.get('name', ''),
            'width': width,
            'height': height,
            'primaryTileset': primary,
            'secondaryTileset': secondary,
            'tiles': tiles,
        }

        # Extract border pattern
        border_path_str = layout.get('border_filepath', '')
        border_w = layout.get('border_width', 0)
        border_h = layout.get('border_height', 0)
        if border_path_str and border_w > 0 and border_h > 0:
            border_bin_path = DECOMP_DIR / border_path_str
            if border_bin_path.exists():
                border_data = border_bin_path.read_bytes()
                expected_border = border_w * border_h * 2
                if len(border_data) >= expected_border:
                    output['borderWidth'] = border_w
                    output['borderHeight'] = border_h
                    output['borderTiles'] = parse_map_bin(border_data, border_w, border_h)

        # Use layout name (without _Layout suffix) as filename
        name = layout.get('name', layout_id).replace('_Layout', '')
        out_path = output_dir / f"{name}.json"
        with open(out_path, 'w') as f:
            json.dump(output, f)

        count += 1

    print(f"Done: {count} layouts extracted ({errors} warnings)")
    if count == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
