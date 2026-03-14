#!/usr/bin/env python3
"""12_extract_npc_sprites — Extract ALL NPC/object/Pokemon overworld sprites.

Parses the pret/pokefirered decomp C headers to find every object event sprite,
applies the correct JASC palette, builds game-ready spritesheets (with direction
rows for animated sprites), and writes a JSON manifest.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from config import DECOMP_DIR, PUBLIC_DIR

try:
    from PIL import Image
    import numpy as np
except ImportError:
    print("ERROR: Pillow and numpy required")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Palette helpers (from 08_extract_sprites.py)
# ---------------------------------------------------------------------------

def parse_jasc_pal(filepath: Path) -> list[tuple[int, int, int, int]]:
    lines = filepath.read_text().strip().splitlines()
    colors = []
    count = int(lines[2])
    for i in range(count):
        parts = lines[3 + i].split()
        r, g, b = int(parts[0]), int(parts[1]), int(parts[2])
        a = 0 if i == 0 else 255
        colors.append((r, g, b, a))
    while len(colors) < 16:
        colors.append((0, 0, 0, 0))
    return colors


def apply_palette_to_indexed(img: Image.Image, palette: list[tuple[int, int, int, int]]) -> Image.Image:
    pixels = np.array(img)
    rgba = np.zeros((*pixels.shape, 4), dtype=np.uint8)
    for y in range(pixels.shape[0]):
        for x in range(pixels.shape[1]):
            idx = pixels[y, x] & 0xF
            if idx < len(palette):
                rgba[y, x] = palette[idx]
    return Image.fromarray(rgba, 'RGBA')


# ---------------------------------------------------------------------------
# Palette tag -> .pal file mapping
# ---------------------------------------------------------------------------

PAL_TAG_TO_FILE = {
    'OBJ_EVENT_PAL_TAG_NPC_BLUE':     'npc_blue.pal',
    'OBJ_EVENT_PAL_TAG_NPC_PINK':     'npc_pink.pal',
    'OBJ_EVENT_PAL_TAG_NPC_GREEN':    'npc_green.pal',
    'OBJ_EVENT_PAL_TAG_NPC_WHITE':    'npc_white.pal',
    'OBJ_EVENT_PAL_TAG_PLAYER_RED':   'player.pal',
    'OBJ_EVENT_PAL_TAG_PLAYER_GREEN': 'player.pal',
    'OBJ_EVENT_PAL_TAG_METEORITE':    'meteorite.pal',
    'OBJ_EVENT_PAL_TAG_SEAGALLOP':    'seagallop.pal',
    'OBJ_EVENT_PAL_TAG_SS_ANNE':      'ss_anne.pal',
}

PAL_TAG_TO_NAME = {
    'OBJ_EVENT_PAL_TAG_NPC_BLUE':     'npc_blue',
    'OBJ_EVENT_PAL_TAG_NPC_PINK':     'npc_pink',
    'OBJ_EVENT_PAL_TAG_NPC_GREEN':    'npc_green',
    'OBJ_EVENT_PAL_TAG_NPC_WHITE':    'npc_white',
    'OBJ_EVENT_PAL_TAG_PLAYER_RED':   'player',
    'OBJ_EVENT_PAL_TAG_PLAYER_GREEN': 'player',
    'OBJ_EVENT_PAL_TAG_METEORITE':    'meteorite',
    'OBJ_EVENT_PAL_TAG_SEAGALLOP':    'seagallop',
    'OBJ_EVENT_PAL_TAG_SS_ANNE':      'ss_anne',
}

# Player/rival variants to skip
SKIP_PREFIXES = [
    'RedNormal', 'RedBike', 'RedSurf', 'RedFieldMove', 'RedFish',
    'RedVSSeeker', 'RedVSSeekerBike', 'RedItem',
    'GreenNormal', 'GreenBike', 'GreenSurf', 'GreenFieldMove', 'GreenFish',
    'GreenVSSeeker', 'GreenVSSeekerBike', 'GreenItem',
    'RSBrendan', 'RSMay',
]


# ---------------------------------------------------------------------------
# Step 1: Parse graphics info structs
# ---------------------------------------------------------------------------

def parse_graphics_info(decomp: Path) -> dict:
    """Parse object_event_graphics_info.h to extract paletteTag, width, height, images for each struct."""
    path = decomp / 'src' / 'data' / 'object_events' / 'object_event_graphics_info.h'
    text = path.read_text()

    info = {}
    # Split by struct definition
    struct_re = re.compile(
        r'const struct ObjectEventGraphicsInfo\s+(gObjectEventGraphicsInfo_(\w+))\s*=\s*\{([^}]+)\}',
        re.DOTALL
    )
    for m in struct_re.finditer(text):
        full_name = m.group(1)
        short_name = m.group(2)
        body = m.group(3)

        pal_m = re.search(r'\.paletteTag\s*=\s*(\w+)', body)
        w_m = re.search(r'\.width\s*=\s*(\d+)', body)
        h_m = re.search(r'\.height\s*=\s*(\d+)', body)
        img_m = re.search(r'\.images\s*=\s*(\w+)', body)

        if pal_m and w_m and h_m and img_m:
            info[short_name] = {
                'paletteTag': pal_m.group(1),
                'width': int(w_m.group(1)),
                'height': int(h_m.group(1)),
                'picTable': img_m.group(1),
            }

    return info


# ---------------------------------------------------------------------------
# Step 2: Parse pic tables
# ---------------------------------------------------------------------------

def parse_pic_tables(decomp: Path) -> dict:
    """Parse object_event_pic_tables.h. Returns {table_name: [(gfx_name, tw, th, frame_idx), ...]}"""
    path = decomp / 'src' / 'data' / 'object_events' / 'object_event_pic_tables.h'
    text = path.read_text()

    tables = {}
    table_re = re.compile(
        r'static const struct SpriteFrameImage\s+(\w+)\[\]\s*=\s*\{([^}]+)\}',
        re.DOTALL
    )
    frame_re = re.compile(r'overworld_frame\(\s*(\w+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)')

    for m in table_re.finditer(text):
        tname = m.group(1)
        body = m.group(2)
        frames = []
        for fm in frame_re.finditer(body):
            frames.append((fm.group(1), int(fm.group(2)), int(fm.group(3)), int(fm.group(4))))
        tables[tname] = frames

    return tables


# ---------------------------------------------------------------------------
# Step 3: Parse graphics (INCBIN) to get PNG paths
# ---------------------------------------------------------------------------

def parse_graphics_paths(decomp: Path) -> dict:
    """Parse object_event_graphics.h. Returns {gfx_var_name: png_path_relative_to_decomp}"""
    path = decomp / 'src' / 'data' / 'object_events' / 'object_event_graphics.h'
    text = path.read_text()

    paths = {}
    incbin_re = re.compile(r'const u16\s+(\w+)\[\]\s*=\s*INCBIN_U16\("([^"]+)"\)')
    for m in incbin_re.finditer(text):
        var_name = m.group(1)
        # Only care about gObjectEventPic_ entries
        if var_name.startswith('gObjectEventPic_'):
            # Convert .4bpp path to .png
            rel_path = m.group(2).replace('.4bpp', '.png')
            paths[var_name] = rel_path

    return paths


# ---------------------------------------------------------------------------
# Step 4: Parse pointer table for enum -> struct mapping
# ---------------------------------------------------------------------------

def parse_pointer_table(decomp: Path) -> list[tuple[str, str]]:
    """Returns [(enum_name, struct_short_name), ...] from the pointer table."""
    path = decomp / 'src' / 'data' / 'object_events' / 'object_event_graphics_info_pointers.h'
    text = path.read_text()

    entries = []
    entry_re = re.compile(r'\[(\w+)\]\s*=\s*&gObjectEventGraphicsInfo_(\w+)')
    for m in entry_re.finditer(text):
        entries.append((m.group(1), m.group(2)))

    return entries


# ---------------------------------------------------------------------------
# Spritesheet builder
# ---------------------------------------------------------------------------

def enum_to_output_name(enum_name: str) -> str:
    """OBJ_EVENT_GFX_YOUNGSTER -> youngster"""
    name = enum_name.replace('OBJ_EVENT_GFX_', '').lower()
    return name


def build_spritesheet(frames: list[Image.Image], frame_w: int, frame_h: int, num_frames: int):
    """
    Build a game-ready spritesheet from source frames.

    For 9+ frame sprites (standard walk cycle):
      4 rows (down/up/left/right), 3 cols (idle/walk1/walk2)
      Right = hflipped left

    For static/1-frame sprites: just output the single frame.

    For other counts: output raw frames in a row.
    """
    if num_frames == 1:
        # Static sprite
        return frames[0], 1, 1, False

    if num_frames >= 9:
        # Standard walk cycle
        out_w = frame_w * 3
        out_h = frame_h * 4
        sheet = Image.new('RGBA', (out_w, out_h), (0, 0, 0, 0))

        # Direction mapping: (idle, walk1, walk2)
        direction_frames = [
            (0, 3, 4),  # Row 0 = down
            (1, 5, 6),  # Row 1 = up
            (2, 7, 8),  # Row 2 = left
        ]
        for row, (idle, w1, w2) in enumerate(direction_frames):
            for col, src_idx in enumerate([idle, w1, w2]):
                if src_idx < len(frames):
                    sheet.paste(frames[src_idx], (col * frame_w, row * frame_h))

        # Right = flipped left (row 3)
        for col, src_idx in enumerate([2, 7, 8]):
            if src_idx < len(frames):
                flipped = frames[src_idx].transpose(Image.FLIP_LEFT_RIGHT)
                sheet.paste(flipped, (col * frame_w, 3 * frame_h))

        return sheet, 4, 3, True

    # Oddball: just output raw frames in a row
    out_w = frame_w * num_frames
    out_h = frame_h
    sheet = Image.new('RGBA', (out_w, out_h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, (i * frame_w, 0))
    return sheet, 1, num_frames, False


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    output_dir = PUBLIC_DIR / 'sprites' / 'npcs'
    output_dir.mkdir(parents=True, exist_ok=True)
    pal_dir = DECOMP_DIR / 'graphics' / 'object_events' / 'palettes'

    print("=== NPC Sprite Extractor ===")
    print()

    # Load palettes
    palettes = {}
    for tag, filename in PAL_TAG_TO_FILE.items():
        pal_path = pal_dir / filename
        if pal_path.exists():
            palettes[tag] = parse_jasc_pal(pal_path)
        else:
            print(f"  WARNING: Palette file not found: {filename}")

    # Parse all data
    print("Parsing decomp headers...")
    gfx_info = parse_graphics_info(DECOMP_DIR)
    pic_tables = parse_pic_tables(DECOMP_DIR)
    gfx_paths = parse_graphics_paths(DECOMP_DIR)
    pointer_table = parse_pointer_table(DECOMP_DIR)

    print(f"  Found {len(gfx_info)} graphics info structs")
    print(f"  Found {len(pic_tables)} pic tables")
    print(f"  Found {len(gfx_paths)} graphics paths")
    print(f"  Found {len(pointer_table)} pointer table entries")
    print()

    manifest = {}
    extracted = 0
    skipped = 0
    failed = 0

    for enum_name, struct_name in pointer_table:
        # Skip player variants
        if struct_name in SKIP_PREFIXES:
            skipped += 1
            continue

        if struct_name not in gfx_info:
            print(f"  SKIP: No graphics info for {struct_name}")
            skipped += 1
            continue

        info = gfx_info[struct_name]
        pal_tag = info['paletteTag']
        width = info['width']
        height = info['height']
        pic_table_name = info['picTable']

        if pic_table_name not in pic_tables:
            print(f"  SKIP: No pic table {pic_table_name} for {struct_name}")
            skipped += 1
            continue

        pic_entries = pic_tables[pic_table_name]
        if not pic_entries:
            print(f"  SKIP: Empty pic table for {struct_name}")
            skipped += 1
            continue

        # Get palette
        if pal_tag not in palettes:
            if pal_tag == 'OBJ_EVENT_PAL_TAG_NONE':
                skipped += 1
                continue
            print(f"  SKIP: Unknown palette tag {pal_tag} for {struct_name}")
            skipped += 1
            continue

        palette = palettes[pal_tag]
        pal_name = PAL_TAG_TO_NAME.get(pal_tag, 'unknown')

        # Get frame dimensions from first pic table entry
        first_entry = pic_entries[0]
        tile_w = first_entry[1]
        tile_h = first_entry[2]
        frame_w = tile_w * 8
        frame_h = tile_h * 8

        # Determine unique source frames needed
        # Collect unique (gfx_name, frame_idx) pairs
        source_frames = {}  # (gfx_name, frame_idx) -> Image
        all_frame_images = []  # ordered list of frame Images for each pic table entry

        # First pass: find all unique source PNGs
        gfx_sources = set()
        for entry in pic_entries:
            gfx_sources.add(entry[0])

        # Load source PNGs
        source_images = {}
        ok = True
        for gfx_name in gfx_sources:
            if gfx_name not in gfx_paths:
                print(f"  FAIL: No path for {gfx_name} (needed by {struct_name})")
                ok = False
                break
            rel_path = gfx_paths[gfx_name]
            png_path = DECOMP_DIR / rel_path
            if not png_path.exists():
                print(f"  FAIL: PNG not found: {png_path} (needed by {struct_name})")
                ok = False
                break
            try:
                source_images[gfx_name] = Image.open(png_path)
            except Exception as e:
                print(f"  FAIL: Could not open {png_path}: {e}")
                ok = False
                break

        if not ok:
            failed += 1
            continue

        # Extract individual frames from source PNGs
        try:
            for entry in pic_entries:
                gfx_name, tw, th, frame_idx = entry
                fw = tw * 8
                fh = th * 8
                src_img = source_images[gfx_name]

                # The overworld_frame macro computes a byte offset into 4bpp tile data:
                #   frame_idx * (tw * th * TILE_SIZE_4BPP)
                # In the PNG, frames are laid out horizontally in a single row.
                # But for large sprites the PNG may be a grid. We need to compute
                # the pixel offset from the tile-data offset.
                #
                # Each frame is fw*fh pixels. In the source PNG, frames tile left-to-right
                # then wrap. frames_per_row = src_width / fw.
                if fw > 0 and fh > 0:
                    frames_per_row = max(1, src_img.width // fw)
                    row = frame_idx // frames_per_row
                    col = frame_idx % frames_per_row
                    x0 = col * fw
                    y0 = row * fh
                else:
                    x0 = 0
                    y0 = 0

                # For sprites where frame dimensions exceed PNG (e.g., Seagallop 32x128
                # from a 64x64 PNG), the "frame" is really the entire image used as-is.
                # Use the graphics_info width/height instead.
                if x0 + fw > src_img.width or y0 + fh > src_img.height:
                    # Fall back: use the full source image cropped to graphics_info dimensions
                    actual_w = min(width, src_img.width)
                    actual_h = min(height, src_img.height)
                    frame = src_img.crop((0, 0, actual_w, actual_h))
                    frame_rgba = apply_palette_to_indexed(frame, palette)
                    # Override frame dimensions for this sprite
                    frame_w = actual_w
                    frame_h = actual_h
                    all_frame_images.append(frame_rgba)
                    continue

                frame = src_img.crop((x0, y0, x0 + fw, y0 + fh))
                # Apply palette
                frame_rgba = apply_palette_to_indexed(frame, palette)
                all_frame_images.append(frame_rgba)
        except Exception as e:
            print(f"  FAIL: Error extracting frames for {struct_name}: {e}")
            ok = False

        if not ok:
            failed += 1
            continue

        # Deduplicate: count truly unique source frames (by pic table frame index)
        # For the spritesheet builder, we need to know how many unique directional
        # frames there are. The pic table often remaps frames (e.g., 3-facing sprites
        # that repeat frame indices). We use the full pic table entry count.
        num_entries = len(all_frame_images)

        output_name = enum_to_output_name(enum_name)

        print(f"Extracting {output_name}... ({frame_w}x{frame_h}, {num_entries} frames, {pal_name})")

        sheet, directions, frames_per_dir, animated = build_spritesheet(
            all_frame_images, frame_w, frame_h, num_entries
        )

        sheet.save(output_dir / f'{output_name}.png')

        manifest[output_name] = {
            'sheet': f'{output_name}.png',
            'frameWidth': frame_w,
            'frameHeight': frame_h,
            'directions': directions,
            'framesPerDirection': frames_per_dir,
            'palette': pal_name,
            'animated': animated,
        }

        extracted += 1

    # Write manifest
    manifest_path = output_dir / 'manifest.json'
    with open(manifest_path, 'w') as f:
        json.dump({'sprites': manifest}, f, indent=2)

    print()
    print("=== Summary ===")
    print(f"  Extracted: {extracted}")
    print(f"  Skipped:   {skipped}")
    print(f"  Failed:    {failed}")
    print(f"  Manifest:  {manifest_path}")
    print("Done!")


if __name__ == "__main__":
    main()
