#!/usr/bin/env python3
"""06_stitch_overworld — BFS-stitch all outdoor maps into one overworld Tiled JSON.

1. Filter outdoor maps (TOWN, CITY, ROUTE, OCEAN_ROUTE)
2. BFS from MAP_PALLET_TOWN following connections
3. Compute absolute tile positions for each map
4. Build tileset registry with firstgid assignments
5. Paste tile data into one giant grid
6. Build collision, warp, and zone layers
7. Output overworld.json + supporting data files
"""
import json
import sys
from collections import deque
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from config import DECOMP_DIR, INTERMEDIATE_DIR, PUBLIC_DIR

OUTDOOR_TYPES = {'MAP_TYPE_TOWN', 'MAP_TYPE_CITY', 'MAP_TYPE_ROUTE', 'MAP_TYPE_OCEAN_ROUTE'}
NUM_TILES_IN_PRIMARY = 640  # FireRed: metatile IDs 0-639 = primary, 640+ = secondary
START_MAP = 'MAP_PALLET_TOWN'


def load_layouts() -> dict:
    layouts = {}
    layouts_dir = INTERMEDIATE_DIR / 'layouts'
    for f in layouts_dir.glob('*.json'):
        data = json.load(open(f))
        layouts[data['id']] = data
    return layouts


def load_headers() -> dict:
    return json.load(open(INTERMEDIATE_DIR / 'map_headers.json'))


def load_warps() -> dict:
    return json.load(open(INTERMEDIATE_DIR / 'warps.json'))


def load_collision(name: str) -> list[dict] | None:
    """Load collision attributes for a tileset."""
    path = INTERMEDIATE_DIR / 'collision' / f"{name}.json"
    if path.exists():
        data = json.load(open(path))
        return data['attributes']
    return None


def tileset_c_name_to_dir(c_name: str) -> str | None:
    """Convert gTileset_PalletTown -> pallet_town directory name."""
    short = c_name.replace('gTileset_', '')
    # Try both primary and secondary
    for category in ['primary', 'secondary']:
        cat_dir = DECOMP_DIR / 'data' / 'tilesets' / category
        if not cat_dir.exists():
            continue
        for d in cat_dir.iterdir():
            if not d.is_dir():
                continue
            if d.name.lower().replace('_', '') == short.lower():
                return d.name
    return None


def bfs_place_maps(headers: dict, layouts: dict) -> dict:
    """BFS from START_MAP, compute absolute position of each outdoor map.
    Returns {map_id: {'x': int, 'y': int, 'w': int, 'h': int, 'layout_id': str}}
    """
    placed = {}
    queue = deque()

    # Place starting map at origin
    start_header = headers[START_MAP]
    start_layout_id = start_header['layout']
    start_layout = layouts.get(start_layout_id)
    if not start_layout:
        print(f"ERROR: Layout {start_layout_id} for {START_MAP} not found")
        sys.exit(1)

    placed[START_MAP] = {
        'x': 0, 'y': 0,
        'w': start_layout['width'], 'h': start_layout['height'],
        'layout_id': start_layout_id,
    }
    queue.append(START_MAP)

    while queue:
        current_id = queue.popleft()
        current = placed[current_id]
        header = headers.get(current_id, {})
        connections = header.get('connections') or []

        for conn in connections:
            target_id = conn['map']
            direction = conn['direction']
            offset = conn.get('offset', 0)

            if target_id in placed:
                continue
            if target_id not in headers:
                continue
            target_header = headers[target_id]
            if target_header.get('mapType') not in OUTDOOR_TYPES:
                continue

            target_layout_id = target_header['layout']
            target_layout = layouts.get(target_layout_id)
            if not target_layout:
                continue

            tw = target_layout['width']
            th = target_layout['height']

            # Calculate target position based on connection direction
            # Direction is from current map's perspective:
            # "up" = target is NORTH of current
            # "down" = target is SOUTH of current
            # "left" = target is WEST of current
            # "right" = target is EAST of current
            # Offset is how far along the shared edge the target is shifted
            if direction == 'up':
                tx = current['x'] + offset
                ty = current['y'] - th
            elif direction == 'down':
                tx = current['x'] + offset
                ty = current['y'] + current['h']
            elif direction == 'left':
                tx = current['x'] - tw
                ty = current['y'] + offset
            elif direction == 'right':
                tx = current['x'] + current['w']
                ty = current['y'] + offset
            else:
                continue

            placed[target_id] = {
                'x': tx, 'y': ty,
                'w': tw, 'h': th,
                'layout_id': target_layout_id,
            }
            queue.append(target_id)

    return placed


def build_tileset_registry(placed: dict, layouts: dict) -> tuple[dict, list]:
    """Assign firstgid values to each unique tileset pair.
    Returns (registry dict, tiled_tilesets list)
    """
    # Collect unique tilesets used by placed maps
    used_tilesets = set()
    for map_id, pos in placed.items():
        layout = layouts[pos['layout_id']]
        primary = layout.get('primaryTileset', '')
        secondary = layout.get('secondaryTileset', '')
        if primary:
            used_tilesets.add(primary)
        if secondary:
            used_tilesets.add(secondary)

    # Map C names to directory names
    registry = {}
    tiled_tilesets = []
    next_gid = 1

    for c_name in sorted(used_tilesets):
        if c_name == 'NULL':
            continue
        dir_name = tileset_c_name_to_dir(c_name)
        if not dir_name:
            print(f"  WARN: Cannot find directory for {c_name}")
            continue

        tsj_path = PUBLIC_DIR / 'tilesets' / f"{dir_name}.tsj"
        if not tsj_path.exists():
            print(f"  WARN: Missing TSJ for {dir_name}")
            continue

        tsj = json.load(open(tsj_path))
        tilecount = tsj['tilecount']

        registry[c_name] = {
            'dirName': dir_name,
            'firstgid': next_gid,
            'tilecount': tilecount,
        }

        tiled_tilesets.append({
            'firstgid': next_gid,
            'source': f"{dir_name}.tsj",
        })

        next_gid += tilecount

        # Also register the _top atlas for sprite overlay layer
        top_tsj_path = PUBLIC_DIR / 'tilesets' / f"{dir_name}_top.tsj"
        if top_tsj_path.exists():
            registry[c_name + '_top'] = {
                'dirName': dir_name + '_top',
                'firstgid': next_gid,
                'tilecount': tilecount,
            }
            tiled_tilesets.append({
                'firstgid': next_gid,
                'source': f"{dir_name}_top.tsj",
            })
            next_gid += tilecount

    return registry, tiled_tilesets


def main():
    print("Stitching overworld...")

    headers = load_headers()
    layouts = load_layouts()
    warps = load_warps()

    # BFS placement
    placed = bfs_place_maps(headers, layouts)
    print(f"  Placed {len(placed)} outdoor maps via BFS")

    if not placed:
        print("ERROR: No maps placed")
        sys.exit(1)

    # Normalize coordinates so minimum is at (0,0) with padding
    pad = 2
    min_x = min(p['x'] for p in placed.values()) - pad
    min_y = min(p['y'] for p in placed.values()) - pad
    max_x = max(p['x'] + p['w'] for p in placed.values()) + pad
    max_y = max(p['y'] + p['h'] for p in placed.values()) + pad

    for p in placed.values():
        p['x'] -= min_x
        p['y'] -= min_y

    ow_w = max_x - min_x
    ow_h = max_y - min_y
    print(f"  Overworld size: {ow_w}x{ow_h} tiles")

    # Build tileset registry
    registry, tiled_tilesets = build_tileset_registry(placed, layouts)
    print(f"  {len(registry)} unique tilesets in registry")

    # Load collision data
    collision_data = {}
    for c_name, reg in registry.items():
        attrs = load_collision(reg['dirName'])
        if attrs:
            collision_data[c_name] = attrs

    # Initialize tile grids
    total = ow_w * ow_h
    bottom_tiles = [0] * total
    top_tiles = [0] * total
    collision_grid = [0] * total
    behavior_grid = [0] * total

    # Paste each map's tiles
    for map_id, pos in placed.items():
        layout = layouts[pos['layout_id']]
        primary = layout.get('primaryTileset', '')
        secondary = layout.get('secondaryTileset', '')
        tiles = layout.get('tiles', [])

        for local_y in range(pos['h']):
            for local_x in range(pos['w']):
                tile_idx = local_y * pos['w'] + local_x
                if tile_idx >= len(tiles):
                    continue

                tile = tiles[tile_idx]
                metatile_id = tile['metatileId']
                coll = tile['collision']

                # Determine which tileset this metatile belongs to
                # Primary: 0-639, Secondary: 640+ (FireRed NUM_TILES_IN_PRIMARY=640)
                if metatile_id < NUM_TILES_IN_PRIMARY:
                    tileset_name = primary
                    local_id = metatile_id
                else:
                    tileset_name = secondary
                    local_id = metatile_id - NUM_TILES_IN_PRIMARY

                if tileset_name not in registry:
                    continue

                gid = registry[tileset_name]['firstgid'] + local_id

                # Global position in overworld
                gx = pos['x'] + local_x
                gy = pos['y'] + local_y
                global_idx = gy * ow_w + gx

                if 0 <= global_idx < total:
                    bottom_tiles[global_idx] = gid

                    # Top layer: metatiles with layerType=0 (NORMAL) or 2 (SPLIT)
                    # have their top tiles rendered OVER sprites.
                    # layerType=1 (COVERED) means everything renders BEHIND sprites.
                    top_key = tileset_name + '_top'
                    if top_key in registry and tileset_name in collision_data:
                        attrs = collision_data[tileset_name]
                        if local_id < len(attrs):
                            lt = attrs[local_id].get('layerType', 0)
                            if lt == 0 or lt == 2:  # NORMAL or SPLIT
                                top_tiles[global_idx] = registry[top_key]['firstgid'] + local_id

                    # Behavior: store metatile behavior ID for field effects
                    if tileset_name in collision_data:
                        attrs = collision_data[tileset_name]
                        if local_id < len(attrs):
                            behavior_grid[global_idx] = attrs[local_id]['behavior']

                    # Collision: use both map.bin collision bits and metatile behavior
                    is_blocked = coll != 0
                    if not is_blocked and tileset_name in collision_data:
                        attrs = collision_data[tileset_name]
                        if local_id < len(attrs):
                            is_blocked = not attrs[local_id]['passable']
                    collision_grid[global_idx] = 1 if is_blocked else 0

    # Mark empty cells (no tile data) as blocked
    for i in range(total):
        if bottom_tiles[i] == 0:
            collision_grid[i] = 1

    # Build warp objects for overworld
    overworld_warps = []
    interior_returns = {}
    warp_obj_id = 1

    for map_id, pos in placed.items():
        map_warps = warps.get(map_id, [])
        for i, warp in enumerate(map_warps):
            ow_x = pos['x'] + warp['x']
            ow_y = pos['y'] + warp['y']
            dest_map = warp['destMap']

            overworld_warps.append({
                'overworldX': ow_x,
                'overworldY': ow_y,
                'destMap': dest_map,
                'destWarpId': warp['destWarpId'],
            })

    # Build interior return points: for each interior, find its exit warps
    # that lead to overworld maps and compute the overworld return position
    all_interior_maps = set()
    for w in overworld_warps:
        all_interior_maps.add(w['destMap'])

    for interior_id in all_interior_maps:
        interior_warps = warps.get(interior_id, [])
        for j, iw in enumerate(interior_warps):
            dest_map_id = iw['destMap']
            dest_warp_idx = iw['destWarpId']
            # Check if this interior warp leads to a placed overworld map
            if dest_map_id in placed:
                dest_pos = placed[dest_map_id]
                # Find the destination warp position in that overworld map
                dest_map_warps = warps.get(dest_map_id, [])
                if isinstance(dest_warp_idx, int) and dest_warp_idx < len(dest_map_warps):
                    dw = dest_map_warps[dest_warp_idx]
                    return_x = dest_pos['x'] + dw['x']
                    return_y = dest_pos['y'] + dw['y']
                else:
                    # Fallback: use center of destination map
                    return_x = dest_pos['x'] + dest_pos['w'] // 2
                    return_y = dest_pos['y'] + dest_pos['h'] // 2

                if interior_id not in interior_returns:
                    interior_returns[interior_id] = []
                existing = [r for r in interior_returns[interior_id] if r['warpId'] == j]
                if not existing:
                    interior_returns[interior_id].append({
                        'warpId': j,
                        'returnX': return_x,
                        'returnY': return_y,
                    })

    # Clear collision on warp tiles — doors must be passable so the player can step on them
    for w in overworld_warps:
        idx = w['overworldY'] * ow_w + w['overworldX']
        if 0 <= idx < total:
            collision_grid[idx] = 0

    # Build warp objects for Tiled
    warp_objects = []
    for w in overworld_warps:
        warp_objects.append({
            'id': warp_obj_id,
            'name': w['destMap'],
            'type': 'warp',
            'x': w['overworldX'] * 16,
            'y': w['overworldY'] * 16,
            'width': 16,
            'height': 16,
            'properties': [
                {'name': 'destMap', 'type': 'string', 'value': w['destMap']},
                {'name': 'destWarpId', 'type': 'int', 'value': w['destWarpId']},
            ],
        })
        warp_obj_id += 1

    # Build zone objects
    zone_objects = []
    zones_list = []
    zone_obj_id = warp_obj_id
    for map_id, pos in placed.items():
        header = headers.get(map_id, {})
        zone = {
            'id': map_id,
            'name': header.get('name', map_id.replace('MAP_', '').replace('_', ' ').title()),
            'bounds': {'x': pos['x'], 'y': pos['y'], 'width': pos['w'], 'height': pos['h']},
            'music': header.get('music', ''),
            'weather': header.get('weather', ''),
            'mapType': header.get('mapType', ''),
            'showNameOnEntry': header.get('showMapName', False),
        }
        zones_list.append(zone)

        zone_objects.append({
            'id': zone_obj_id,
            'name': map_id,
            'type': 'zone',
            'x': pos['x'] * 16,
            'y': pos['y'] * 16,
            'width': pos['w'] * 16,
            'height': pos['h'] * 16,
            'properties': [
                {'name': 'mapType', 'type': 'string', 'value': header.get('mapType', '')},
                {'name': 'music', 'type': 'string', 'value': header.get('music', '')},
            ],
        })
        zone_obj_id += 1

    # Build Tiled JSON
    overworld_json = {
        'width': ow_w,
        'height': ow_h,
        'tilewidth': 16,
        'tileheight': 16,
        'orientation': 'orthogonal',
        'renderorder': 'right-down',
        'infinite': False,
        'compressionlevel': -1,
        'layers': [
            {
                'name': 'bottom',
                'type': 'tilelayer',
                'width': ow_w,
                'height': ow_h,
                'data': bottom_tiles,
                'visible': True,
                'opacity': 1,
                'x': 0,
                'y': 0,
            },
            {
                'name': 'top',
                'type': 'tilelayer',
                'width': ow_w,
                'height': ow_h,
                'data': top_tiles,
                'visible': True,
                'opacity': 1,
                'x': 0,
                'y': 0,
            },
            {
                'name': 'collision',
                'type': 'tilelayer',
                'width': ow_w,
                'height': ow_h,
                'data': collision_grid,
                'visible': False,
                'opacity': 1,
                'x': 0,
                'y': 0,
            },
            {
                'name': 'behavior',
                'type': 'tilelayer',
                'width': ow_w,
                'height': ow_h,
                'data': behavior_grid,
                'visible': False,
                'opacity': 1,
                'x': 0,
                'y': 0,
            },
            {
                'name': 'warps',
                'type': 'objectgroup',
                'objects': warp_objects,
                'visible': True,
                'opacity': 1,
            },
            {
                'name': 'zones',
                'type': 'objectgroup',
                'objects': zone_objects,
                'visible': True,
                'opacity': 1,
            },
        ],
        'tilesets': tiled_tilesets,
    }

    # Save outputs
    (PUBLIC_DIR / 'maps').mkdir(parents=True, exist_ok=True)
    (PUBLIC_DIR / 'data').mkdir(parents=True, exist_ok=True)

    with open(PUBLIC_DIR / 'maps' / 'overworld.json', 'w') as f:
        json.dump(overworld_json, f)
    print(f"  Wrote overworld.json ({ow_w}x{ow_h})")

    with open(PUBLIC_DIR / 'data' / 'overworld_zones.json', 'w') as f:
        json.dump({'zones': zones_list}, f, indent=2)
    print(f"  Wrote overworld_zones.json ({len(zones_list)} zones)")

    with open(PUBLIC_DIR / 'data' / 'warp_table.json', 'w') as f:
        json.dump({
            'overworldWarps': overworld_warps,
            'interiorReturns': interior_returns,
        }, f, indent=2)
    print(f"  Wrote warp_table.json ({len(overworld_warps)} warps)")

    placement_data = {map_id: pos for map_id, pos in placed.items()}
    with open(PUBLIC_DIR / 'data' / 'overworld_placement.json', 'w') as f:
        json.dump(placement_data, f, indent=2)
    print(f"  Wrote overworld_placement.json")

    # Tileset registry
    tileset_registry = {}
    for c_name, reg in registry.items():
        tileset_registry[reg['dirName']] = {
            'firstgid': reg['firstgid'],
            'tilecount': reg['tilecount'],
            'file': f"{reg['dirName']}.tsj",
        }
    with open(PUBLIC_DIR / 'data' / 'tileset_registry.json', 'w') as f:
        json.dump(tileset_registry, f, indent=2)
    print(f"  Wrote tileset_registry.json")

    print("Done!")


if __name__ == "__main__":
    main()
