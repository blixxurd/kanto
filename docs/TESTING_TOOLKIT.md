# Agent Testing Toolkit (Minimal)

## Principle

If the data is correct, the rendering is correct. Test data, not pixels.

---

## 4 Tools. That's It.

### Tool 1: `validate_extraction.py`

Run after extraction scripts. Checks counts and structure.

```python
def validate():
    errors = []

    # Tilesets: atlas exists, dimensions divisible by 16, TSJ matches
    for tsj_file in Path('public/tilesets').glob('*.tsj'):
        tsj = json.load(open(tsj_file))
        png = tsj_file.with_suffix('.png')
        if not png.exists():
            errors.append(f"Missing atlas: {png}")
            continue
        img = Image.open(png)
        if img.width % 16 or img.height % 16:
            errors.append(f"{png.name}: dimensions {img.width}x{img.height} not divisible by 16")
        expected = (img.width // 16) * (img.height // 16)
        if tsj.get('tilecount', 0) != expected:
            errors.append(f"{tsj_file.name}: tilecount {tsj['tilecount']} != atlas capacity {expected}")

    # Layouts: tile count == width * height, IDs in range
    for layout_file in Path('intermediate/layouts').glob('*.json'):
        layout = json.load(open(layout_file))
        w, h = layout['width'], layout['height']
        if len(layout['tiles']) != w * h:
            errors.append(f"{layout['id']}: {len(layout['tiles'])} tiles != {w}x{h}")
        for t in layout['tiles']:
            if not (0 <= t['metatileId'] <= 1023):
                errors.append(f"{layout['id']}: metatile ID {t['metatileId']} out of range")
                break

    # Connections: reciprocal (A→NORTH→B implies B→SOUTH→A)
    headers = json.load(open('intermediate/map_headers.json'))
    opposites = {'NORTH': 'SOUTH', 'SOUTH': 'NORTH', 'EAST': 'WEST', 'WEST': 'EAST'}
    for map_id, h in headers.items():
        for conn in h.get('connections', []):
            target = conn['map']
            if target not in headers:
                errors.append(f"{map_id}: connects to nonexistent {target}")
                continue
            recip = [c for c in headers[target].get('connections', [])
                     if c['map'] == map_id and c['direction'] == opposites[conn['direction']]]
            if not recip:
                errors.append(f"{map_id}→{conn['direction']}→{target}: no reciprocal")

    # Warps: positions in bounds, destinations exist
    warps = json.load(open('intermediate/warps.json'))
    layouts = {json.load(open(f))['id']: json.load(open(f))
               for f in Path('intermediate/layouts').glob('*.json')}
    for map_id, map_warps in warps.items():
        if map_id not in layouts:
            continue
        w, h = layouts[map_id]['width'], layouts[map_id]['height']
        for i, warp in enumerate(map_warps):
            if not (0 <= warp['x'] < w and 0 <= warp['y'] < h):
                errors.append(f"{map_id} warp {i}: position ({warp['x']},{warp['y']}) out of bounds")

    # Player sprite exists
    if not Path('public/sprites/player_male.png').exists():
        errors.append("Missing player sprite")
    if not Path('public/sprites/player.json').exists():
        errors.append("Missing player animation data")

    print(f"{'PASS' if not errors else 'FAIL'}: {len(errors)} errors")
    for e in errors[:30]:
        print(f"  - {e}")
    return len(errors) == 0
```

---

### Tool 2: `validate_stitch.py`

Run after stitcher. Checks the overworld is structurally sound.

```python
def validate():
    errors = []

    overworld = json.load(open('public/maps/overworld.json'))
    placement = json.load(open('public/data/overworld_placement.json'))
    zones = json.load(open('public/data/overworld_zones.json'))
    warps = json.load(open('public/data/warp_table.json'))

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
            break  # only report first overlap per map pair

    # Every placed map has tile data (not all zeros)
    bottom = overworld['layers'][0]['data']
    for map_id, pos in placement.items():
        has_data = False
        for y in range(pos['y'], pos['y'] + pos['h']):
            for x in range(pos['x'], pos['x'] + pos['w']):
                if bottom[y * ow_w + x] != 0:
                    has_data = True
                    break
            if has_data:
                break
        if not has_data:
            errors.append(f"{map_id}: all zeros in overworld (no tile data)")

    # Every placed map has a zone
    zone_ids = {z['id'] for z in zones['zones']}
    for map_id in placement:
        if map_id not in zone_ids:
            errors.append(f"{map_id}: no zone defined")

    # Every warp destination file exists
    for w in warps['overworldWarps']:
        dest = w['destMap']
        if not (Path(f"public/maps/interiors/{dest}.json").exists() or
                Path(f"public/maps/dungeons/{dest}.json").exists()):
            errors.append(f"Warp to {dest}: file not found")

    # Every warp is within overworld bounds
    for w in warps['overworldWarps']:
        if not (0 <= w['overworldX'] < ow_w and 0 <= w['overworldY'] < ow_h):
            errors.append(f"Warp at ({w['overworldX']},{w['overworldY']}): outside overworld")

    # Tileset files exist
    for ts in overworld['tilesets']:
        if not Path(f"public/tilesets/{ts['source']}").exists():
            errors.append(f"Tileset {ts['source']}: file not found")

    print(f"{'PASS' if not errors else 'FAIL'}: {len(errors)} errors")
    for e in errors[:30]:
        print(f"  - {e}")
    return len(errors) == 0
```

---

### Tool 3: `validate_traversal.py`

Flood fill from Pallet Town. Check every town is reachable.

```python
from collections import deque

def validate():
    errors = []

    overworld = json.load(open('public/maps/overworld.json'))
    zones = json.load(open('public/data/overworld_zones.json'))
    warps = json.load(open('public/data/warp_table.json'))

    ow_w, ow_h = overworld['width'], overworld['height']

    # Build collision grid
    collision_layer = next(l for l in overworld['layers'] if l['name'] == 'collision')
    collision = collision_layer['data']

    # Start from Pallet Town center
    pallet = next(z for z in zones['zones'] if z['id'] == 'MAP_PALLET_TOWN')
    b = pallet['bounds']
    start_x, start_y = b['x'] + b['width'] // 2, b['y'] + b['height'] // 2

    # Nudge to nearest passable tile
    if collision[start_y * ow_w + start_x] != 0:
        found = False
        for r in range(1, 20):
            for dx in range(-r, r+1):
                for dy in range(-r, r+1):
                    nx, ny = start_x + dx, start_y + dy
                    if 0 <= nx < ow_w and 0 <= ny < ow_h and collision[ny * ow_w + nx] == 0:
                        start_x, start_y = nx, ny
                        found = True
                        break
                if found: break
            if found: break

    # Flood fill
    reachable = set()
    queue = deque([(start_x, start_y)])
    reachable.add((start_x, start_y))

    while queue:
        x, y = queue.popleft()
        for dx, dy in [(0,-1),(0,1),(-1,0),(1,0)]:
            nx, ny = x+dx, y+dy
            if (nx, ny) in reachable:
                continue
            if not (0 <= nx < ow_w and 0 <= ny < ow_h):
                continue
            if collision[ny * ow_w + nx] == 0:
                reachable.add((nx, ny))
                queue.append((nx, ny))

    # Add warp-reachable tiles (walk through building, come out other side)
    warp_positions = {(w['overworldX'], w['overworldY']): w for w in warps['overworldWarps']}
    for pos, warp in warp_positions.items():
        if pos in reachable:
            returns = warps.get('interiorReturns', {}).get(warp['destMap'], [])
            for ret in returns:
                ret_pos = (ret['returnX'], ret['returnY'])
                if ret_pos not in reachable and collision[ret_pos[1] * ow_w + ret_pos[0]] == 0:
                    # BFS from return point
                    sub_queue = deque([ret_pos])
                    reachable.add(ret_pos)
                    while sub_queue:
                        x, y = sub_queue.popleft()
                        for dx, dy in [(0,-1),(0,1),(-1,0),(1,0)]:
                            nx, ny = x+dx, y+dy
                            if (nx,ny) not in reachable and 0<=nx<ow_w and 0<=ny<ow_h:
                                if collision[ny*ow_w+nx] == 0:
                                    reachable.add((nx,ny))
                                    sub_queue.append((nx,ny))

    # Check each town/city zone
    for zone in zones['zones']:
        if zone['mapType'] not in ('MAP_TYPE_TOWN', 'MAP_TYPE_CITY'):
            continue
        b = zone['bounds']
        zone_passable = 0
        zone_reached = 0
        for y in range(b['y'], b['y'] + b['height']):
            for x in range(b['x'], b['x'] + b['width']):
                if collision[y * ow_w + x] == 0:
                    zone_passable += 1
                    if (x, y) in reachable:
                        zone_reached += 1
        if zone_passable == 0:
            errors.append(f"{zone['id']}: no passable tiles")
        elif zone_reached == 0:
            errors.append(f"UNREACHABLE: {zone['id']}")
        elif zone_reached < zone_passable * 0.3:
            errors.append(f"MOSTLY BLOCKED: {zone['id']} ({zone_reached}/{zone_passable} tiles reachable)")

    total_passable = sum(1 for v in collision if v == 0)
    pct = len(reachable) / total_passable if total_passable else 0
    print(f"Reachable: {len(reachable)}/{total_passable} passable tiles ({pct:.0%})")
    print(f"{'PASS' if not errors else 'FAIL'}: {len(errors)} errors")
    for e in errors:
        print(f"  - {e}")
    return len(errors) == 0
```

---

### Tool 4: `validate_warps.py`

Every door you can walk into, you can walk out of.

```python
def validate():
    errors = []
    warps = json.load(open('public/data/warp_table.json'))

    # Every overworld warp destination has at least one return point
    for w in warps['overworldWarps']:
        dest = w['destMap']
        returns = warps.get('interiorReturns', {}).get(dest, [])
        if not returns:
            errors.append(f"TRAP: warp to {dest} has no exit back to overworld")

    # Every interior with return points has an overworld warp leading to it
    destinations = {w['destMap'] for w in warps['overworldWarps']}
    for interior_id, returns in warps.get('interiorReturns', {}).items():
        if interior_id not in destinations:
            errors.append(f"ORPHAN: {interior_id} has exits but no overworld entrance")

    # Interior map files exist for all warp destinations
    for dest in destinations:
        if not (Path(f"public/maps/interiors/{dest}.json").exists() or
                Path(f"public/maps/dungeons/{dest}.json").exists()):
            errors.append(f"MISSING: {dest}.json not found")

    # Interior maps are valid Tiled JSON
    for dest in destinations:
        for dir in ['interiors', 'dungeons']:
            p = Path(f"public/maps/{dir}/{dest}.json")
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
```

---

## Runner: `scripts/tests/run_all.py`

```python
#!/usr/bin/env python3
import sys
from validate_extraction import validate as v1
from validate_stitch import validate as v2
from validate_traversal import validate as v3
from validate_warps import validate as v4

print("=" * 50)
print("KANTO — VERIFICATION SUITE")
print("=" * 50)

results = {}

print("\n[1/4] Extraction integrity...")
results['extraction'] = v1()

print("\n[2/4] Overworld stitch...")
results['stitch'] = v2()

print("\n[3/4] Traversability...")
results['traversal'] = v3()

print("\n[4/4] Warp consistency...")
results['warps'] = v4()

print("\n" + "=" * 50)
passed = all(results.values())
print(f"OVERALL: {'PASS' if passed else 'FAIL'}")
for name, ok in results.items():
    print(f"  {'✓' if ok else '✗'} {name}")
print("=" * 50)

sys.exit(0 if passed else 1)
```

---

## When to Run

| After... | Run... |
|----------|--------|
| Any extraction script | `validate_extraction.py` |
| Stitcher | `validate_stitch.py` + `validate_traversal.py` + `validate_warps.py` |
| Any change | `run_all.py` |

That's it. Four tools. Zero pixel comparison. Pure data and logic checks. If all four validators pass, the map is structurally correct, fully traversable, and all doors work.
