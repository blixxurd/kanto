#!/usr/bin/env python3
"""03_extract_map_headers — Extract map headers from decomp map.json files.

Reads data/maps/*/map.json from decomp to extract connections, map types,
music, weather, and other map properties.
Outputs intermediate/map_headers.json.
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

    print("Extracting map headers...")
    headers = {}
    count = 0

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

        header = {
            'name': data.get('name', ''),
            'layout': data.get('layout', ''),
            'music': data.get('music', ''),
            'regionMapSection': data.get('region_map_section', ''),
            'weather': data.get('weather', ''),
            'mapType': data.get('map_type', ''),
            'allowCycling': data.get('allow_cycling', False),
            'allowRunning': data.get('allow_running', False),
            'showMapName': data.get('show_map_name', False),
            'battleScene': data.get('battle_scene', ''),
            'connections': data.get('connections', []),
        }

        headers[map_id] = header
        count += 1

    # Save
    output_path = INTERMEDIATE_DIR / 'map_headers.json'
    with open(output_path, 'w') as f:
        json.dump(headers, f, indent=2)

    print(f"Done: {count} map headers extracted")
    if count == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
