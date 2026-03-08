#!/usr/bin/env python3
"""04_extract_warps — Extract warp data from decomp map.json event files.

Reads data/maps/*/map.json warp_events from decomp.
Outputs intermediate/warps.json with per-map warp arrays.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from config import DECOMP_DIR, INTERMEDIATE_DIR


def main():
    maps_dir = DECOMP_DIR / 'data' / 'maps'
    if not maps_dir.exists():
        print("ERROR: decomp/data/maps not found")
        sys.exit(1)

    print("Extracting warps...")
    warps = {}
    total_warps = 0

    for map_dir in sorted(maps_dir.iterdir()):
        if not map_dir.is_dir():
            continue
        map_json = map_dir / 'map.json'
        if not map_json.exists():
            continue

        with open(map_json) as f:
            data = json.load(f)

        map_id = data.get('id', '')
        if not map_id:
            continue

        warp_events = data.get('warp_events', [])
        if not warp_events:
            continue

        map_warps = []
        for warp in warp_events:
            dest_warp_id = warp.get('dest_warp_id', '0')
            # Handle string or int
            if isinstance(dest_warp_id, str):
                try:
                    dest_warp_id = int(dest_warp_id)
                except ValueError:
                    dest_warp_id = 0

            map_warps.append({
                'x': warp.get('x', 0),
                'y': warp.get('y', 0),
                'elevation': warp.get('elevation', 0),
                'destMap': warp.get('dest_map', ''),
                'destWarpId': dest_warp_id,
            })

        warps[map_id] = map_warps
        total_warps += len(map_warps)

    # Save
    output_path = INTERMEDIATE_DIR / 'warps.json'
    with open(output_path, 'w') as f:
        json.dump(warps, f, indent=2)

    print(f"Done: {total_warps} warps from {len(warps)} maps")
    if total_warps == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
