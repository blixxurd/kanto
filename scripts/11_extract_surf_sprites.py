#!/usr/bin/env python3
"""11_extract_surf_sprites — Extract surf player sprite and surf blob from decomp.

Outputs:
  public/sprites/player_surf.png  — 16x128, 4 rows (south/north/west/east), 1 frame each
  public/sprites/surf_blob.png    — 256x32, 8 frames of 32x32 (S0 S1 N0 N1 W0 W1 E0 E1)
  public/sprites/surf_blob.json   — animation data for the surf blob
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
    pal_dir = DECOMP_DIR / 'graphics' / 'object_events' / 'palettes'
    output_dir = PUBLIC_DIR / 'sprites'
    output_dir.mkdir(parents=True, exist_ok=True)

    print("Extracting surf sprites...")

    # --- Player surf sprite ---
    player_pal = parse_jasc_pal(pal_dir / 'player.pal')
    surf_run_path = DECOMP_DIR / 'graphics' / 'object_events' / 'pics' / 'people' / 'red_surf_run.png'
    if not surf_run_path.exists():
        print(f"ERROR: {surf_run_path} not found")
        sys.exit(1)

    src = Image.open(surf_run_path)
    print(f"  red_surf_run.png: {src.size}, mode={src.mode}")

    colored = apply_palette_to_indexed(src, player_pal)

    frame_w, frame_h = 16, 32
    num_frames = src.width // frame_w
    print(f"  {num_frames} frames of {frame_w}x{frame_h}")

    # Extract all frames
    frames = []
    for i in range(num_frames):
        frames.append(colored.crop((i * frame_w, 0, (i + 1) * frame_w, frame_h)))

    # sPicTable_RedSurf uses frames 0=south, 1=north, 2=west from the source image
    # Build 4-row sheet: south, north, west, east (hflip west)
    sheet = Image.new('RGBA', (frame_w, frame_h * 4), (0, 0, 0, 0))
    sheet.paste(frames[0], (0, 0 * frame_h))  # south
    sheet.paste(frames[1], (0, 1 * frame_h))  # north
    sheet.paste(frames[2], (0, 2 * frame_h))  # west
    sheet.paste(frames[2].transpose(Image.FLIP_LEFT_RIGHT), (0, 3 * frame_h))  # east

    out_path = output_dir / 'player_surf.png'
    sheet.save(out_path)
    print(f"  Saved player_surf.png ({sheet.size})")

    # --- Surf blob ---
    # The GBA code sets paletteNum = 0 (player palette) for the surf blob.
    # The player palette gives the correct blue/gray/white water creature colors
    # at the indices the surf blob sprite uses (6, 7, 9, 10).
    blob_pal = player_pal

    blob_src_path = DECOMP_DIR / 'graphics' / 'object_events' / 'pics' / 'misc' / 'surf_blob.png'
    if not blob_src_path.exists():
        print(f"ERROR: {blob_src_path} not found")
        sys.exit(1)

    blob_src = Image.open(blob_src_path)
    print(f"  surf_blob.png: {blob_src.size}, mode={blob_src.mode}")

    blob_colored = apply_palette_to_indexed(blob_src, blob_pal)

    blob_fw, blob_fh = 32, 32
    blob_num_frames = blob_src.width // blob_fw
    print(f"  {blob_num_frames} frames of {blob_fw}x{blob_fh}")

    # Source frames: 0=south_0, 1=south_1, 2=north_0, 3=north_1, 4=west_0, 5=west_1
    # Output: S0 S1 N0 N1 W0 W1 E0 E1 (east = hflip west)
    blob_frames = []
    for i in range(blob_num_frames):
        blob_frames.append(blob_colored.crop((i * blob_fw, 0, (i + 1) * blob_fw, blob_fh)))

    out_w = blob_fw * 8  # 8 frames in a row
    blob_sheet = Image.new('RGBA', (out_w, blob_fh), (0, 0, 0, 0))

    # Paste: S0, S1, N0, N1, W0, W1
    for i in range(6):
        blob_sheet.paste(blob_frames[i], (i * blob_fw, 0))

    # E0 = hflip W0 (frame 4), E1 = hflip W1 (frame 5)
    blob_sheet.paste(blob_frames[4].transpose(Image.FLIP_LEFT_RIGHT), (6 * blob_fw, 0))
    blob_sheet.paste(blob_frames[5].transpose(Image.FLIP_LEFT_RIGHT), (7 * blob_fw, 0))

    blob_out_path = output_dir / 'surf_blob.png'
    blob_sheet.save(blob_out_path)
    print(f"  Saved surf_blob.png ({blob_sheet.size})")

    # --- Surf blob animation JSON ---
    anim_data = {
        "spritesheet": "surf_blob.png",
        "frameWidth": 32,
        "frameHeight": 32,
        "animations": {
            "south": {"frames": [0, 1], "frameDuration": 48, "loop": True},
            "north": {"frames": [2, 3], "frameDuration": 48, "loop": True},
            "west": {"frames": [4, 5], "frameDuration": 48, "loop": True},
            "east": {"frames": [6, 7], "frameDuration": 48, "loop": True},
        },
    }

    json_path = output_dir / 'surf_blob.json'
    with open(json_path, 'w') as f:
        json.dump(anim_data, f, indent=2)
    print(f"  Saved surf_blob.json")

    print("Done!")


if __name__ == "__main__":
    main()
