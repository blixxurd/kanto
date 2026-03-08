#!/usr/bin/env python3
"""05_extract_collision — Extract collision/behavior data from metatile_attributes.bin.

Reads metatile_attributes.bin from each tileset in the decomp.
Outputs per-tileset collision JSONs to intermediate/collision/.
"""
import json
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from config import DECOMP_DIR, INTERMEDIATE_DIR

# Behaviors that are impassable (from include/constants/metatile_behaviors.h)
IMPASSABLE_BEHAVIORS = {
    0x30, 0x31, 0x32, 0x33,  # MB_IMPASSABLE_EAST/WEST/NORTH/SOUTH
    0x34, 0x35, 0x36, 0x37,  # MB_IMPASSABLE_NE/NW/SE/SW
}

# Behaviors that are water (impassable without surf)
WATER_BEHAVIORS = {
    0x10, 0x11, 0x12, 0x13,  # POND, FAST, DEEP, WATERFALL
    0x15, 0x16, 0x17,        # OCEAN, PUDDLE, SHALLOW
    0x19, 0x1A, 0x1B,        # UNDERWATER_BLOCKED, UNUSED_WATER, CYCLING_ROAD_WATER
}


def parse_metatile_attributes(data: bytes) -> list[dict]:
    """Parse metatile_attributes.bin: 4 bytes per metatile (u32 LE)."""
    count = len(data) // 4
    attrs = []
    for i in range(count):
        raw = struct.unpack_from('<I', data, i * 4)[0]
        behavior = raw & 0x1FF
        terrain_type = (raw >> 9) & 0x1F
        encounter_type = (raw >> 24) & 0x7
        layer_type = (raw >> 29) & 0x3

        # Determine passability
        passable = True
        if behavior in IMPASSABLE_BEHAVIORS:
            passable = False
        if behavior in WATER_BEHAVIORS:
            passable = False  # Impassable without surf in phase 1

        attrs.append({
            'behavior': behavior,
            'terrainType': terrain_type,
            'encounterType': encounter_type,
            'layerType': layer_type,
            'passable': passable,
        })
    return attrs


def main():
    tilesets_dir = DECOMP_DIR / 'data' / 'tilesets'
    if not tilesets_dir.exists():
        print("ERROR: decomp/data/tilesets not found")
        sys.exit(1)

    output_dir = INTERMEDIATE_DIR / 'collision'
    output_dir.mkdir(parents=True, exist_ok=True)

    print("Extracting collision data...")
    count = 0

    for category in ['primary', 'secondary']:
        category_dir = tilesets_dir / category
        if not category_dir.exists():
            continue
        for tileset_dir in sorted(category_dir.iterdir()):
            if not tileset_dir.is_dir():
                continue

            attrs_bin = tileset_dir / 'metatile_attributes.bin'
            if not attrs_bin.exists():
                continue

            name = tileset_dir.name
            attrs = parse_metatile_attributes(attrs_bin.read_bytes())

            output = {
                'tileset': name,
                'category': category,
                'metatileCount': len(attrs),
                'attributes': attrs,
            }

            out_path = output_dir / f"{name}.json"
            with open(out_path, 'w') as f:
                json.dump(output, f)

            count += 1

    print(f"Done: {count} tileset collision files extracted")
    if count == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
