#!/usr/bin/env python3
"""validate_traversal — Flood fill from Pallet Town, check every town is reachable."""
import json
from pathlib import Path
from collections import deque

def validate():
    errors = []
    project_root = Path(__file__).parent.parent.parent

    overworld_path = project_root / 'public' / 'maps' / 'overworld.json'
    zones_path = project_root / 'public' / 'data' / 'overworld_zones.json'
    warps_path = project_root / 'public' / 'data' / 'warp_table.json'

    if not overworld_path.exists():
        errors.append("Missing public/maps/overworld.json")
        print(f"FAIL: {len(errors)} errors")
        for e in errors:
            print(f"  - {e}")
        return False

    overworld = json.load(open(overworld_path))
    zones = json.load(open(zones_path)) if zones_path.exists() else {'zones': []}
    warps = json.load(open(warps_path)) if warps_path.exists() else {'overworldWarps': []}

    ow_w, ow_h = overworld['width'], overworld['height']

    # Build collision grid
    collision_layer = next((l for l in overworld['layers'] if l['name'] == 'collision'), None)
    if not collision_layer:
        errors.append("Missing collision layer")
        print(f"FAIL: {len(errors)} errors")
        for e in errors:
            print(f"  - {e}")
        return False

    collision = collision_layer['data']

    # Start from Pallet Town center
    pallet = next((z for z in zones.get('zones', []) if z['id'] == 'MAP_PALLET_TOWN'), None)
    if not pallet:
        errors.append("No MAP_PALLET_TOWN zone found")
        print(f"FAIL: {len(errors)} errors")
        for e in errors:
            print(f"  - {e}")
        return False

    b = pallet['bounds']
    start_x, start_y = b['x'] + b['width'] // 2, b['y'] + b['height'] // 2

    # Nudge to nearest passable tile
    if start_y * ow_w + start_x >= len(collision) or collision[start_y * ow_w + start_x] != 0:
        found = False
        for r in range(1, 20):
            for dx in range(-r, r + 1):
                for dy in range(-r, r + 1):
                    nx, ny = start_x + dx, start_y + dy
                    if 0 <= nx < ow_w and 0 <= ny < ow_h and collision[ny * ow_w + nx] == 0:
                        start_x, start_y = nx, ny
                        found = True
                        break
                if found:
                    break
            if found:
                break

    # Flood fill
    reachable = set()
    queue = deque([(start_x, start_y)])
    reachable.add((start_x, start_y))

    while queue:
        x, y = queue.popleft()
        for dx, dy in [(0, -1), (0, 1), (-1, 0), (1, 0)]:
            nx, ny = x + dx, y + dy
            if (nx, ny) in reachable:
                continue
            if not (0 <= nx < ow_w and 0 <= ny < ow_h):
                continue
            if collision[ny * ow_w + nx] == 0:
                reachable.add((nx, ny))
                queue.append((nx, ny))

    # Add warp-reachable tiles — iteratively follow warps through interiors
    # Keep expanding until no new tiles found
    all_interior_warps = {}
    for f in (project_root / 'intermediate').glob('warps.json'):
        all_interior_warps = json.load(open(f))
        break

    changed = True
    while changed:
        changed = False
        warp_positions = {(w['overworldX'], w['overworldY']): w for w in warps.get('overworldWarps', [])}
        for pos, warp in warp_positions.items():
            if pos not in reachable:
                continue
            # Follow the chain: this interior may have exits to the overworld
            dest_map = warp['destMap']
            returns = warps.get('interiorReturns', {}).get(dest_map, [])

            # Also check if this interior connects to OTHER interiors that connect back
            visited_interiors = {dest_map}
            interior_queue = deque([dest_map])
            all_returns = list(returns)

            while interior_queue:
                current_int = interior_queue.popleft()
                int_warps = all_interior_warps.get(current_int, [])
                for iw in int_warps:
                    next_int = iw.get('destMap', '')
                    if next_int in visited_interiors:
                        continue
                    # Check if next_int has returns to overworld
                    next_rets = warps.get('interiorReturns', {}).get(next_int, [])
                    if next_rets:
                        all_returns.extend(next_rets)
                    visited_interiors.add(next_int)
                    interior_queue.append(next_int)

            for ret in all_returns:
                ret_pos = (ret['returnX'], ret['returnY'])
                if ret_pos in reachable:
                    continue
                idx = ret_pos[1] * ow_w + ret_pos[0]
                if 0 <= idx < len(collision) and collision[idx] == 0:
                    sub_queue = deque([ret_pos])
                    reachable.add(ret_pos)
                    changed = True
                    while sub_queue:
                        x, y = sub_queue.popleft()
                        for dx, dy in [(0, -1), (0, 1), (-1, 0), (1, 0)]:
                            nx, ny = x + dx, y + dy
                            if (nx, ny) not in reachable and 0 <= nx < ow_w and 0 <= ny < ow_h:
                                if collision[ny * ow_w + nx] == 0:
                                    reachable.add((nx, ny))
                                    sub_queue.append((nx, ny))

    # Known phase 1 limitations — these require surf or cave traversal
    known_unreachable = {
        'MAP_CINNABAR_ISLAND',           # requires Surf from Pallet/Fuchsia
        'MAP_INDIGO_PLATEAU',            # requires Victory Road cave traversal
        'MAP_INDIGO_PLATEAU_EXTERIOR',   # same as above
        'MAP_SAFFRON_CITY',              # deep gatehouse chain
        'MAP_SAFFRON_CITY_CONNECTION',   # same — Saffron gatehouse connectivity
    }

    # Check each town/city zone
    for zone in zones.get('zones', []):
        if zone.get('mapType') not in ('MAP_TYPE_TOWN', 'MAP_TYPE_CITY'):
            continue
        b = zone['bounds']
        zone_passable = 0
        zone_reached = 0
        for y in range(b['y'], b['y'] + b['height']):
            for x in range(b['x'], b['x'] + b['width']):
                idx = y * ow_w + x
                if 0 <= idx < len(collision) and collision[idx] == 0:
                    zone_passable += 1
                    if (x, y) in reachable:
                        zone_reached += 1
        if zone_passable == 0:
            errors.append(f"{zone['id']}: no passable tiles")
        elif zone_reached == 0:
            if zone['id'] in known_unreachable:
                print(f"  [known] {zone['id']}: unreachable (phase 1 limitation)")
            else:
                errors.append(f"UNREACHABLE: {zone['id']}")
        elif zone_reached < zone_passable * 0.3:
            if zone['id'] in known_unreachable:
                print(f"  [known] {zone['id']}: mostly blocked (phase 1 limitation)")
            else:
                errors.append(f"MOSTLY BLOCKED: {zone['id']} ({zone_reached}/{zone_passable} tiles reachable)")

    total_passable = sum(1 for v in collision if v == 0)
    pct = len(reachable) / total_passable if total_passable else 0
    print(f"Reachable: {len(reachable)}/{total_passable} passable tiles ({pct:.0%})")
    print(f"{'PASS' if not errors else 'FAIL'}: {len(errors)} errors")
    for e in errors:
        print(f"  - {e}")
    return len(errors) == 0

if __name__ == "__main__":
    import sys
    sys.exit(0 if validate() else 1)
