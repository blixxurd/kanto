#!/usr/bin/env python3
"""07_export_interiors — Convert indoor/cave/dungeon maps to individual Tiled JSONs.

For every map that is NOT placed on the overworld, export it as a standalone
Tiled JSON with its own tileset references, collision layer, and warp objects.
"""
import json
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from config import DECOMP_DIR, INTERMEDIATE_DIR, PUBLIC_DIR

# Map types that go in dungeons/ vs interiors/
DUNGEON_TYPES = {'MAP_TYPE_UNDERGROUND'}
OUTDOOR_TYPES = {'MAP_TYPE_TOWN', 'MAP_TYPE_CITY', 'MAP_TYPE_ROUTE', 'MAP_TYPE_OCEAN_ROUTE'}


def tileset_c_name_to_dir(c_name: str) -> str | None:
    short = c_name.replace('gTileset_', '')
    for category in ['primary', 'secondary']:
        cat_dir = DECOMP_DIR / 'data' / 'tilesets' / category
        if not cat_dir.exists():
            continue
        for d in cat_dir.iterdir():
            if d.is_dir() and d.name.lower().replace('_', '') == short.lower():
                return d.name
    return None


def main():
    print("Exporting interior maps...")

    headers = json.load(open(INTERMEDIATE_DIR / 'map_headers.json'))
    warps = json.load(open(INTERMEDIATE_DIR / 'warps.json'))

    # Load all layouts indexed by ID
    layouts = {}
    for f in (INTERMEDIATE_DIR / 'layouts').glob('*.json'):
        data = json.load(open(f))
        layouts[data['id']] = data

    # Load overworld placement to know which maps are already on the overworld
    placement_path = PUBLIC_DIR / 'data' / 'overworld_placement.json'
    placed_maps = set()
    if placement_path.exists():
        placed_maps = set(json.load(open(placement_path)).keys())

    # Collect tileset TSJ data for firstgid assignment
    tsj_cache = {}
    def get_tsj(dir_name):
        if dir_name not in tsj_cache:
            p = PUBLIC_DIR / 'tilesets' / f"{dir_name}.tsj"
            if p.exists():
                tsj_cache[dir_name] = json.load(open(p))
            else:
                tsj_cache[dir_name] = None
        return tsj_cache[dir_name]

    # Load collision data
    collision_cache = {}
    def get_collision(dir_name):
        if dir_name not in collision_cache:
            p = INTERMEDIATE_DIR / 'collision' / f"{dir_name}.json"
            if p.exists():
                collision_cache[dir_name] = json.load(open(p))['attributes']
            else:
                collision_cache[dir_name] = None
        return collision_cache[dir_name]

    interiors_dir = PUBLIC_DIR / 'maps' / 'interiors'
    dungeons_dir = PUBLIC_DIR / 'maps' / 'dungeons'
    interiors_dir.mkdir(parents=True, exist_ok=True)
    dungeons_dir.mkdir(parents=True, exist_ok=True)

    count = 0
    for map_id, header in sorted(headers.items()):
        if map_id in placed_maps:
            continue

        layout_id = header.get('layout', '')
        layout = layouts.get(layout_id)
        if not layout:
            continue

        w = layout['width']
        h = layout['height']
        tiles = layout.get('tiles', [])
        if not tiles:
            continue

        primary = layout.get('primaryTileset', '')
        secondary = layout.get('secondaryTileset', '')

        # Build tileset refs
        tiled_tilesets = []
        tileset_firstgids = {}
        next_gid = 1

        for c_name in [primary, secondary]:
            if not c_name or c_name == 'NULL':
                continue
            dir_name = tileset_c_name_to_dir(c_name)
            if not dir_name:
                continue
            tsj = get_tsj(dir_name)
            if not tsj:
                continue

            tileset_firstgids[c_name] = next_gid
            tiled_tilesets.append({
                'firstgid': next_gid,
                'source': f"{dir_name}.tsj",
            })
            next_gid += tsj['tilecount']

            # Also register the _top atlas for sprite overlay layer
            top_tsj = get_tsj(dir_name + '_top')
            if top_tsj:
                tileset_firstgids[c_name + '_top'] = next_gid
                tiled_tilesets.append({
                    'firstgid': next_gid,
                    'source': f"{dir_name}_top.tsj",
                })
                next_gid += top_tsj['tilecount']

        if not tiled_tilesets:
            continue

        # Build tile layers
        bottom_data = [0] * (w * h)
        top_data = [0] * (w * h)
        collision_data = [0] * (w * h)
        behavior_data = [0] * (w * h)

        for idx, tile in enumerate(tiles):
            metatile_id = tile['metatileId']
            coll = tile['collision']

            # FireRed: NUM_TILES_IN_PRIMARY=640
            if metatile_id < 640:
                ts_name = primary
                local_id = metatile_id
            else:
                ts_name = secondary
                local_id = metatile_id - 640

            if ts_name in tileset_firstgids:
                bottom_data[idx] = tileset_firstgids[ts_name] + local_id

                # Top layer: metatiles with layerType=0 (NORMAL) or 2 (SPLIT)
                # have their top tiles rendered OVER sprites.
                # layerType=1 (COVERED) means everything renders BEHIND sprites.
                top_key = ts_name + '_top'
                if top_key in tileset_firstgids:
                    dir_name = tileset_c_name_to_dir(ts_name) if ts_name else None
                    if dir_name:
                        attrs = get_collision(dir_name)
                        if attrs and local_id < len(attrs):
                            lt = attrs[local_id].get('layerType', 0)
                            if lt == 0 or lt == 2:  # NORMAL or SPLIT
                                top_data[idx] = tileset_firstgids[top_key] + local_id

            # Behavior
            dir_name_b = tileset_c_name_to_dir(ts_name) if ts_name else None
            if dir_name_b:
                attrs_b = get_collision(dir_name_b)
                if attrs_b and local_id < len(attrs_b):
                    behavior_data[idx] = attrs_b[local_id]['behavior']

            # Collision
            is_blocked = coll != 0
            if not is_blocked:
                dir_name = tileset_c_name_to_dir(ts_name) if ts_name else None
                if dir_name:
                    attrs = get_collision(dir_name)
                    if attrs and local_id < len(attrs):
                        is_blocked = not attrs[local_id]['passable']
            collision_data[idx] = 1 if is_blocked else 0

        # Build warp objects
        map_warps = warps.get(map_id, [])
        warp_objects = []
        for i, warp in enumerate(map_warps):
            dest_warp_id = warp.get('destWarpId', 0)
            if isinstance(dest_warp_id, str):
                try:
                    dest_warp_id = int(dest_warp_id)
                except ValueError:
                    dest_warp_id = 0

            warp_objects.append({
                'id': i + 1,
                'name': warp.get('destMap', ''),
                'type': 'warp',
                'x': warp['x'] * 16,
                'y': warp['y'] * 16,
                'width': 16,
                'height': 16,
                'properties': [
                    {'name': 'destMap', 'type': 'string', 'value': warp.get('destMap', '')},
                    {'name': 'destWarpId', 'type': 'int', 'value': dest_warp_id},
                ],
            })

        # Build Tiled JSON
        tiled_map = {
            'width': w,
            'height': h,
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
                    'width': w,
                    'height': h,
                    'data': bottom_data,
                    'visible': True,
                    'opacity': 1,
                    'x': 0,
                    'y': 0,
                },
                {
                    'name': 'top',
                    'type': 'tilelayer',
                    'width': w,
                    'height': h,
                    'data': top_data,
                    'visible': True,
                    'opacity': 1,
                    'x': 0,
                    'y': 0,
                },
                {
                    'name': 'collision',
                    'type': 'tilelayer',
                    'width': w,
                    'height': h,
                    'data': collision_data,
                    'visible': False,
                    'opacity': 1,
                    'x': 0,
                    'y': 0,
                },
                {
                    'name': 'behavior',
                    'type': 'tilelayer',
                    'width': w,
                    'height': h,
                    'data': behavior_data,
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
            ],
            'tilesets': tiled_tilesets,
            'properties': [
                {'name': 'mapId', 'type': 'string', 'value': map_id},
                {'name': 'music', 'type': 'string', 'value': header.get('music', '')},
            ],
        }

        # Determine output directory
        map_type = header.get('mapType', '')
        if map_type in DUNGEON_TYPES:
            out_dir = dungeons_dir
        else:
            out_dir = interiors_dir

        out_path = out_dir / f"{map_id}.json"
        with open(out_path, 'w') as f:
            json.dump(tiled_map, f)

        count += 1

    print(f"Done: {count} interior/dungeon maps exported")
    if count == 0:
        print("WARNING: No maps exported")


if __name__ == "__main__":
    main()
