#!/usr/bin/env python3
"""validate_warps — Every door you can walk into, you can walk out of."""
import json
from pathlib import Path

def validate():
    errors = []
    project_root = Path(__file__).parent.parent.parent

    warps_path = project_root / 'public' / 'data' / 'warp_table.json'
    if not warps_path.exists():
        errors.append("Missing public/data/warp_table.json")
        print(f"FAIL: {len(errors)} errors")
        for e in errors:
            print(f"  - {e}")
        return False

    warps = json.load(open(warps_path))

    # Every overworld warp destination has at least one return point
    for w in warps.get('overworldWarps', []):
        dest = w['destMap']
        returns = warps.get('interiorReturns', {}).get(dest, [])
        if not returns:
            errors.append(f"TRAP: warp to {dest} has no exit back to overworld")

    # Every interior with return points has an overworld warp leading to it
    destinations = {w['destMap'] for w in warps.get('overworldWarps', [])}
    for interior_id, returns in warps.get('interiorReturns', {}).items():
        if interior_id not in destinations:
            errors.append(f"ORPHAN: {interior_id} has exits but no overworld entrance")

    # Interior map files exist for all warp destinations
    for dest in destinations:
        if not ((project_root / 'public' / 'maps' / 'interiors' / f"{dest}.json").exists() or
                (project_root / 'public' / 'maps' / 'dungeons' / f"{dest}.json").exists()):
            errors.append(f"MISSING: {dest}.json not found")

    # Interior maps are valid Tiled JSON
    for dest in destinations:
        for dir_name in ['interiors', 'dungeons']:
            p = project_root / 'public' / 'maps' / dir_name / f"{dest}.json"
            if p.exists():
                try:
                    data = json.load(open(p))
                    if not data.get('width') or not data.get('height'):
                        errors.append(f"{dest}: missing dimensions")
                    if not data.get('layers'):
                        errors.append(f"{dest}: missing layers")
                except json.JSONDecodeError:
                    errors.append(f"{dest}: invalid JSON")

    print(f"{'PASS' if not errors else 'FAIL'}: {len(errors)} errors")
    for e in errors:
        print(f"  - {e}")
    return len(errors) == 0

if __name__ == "__main__":
    import sys
    sys.exit(0 if validate() else 1)
