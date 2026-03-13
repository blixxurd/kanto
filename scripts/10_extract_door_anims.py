#!/usr/bin/env python3
"""10_extract_door_anims — Extract door animation spritesheets from decomp.

Reads door animation PNGs from decomp/graphics/door_anims/, slices them into
frame spritesheets (horizontal strip), and outputs a JSON manifest mapping
metatile IDs to door animation data.

Each door PNG is 16 pixels wide with 3 frames stacked vertically:
  - Small doors (1×1): 16×48 → 3 frames of 16×16
  - Large doors (1×2): 16×96 → 3 frames of 16×32
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from config import DECOMP_DIR, PUBLIC_DIR

DOOR_ANIMS_DIR = DECOMP_DIR / 'graphics' / 'door_anims'
OUTPUT_DIR = PUBLIC_DIR / 'sprites' / 'doors'

# Door graphics table from field_door.c
# Format: (metatile_id_hex, sound, size, png_name, tileset_name)
# sound: 0 = normal (creak), 1 = sliding
# size: 0 = 1x1 (16×16), 1 = 1x2 (16×32)
DOOR_TABLE = [
    (0x03D, 0, 0, 'general',                   'General'),
    (0x062, 1, 0, 'sliding_single',             'General'),
    (0x15B, 1, 0, 'sliding_double',             'General'),
    (0x2A3, 0, 0, 'pallet',                     'PalletTown'),
    (0x2AC, 0, 0, 'oaks_lab',                   'PalletTown'),
    (0x299, 0, 0, 'viridian',                   'ViridianCity'),
    (0x2CE, 0, 0, 'pewter',                     'PewterCity'),
    (0x284, 0, 0, 'saffron',                    'SaffronCity'),
    (0x2BC, 1, 0, 'silph_co',                   'SaffronCity'),
    (0x298, 0, 0, 'cerulean',                   'CeruleanCity'),
    (0x2A2, 0, 0, 'lavender',                   'LavenderTown'),
    (0x29E, 0, 0, 'vermilion',                  'VermilionCity'),
    (0x2E1, 0, 0, 'pokemon_fan_club',           'VermilionCity'),
    (0x294, 1, 0, 'dept_store',                 'CeladonCity'),
    (0x2BF, 0, 0, 'fuchsia',                    'FuchsiaCity'),
    (0x2D2, 1, 0, 'safari_zone',               'FuchsiaCity'),
    (0x2AD, 0, 0, 'cinnabar_lab',              'CinnabarIsland'),
    (0x297, 0, 0, 'sevii_123',                 'SeviiIslands123'),
    (0x29B, 1, 0, 'joyful_game_corner',        'SeviiIslands123'),
    (0x2EB, 0, 0, 'one_island_poke_center',    'SeviiIslands123'),
    (0x29A, 0, 0, 'sevii_45',                  'SeviiIslands45'),
    (0x2B9, 0, 0, 'four_island_day_care',      'SeviiIslands45'),
    (0x2AF, 0, 0, 'rocket_warehouse',          'SeviiIslands45'),
    (0x30C, 0, 0, 'sevii_67',                  'SeviiIslands67'),
    (0x28D, 1, 1, 'dept_store_elevator',       'DepartmentStore'),
    (0x2DE, 1, 1, 'cable_club',               'PokemonCenter'),
    (0x2AB, 1, 1, 'hideout_elevator',         'SilphCo'),
    (0x281, 0, 1, 'ss_anne',                   'SSAnne'),
    (0x2E2, 1, 1, 'silph_co_elevator',        'SilphCo'),
    (0x296, 1, 1, 'teleporter',               'SeaCottage'),
    (0x2C3, 1, 1, 'trainer_tower_lobby_elevator', 'TrainerTower'),
    (0x356, 1, 1, 'trainer_tower_roof_elevator',  'TrainerTower'),
]


def main():
    print("Extracting door animations...")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    manifest = {}
    count = 0

    for metatile_id, sound, size, png_name, tileset_name in DOOR_TABLE:
        src = DOOR_ANIMS_DIR / f'{png_name}.png'
        if not src.exists():
            print(f"  WARN: {png_name}.png not found")
            continue

        img = Image.open(src).convert('RGBA')
        w, h = img.size

        # Determine frame dimensions
        if size == 0:  # 1×1 small door
            frame_h = 16
        else:          # 1×2 large door
            frame_h = 32

        num_frames = h // frame_h
        if num_frames < 3:
            print(f"  WARN: {png_name}.png only has {num_frames} frames (expected 3)")
            continue

        # Make index 0 transparent (it's either black #000000 or magenta #ff00ff)
        pixels = img.load()
        for py in range(h):
            for px in range(w):
                r, g, b, a = pixels[px, py]
                # Transparent if black (0,0,0) or magenta (255,0,255)
                if (r == 0 and g == 0 and b == 0) or (r == 255 and g == 0 and b == 255):
                    pixels[px, py] = (0, 0, 0, 0)

        # Create horizontal spritesheet (3 frames side by side)
        sheet = Image.new('RGBA', (w * 3, frame_h), (0, 0, 0, 0))
        for i in range(3):
            frame = img.crop((0, i * frame_h, w, (i + 1) * frame_h))
            sheet.paste(frame, (i * w, 0))

        out_path = OUTPUT_DIR / f'{png_name}.png'
        sheet.save(out_path)

        # Key by tileset/localId since metatile IDs are only unique within
        # a single map's tileset pair. Primary metatiles (< 640) use local_id
        # directly; secondary metatiles (>= 640) subtract 640 to get local_id.
        NUM_METATILES_IN_PRIMARY = 640
        if metatile_id < NUM_METATILES_IN_PRIMARY:
            local_id = metatile_id
        else:
            local_id = metatile_id - NUM_METATILES_IN_PRIMARY
        # Convert tileset name to lowercase snake_case matching .tsj filenames
        tsj_name = tileset_name[0].lower() + tileset_name[1:]
        # CamelCase → snake_case
        tsj_name = re.sub(r'(?<!^)(?=[A-Z])', '_', tsj_name).lower()
        manifest_key = f"{tsj_name}/{local_id}"

        manifest[manifest_key] = {
            'name': png_name,
            'image': f'doors/{png_name}.png',
            'frameWidth': w,
            'frameHeight': frame_h,
            'frameCount': 3,
            'frameDuration': 4,  # 4 ticks per frame (from GBA source)
            'sound': 'normal' if sound == 0 else 'sliding',
            'size': '1x1' if size == 0 else '1x2',
            'tileset': tileset_name,
        }
        count += 1

    # Write manifest
    manifest_path = PUBLIC_DIR / 'data' / 'door_anims.json'
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)

    print(f"Done: {count} door animations extracted")
    print(f"  Manifest: {manifest_path}")


if __name__ == '__main__':
    main()
