#!/usr/bin/env python3
"""08_extract_sprites — Extract player spritesheets and animation data.

Reads the Red walking sprite from the decomp, applies a palette,
and outputs a properly organized spritesheet + animation JSON.
"""
import json
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
    """Convert indexed image to RGBA using the given palette."""
    pixels = np.array(img)
    rgba = np.zeros((*pixels.shape, 4), dtype=np.uint8)
    for y in range(pixels.shape[0]):
        for x in range(pixels.shape[1]):
            idx = pixels[y, x] & 0xF
            if idx < len(palette):
                rgba[y, x] = palette[idx]
    return Image.fromarray(rgba, 'RGBA')


def main():
    sprites_dir = DECOMP_DIR / 'graphics' / 'object_events' / 'pics' / 'people'
    output_dir = PUBLIC_DIR / 'sprites'
    output_dir.mkdir(parents=True, exist_ok=True)

    print("Extracting sprites...")

    # Find palette for the player (Red)
    # Object event palettes are in graphics/object_events/palettes/
    pal_dir = DECOMP_DIR / 'graphics' / 'object_events' / 'palettes'
    player_pal = None

    # Try common palette names — player.pal is the correct one for Red/player sprite
    for pal_name in ['player.pal', 'red.pal', 'npc_red.pal', '0.pal']:
        p = pal_dir / pal_name
        if p.exists():
            player_pal = parse_jasc_pal(p)
            print(f"  Using palette: {pal_name}")
            break

    # If no palette found, list what's available and pick first
    if not player_pal and pal_dir.exists():
        pals = sorted(pal_dir.glob('*.pal'))
        if pals:
            player_pal = parse_jasc_pal(pals[0])
            print(f"  Using fallback palette: {pals[0].name}")

    # Load red_normal.png
    red_normal = sprites_dir / 'red_normal.png'
    if not red_normal.exists():
        print("ERROR: red_normal.png not found")
        sys.exit(1)

    src = Image.open(red_normal)
    frame_w = 16
    frame_h = 32
    num_frames = src.width // frame_w

    print(f"  red_normal.png: {src.size}, {num_frames} frames")

    # Apply palette if available, otherwise use as-is converting to RGBA
    if player_pal:
        result = apply_palette_to_indexed(src, player_pal)
    else:
        result = src.convert('RGBA')

    # FireRed red_normal layout: 9 frames at 16x32 in a single row
    # GBA frame order (from object_event_anims.h):
    #   0: south idle    1: north idle    2: west idle
    #   3: south walk1   4: south walk2
    #   5: north walk1   6: north walk2
    #   7: west walk1    8: west walk2
    # East = horizontally flipped west

    # Build organized spritesheet: 4 directions × 3 frames = 12 frames
    # Layout: each row = one direction (down, up, left, right)
    # Each row = 3 frames (idle, walk1, walk2)
    out_w = frame_w * 3  # 3 frames per row
    out_h = frame_h * 4  # 4 directions

    sheet = Image.new('RGBA', (out_w, out_h), (0, 0, 0, 0))

    # Extract frames
    frames = []
    for i in range(num_frames):
        frame = result.crop((i * frame_w, 0, (i + 1) * frame_w, frame_h))
        frames.append(frame)

    # Map source frames to grid rows: (idle, walk1, walk2) per direction
    direction_frames = [
        (0, 3, 4),  # Row 0 = down:  idle=0, walk1=3, walk2=4
        (1, 5, 6),  # Row 1 = up:    idle=1, walk1=5, walk2=6
        (2, 7, 8),  # Row 2 = left:  idle=2, walk1=7, walk2=8
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

    # Save male sprite
    sheet.save(output_dir / 'player_male.png')
    print(f"  Saved player_male.png ({sheet.size})")

    # Copy as female too (same sprite for now)
    sheet.save(output_dir / 'player_female.png')
    print(f"  Saved player_female.png ({sheet.size})")

    # Animation JSON
    anim_data = {
        'spritesheet': 'player_male.png',
        'frameWidth': frame_w,
        'frameHeight': frame_h,
        'animations': {
            'idle_down':  {'frames': [0], 'frameDuration': 1, 'loop': False},
            'idle_up':    {'frames': [3], 'frameDuration': 1, 'loop': False},
            'idle_left':  {'frames': [6], 'frameDuration': 1, 'loop': False},
            'idle_right': {'frames': [9], 'frameDuration': 1, 'loop': False},
            'walk_down':  {'frames': [0, 1, 0, 2], 'frameDuration': 4, 'loop': True},
            'walk_up':    {'frames': [3, 4, 3, 5], 'frameDuration': 4, 'loop': True},
            'walk_left':  {'frames': [6, 7, 6, 8], 'frameDuration': 4, 'loop': True},
            'walk_right': {'frames': [9, 10, 9, 11], 'frameDuration': 4, 'loop': True},
            'run_down':   {'frames': [0, 1, 0, 2], 'frameDuration': 3, 'loop': True},
            'run_up':     {'frames': [3, 4, 3, 5], 'frameDuration': 3, 'loop': True},
            'run_left':   {'frames': [6, 7, 6, 8], 'frameDuration': 3, 'loop': True},
            'run_right':  {'frames': [9, 10, 9, 11], 'frameDuration': 3, 'loop': True},
        },
    }

    with open(output_dir / 'player.json', 'w') as f:
        json.dump(anim_data, f, indent=2)
    print(f"  Saved player.json")

    print("Done!")


if __name__ == "__main__":
    main()
