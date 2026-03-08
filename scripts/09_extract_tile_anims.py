#!/usr/bin/env python3
"""09_extract_tile_anims — Extract animated tile frames and build animation atlases.

The GBA animates tiles by DMA-copying replacement 8×8 tile patterns into VRAM.
This script pre-renders all affected metatiles for each animation frame, producing
animation atlas PNGs and a JSON manifest for the runtime TileAnimator.

Source: decomp/src/tileset_anims.c
"""
import json
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from config import DECOMP_DIR, PUBLIC_DIR

try:
    from PIL import Image
    import numpy as np
except ImportError:
    print("ERROR: Pillow and numpy required.")
    sys.exit(1)

# Animation definitions extracted from tileset_anims.c
# Each entry: (anim_dir, tile_offset, num_tiles, num_frames, interval, timer_offset, frame_order)
# frame_order=None means sequential 0..N-1; otherwise explicit list
GENERAL_ANIMS = [
    {
        'name': 'water_current',
        'dir': 'water_current_landwatersedge',
        'tileOffset': 416,
        'numTiles': 48,
        'interval': 16,
        'timerOffset': 1,
    },
    {
        'name': 'sand_water_edge',
        'dir': 'sandwatersedge',
        'tileOffset': 464,
        'numTiles': 18,
        'interval': 8,
        'timerOffset': 0,
    },
    {
        'name': 'flower',
        'dir': 'flower',
        'tileOffset': 508,
        'numTiles': 4,
        'interval': 16,
        'timerOffset': 2,
    },
]

SECONDARY_ANIMS = {
    'celadon_city': [{
        'name': 'fountain',
        'dir': 'fountain',
        'tileOffset': 744,
        'numTiles': 8,
        'interval': 12,
        'timerOffset': 0,
    }],
    'celadon_gym': [{
        'name': 'flowers',
        'dir': 'flowers',
        'tileOffset': 739,
        'numTiles': 4,
        'interval': 16,
        'timerOffset': 0,
        'frameOrder': [0, 1, 2, 1],
    }],
    'mt_ember': [{
        'name': 'steam',
        'dir': 'steam',
        'tileOffset': 896,
        'numTiles': 8,
        'interval': 16,
        'timerOffset': 0,
    }],
    'silph_co': [{
        'name': 'fountain',
        'dir': 'fountain',
        'tileOffset': 976,
        'numTiles': 8,
        'interval': 10,
        'timerOffset': 0,
    }],
    'vermilion_gym': [{
        'name': 'motorized_door',
        'dir': 'motorizeddoor',
        'tileOffset': 880,
        'numTiles': 7,
        'interval': 2,
        'timerOffset': 0,
    }],
}

NUM_TILES_IN_PRIMARY = 640
NUM_PALS_IN_PRIMARY = 7
METATILES_PER_ROW = 16


def parse_jasc_pal(filepath):
    lines = filepath.read_text().strip().splitlines()
    count = int(lines[2])
    colors = []
    for i in range(count):
        parts = lines[3 + i].split()
        r, g, b = int(parts[0]), int(parts[1]), int(parts[2])
        a = 0 if i == 0 else 255
        colors.append((r, g, b, a))
    while len(colors) < 16:
        colors.append((0, 0, 0, 0))
    return colors


def load_palettes(palette_dir):
    palettes = []
    for i in range(16):
        pal_file = palette_dir / f"{i:02d}.pal"
        if pal_file.exists():
            palettes.append(parse_jasc_pal(pal_file))
        else:
            palettes.append([(0, 0, 0, 0)] * 16)
    return palettes


def load_indexed_tiles(tiles_png):
    img = Image.open(tiles_png)
    if img.mode != 'P':
        raise ValueError(f"{tiles_png}: expected indexed (P) mode, got {img.mode}")
    pixels = np.array(img)
    tiles_per_row = img.width // 8
    tiles_per_col = img.height // 8
    total = tiles_per_row * tiles_per_col
    tiles = np.zeros((total, 8, 8), dtype=np.uint8)
    for ty in range(tiles_per_col):
        for tx in range(tiles_per_row):
            idx = ty * tiles_per_row + tx
            tiles[idx] = pixels[ty * 8:(ty + 1) * 8, tx * 8:(tx + 1) * 8]
    return tiles


def parse_metatiles_bin(data):
    count = len(data) // 16
    metatiles = []
    for i in range(count):
        offset = i * 16
        refs = []
        for j in range(8):
            raw = struct.unpack_from('<H', data, offset + j * 2)[0]
            refs.append({
                'tileIndex': raw & 0x3FF,
                'flipX': bool(raw & 0x400),
                'flipY': bool(raw & 0x800),
                'paletteIndex': (raw >> 12) & 0xF,
            })
        metatiles.append({
            'bottomLayer': refs[0:4],
            'topLayer': refs[4:8],
        })
    return metatiles


def render_8x8_tile(indexed_tiles, tile_ref, palettes):
    tile_idx = tile_ref['tileIndex']
    pal_idx = tile_ref['paletteIndex']
    flip_x = tile_ref['flipX']
    flip_y = tile_ref['flipY']
    if tile_idx >= len(indexed_tiles):
        return np.zeros((8, 8, 4), dtype=np.uint8)
    indices = indexed_tiles[tile_idx].copy()
    if flip_x:
        indices = np.fliplr(indices)
    if flip_y:
        indices = np.flipud(indices)
    palette = palettes[pal_idx] if pal_idx < len(palettes) else [(0, 0, 0, 0)] * 16
    rgba = np.zeros((8, 8, 4), dtype=np.uint8)
    for y in range(8):
        for x in range(8):
            ci = indices[y, x] & 0xF
            rgba[y, x] = palette[ci]
    return rgba


def render_metatile(indexed_tiles, metatile, palettes):
    result = np.zeros((16, 16, 4), dtype=np.uint8)
    for layer_key in ['bottomLayer', 'topLayer']:
        refs = metatile[layer_key]
        positions = [(0, 0), (8, 0), (0, 8), (8, 8)]
        for ref, (px, py) in zip(refs, positions):
            tile_rgba = render_8x8_tile(indexed_tiles, ref, palettes)
            for y in range(8):
                for x in range(8):
                    if tile_rgba[y, x, 3] > 0:
                        result[py + y, px + x] = tile_rgba[y, x]
    return result


def render_metatile_top_only(indexed_tiles, metatile, palettes):
    result = np.zeros((16, 16, 4), dtype=np.uint8)
    refs = metatile['topLayer']
    positions = [(0, 0), (8, 0), (0, 8), (8, 8)]
    for ref, (px, py) in zip(refs, positions):
        tile_rgba = render_8x8_tile(indexed_tiles, ref, palettes)
        for y in range(8):
            for x in range(8):
                if tile_rgba[y, x, 3] > 0:
                    result[py + y, px + x] = tile_rgba[y, x]
    return result


def find_affected_metatiles(metatiles, tile_range):
    """Find all metatile indices that reference any tile in the given range."""
    affected = []
    for i, mt in enumerate(metatiles):
        all_refs = mt['bottomLayer'] + mt['topLayer']
        if any(r['tileIndex'] in tile_range for r in all_refs):
            affected.append(i)
    return affected


def load_anim_frame_tiles(frame_png):
    """Load an animation frame PNG as indexed 8×8 tiles."""
    return load_indexed_tiles(frame_png)


def build_combined_tiles(primary_tiles, secondary_tiles=None):
    if len(primary_tiles) < NUM_TILES_IN_PRIMARY:
        padding = np.zeros((NUM_TILES_IN_PRIMARY - len(primary_tiles), 8, 8), dtype=np.uint8)
        primary_padded = np.concatenate([primary_tiles, padding])
    else:
        primary_padded = primary_tiles[:NUM_TILES_IN_PRIMARY]
    if secondary_tiles is not None and len(secondary_tiles) > 0:
        return np.concatenate([primary_padded, secondary_tiles])
    return primary_padded


def process_animations(tileset_name, tileset_dir, anim_defs, metatiles, base_tiles, palettes,
                       output_dir, is_secondary=False):
    """Process all animations for a tileset, producing atlas PNGs and manifest data."""
    anim_base = tileset_dir / 'anim'
    if not anim_base.exists():
        return None

    tileset_result = {
        'animations': [],
    }

    for anim_def in anim_defs:
        anim_dir = anim_base / anim_def['dir']
        if not anim_dir.exists():
            print(f"  SKIP {tileset_name}/{anim_def['name']}: no anim dir")
            continue

        frame_pngs = sorted(anim_dir.glob('*.png'))
        if not frame_pngs:
            continue

        tile_offset = anim_def['tileOffset']
        num_tiles = anim_def['numTiles']
        tile_range = set(range(tile_offset, tile_offset + num_tiles))
        frame_order = anim_def.get('frameOrder')
        num_logical_frames = len(frame_order) if frame_order else len(frame_pngs)

        # Find affected metatiles
        affected = find_affected_metatiles(metatiles, tile_range)
        if not affected:
            print(f"  SKIP {tileset_name}/{anim_def['name']}: no affected metatiles")
            continue

        # Render each frame
        cols = len(affected)
        rows = num_logical_frames
        atlas = np.zeros((rows * 16, cols * 16, 4), dtype=np.uint8)
        atlas_top = np.zeros((rows * 16, cols * 16, 4), dtype=np.uint8)

        for frame_idx in range(num_logical_frames):
            png_idx = frame_order[frame_idx] if frame_order else frame_idx
            frame_tiles = load_anim_frame_tiles(frame_pngs[png_idx])

            # Substitute animated tiles into the base tile array
            modified_tiles = base_tiles.copy()
            for t in range(min(num_tiles, len(frame_tiles))):
                target_idx = tile_offset + t
                if target_idx < len(modified_tiles):
                    modified_tiles[target_idx] = frame_tiles[t]

            # Render affected metatiles with this frame's tile data
            for col_idx, mt_id in enumerate(affected):
                rendered = render_metatile(modified_tiles, metatiles[mt_id], palettes)
                atlas[frame_idx * 16:(frame_idx + 1) * 16,
                      col_idx * 16:(col_idx + 1) * 16] = rendered

                rendered_top = render_metatile_top_only(modified_tiles, metatiles[mt_id], palettes)
                atlas_top[frame_idx * 16:(frame_idx + 1) * 16,
                          col_idx * 16:(col_idx + 1) * 16] = rendered_top

        # Save atlas PNGs
        anim_name = anim_def['name']
        atlas_filename = f"{tileset_name}_anim_{anim_name}.png"
        atlas_top_filename = f"{tileset_name}_anim_{anim_name}_top.png"

        Image.fromarray(atlas, 'RGBA').save(output_dir / atlas_filename)
        Image.fromarray(atlas_top, 'RGBA').save(output_dir / atlas_top_filename)

        tileset_result['animations'].append({
            'name': anim_name,
            'frameCount': num_logical_frames,
            'interval': anim_def['interval'],
            'timerOffset': anim_def['timerOffset'],
            'metatileIds': affected,
            'atlasImage': atlas_filename,
            'atlasTopImage': atlas_top_filename,
            'atlasColumns': cols,
        })

        print(f"  {tileset_name}/{anim_name}: {len(affected)} metatiles × "
              f"{num_logical_frames} frames → {atlas_filename}")

    return tileset_result if tileset_result['animations'] else None


def main():
    print("Extracting tile animations...")

    tilesets_dir = DECOMP_DIR / 'data' / 'tilesets'
    output_dir = PUBLIC_DIR / 'tilesets'
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load General (primary) tileset
    general_dir = tilesets_dir / 'primary' / 'general'
    general_tiles = load_indexed_tiles(general_dir / 'tiles.png')
    general_palettes = load_palettes(general_dir / 'palettes')
    general_metatiles = parse_metatiles_bin((general_dir / 'metatiles.bin').read_bytes())

    # For primary tileset, the combined tiles = just the primary tiles
    combined_primary = build_combined_tiles(general_tiles)

    manifest = {'tilesets': {}}

    # Process General (primary) animations
    result = process_animations(
        'general', general_dir, GENERAL_ANIMS,
        general_metatiles, combined_primary, general_palettes,
        output_dir
    )
    if result:
        manifest['tilesets']['general'] = result

    # Process secondary tileset animations
    # Secondary tilesets need their own tiles + primary tiles combined
    for sec_name, anim_defs in SECONDARY_ANIMS.items():
        sec_dir = tilesets_dir / 'secondary' / sec_name
        if not sec_dir.exists():
            continue

        sec_tiles_png = sec_dir / 'tiles.png'
        sec_metatiles_bin = sec_dir / 'metatiles.bin'
        if not sec_tiles_png.exists() or not sec_metatiles_bin.exists():
            continue

        sec_tiles = load_indexed_tiles(sec_tiles_png)
        sec_palettes = load_palettes(sec_dir / 'palettes')

        # Merge palettes: primary for slots 0-6, secondary for 7+
        merged_palettes = list(sec_palettes)
        for i in range(16):
            if all(c == (0, 0, 0, 0) for c in merged_palettes[i]):
                merged_palettes[i] = general_palettes[i]

        combined = build_combined_tiles(general_tiles, sec_tiles)
        sec_metatiles = parse_metatiles_bin(sec_metatiles_bin.read_bytes())

        result = process_animations(
            sec_name, sec_dir, anim_defs,
            sec_metatiles, combined, merged_palettes,
            output_dir, is_secondary=True
        )
        if result:
            manifest['tilesets'][sec_name] = result

    # Save manifest
    manifest_path = PUBLIC_DIR / 'data' / 'tile_anims.json'
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)

    total_anims = sum(len(t['animations']) for t in manifest['tilesets'].values())
    print(f"\nDone: {total_anims} animations extracted")


if __name__ == "__main__":
    main()
