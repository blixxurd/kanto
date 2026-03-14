#!/usr/bin/env python3
"""01_render_metatile_atlases — Render metatile atlas PNGs + TSJ files for all tilesets.

Reads tiles.png + JASC-PAL palettes + metatiles.bin from the decomp and produces
pre-rendered 16×16 metatile atlas PNGs with companion Tiled TSJ files.

IMPORTANT: Metatile tile references use a combined index space:
  - Indices 0-639 (NUM_TILES_IN_PRIMARY) → primary tileset's tiles.png
  - Indices 640+ → secondary tileset's tiles.png
So secondary tilesets must load BOTH their own tiles AND the paired primary's tiles.
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
    print("ERROR: Pillow and numpy required. Run: pip install Pillow numpy")
    sys.exit(1)

METATILES_PER_ROW = 16
NUM_TILES_IN_PRIMARY = 640


def parse_jasc_pal(filepath: Path) -> list[tuple[int, int, int, int]]:
    """Parse a JASC-PAL format palette file into 16 RGBA tuples."""
    lines = filepath.read_text().strip().splitlines()
    assert lines[0] == 'JASC-PAL', f"Not a JASC-PAL file: {filepath}"
    count = int(lines[2])
    colors = []
    for i in range(count):
        parts = lines[3 + i].split()
        r, g, b = int(parts[0]), int(parts[1]), int(parts[2])
        a = 0 if i == 0 else 255  # index 0 is always transparent
        colors.append((r, g, b, a))
    # Pad to 16 if needed
    while len(colors) < 16:
        colors.append((0, 0, 0, 0))
    return colors


def load_palettes(palette_dir: Path) -> list[list[tuple[int, int, int, int]]]:
    """Load all 16 palettes from a tileset's palettes/ directory."""
    palettes = []
    for i in range(16):
        pal_file = palette_dir / f"{i:02d}.pal"
        if pal_file.exists():
            palettes.append(parse_jasc_pal(pal_file))
        else:
            palettes.append([(0, 0, 0, 0)] * 16)
    return palettes


def load_indexed_tiles(tiles_png: Path) -> np.ndarray:
    """Load tiles.png as array of 8×8 indexed tiles.

    Returns ndarray of shape (num_tiles, 8, 8) with pixel values 0-15.
    """
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


def build_combined_tiles(primary_tiles: np.ndarray, secondary_tiles: np.ndarray | None) -> np.ndarray:
    """Build a combined tile index array matching the GBA's runtime tile space.

    Index 0-639: primary tileset tiles
    Index 640+: secondary tileset tiles
    """
    # Pad primary to exactly NUM_TILES_IN_PRIMARY entries
    if len(primary_tiles) < NUM_TILES_IN_PRIMARY:
        padding = np.zeros((NUM_TILES_IN_PRIMARY - len(primary_tiles), 8, 8), dtype=np.uint8)
        primary_padded = np.concatenate([primary_tiles, padding])
    else:
        primary_padded = primary_tiles[:NUM_TILES_IN_PRIMARY]

    if secondary_tiles is not None and len(secondary_tiles) > 0:
        return np.concatenate([primary_padded, secondary_tiles])
    else:
        return primary_padded


def render_8x8_tile(indexed_tiles: np.ndarray, tile_ref: dict,
                    palettes: list[list[tuple[int, int, int, int]]]) -> np.ndarray:
    """Render a single 8×8 tile ref to RGBA array."""
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


def render_metatile(indexed_tiles: np.ndarray, metatile: dict,
                    palettes: list[list[tuple[int, int, int, int]]]) -> np.ndarray:
    """Render a 16×16 metatile (bottom + top layers composited)."""
    result = np.zeros((16, 16, 4), dtype=np.uint8)

    # Bottom layer: TL, TR, BL, BR
    for layer_key in ['bottomLayer', 'topLayer']:
        refs = metatile[layer_key]
        positions = [(0, 0), (8, 0), (0, 8), (8, 8)]  # TL, TR, BL, BR
        for ref, (px, py) in zip(refs, positions):
            tile_rgba = render_8x8_tile(indexed_tiles, ref, palettes)
            for y in range(8):
                for x in range(8):
                    if tile_rgba[y, x, 3] > 0:  # non-transparent
                        result[py + y, px + x] = tile_rgba[y, x]

    return result


def render_metatile_top_only(indexed_tiles: np.ndarray, metatile: dict,
                             palettes: list[list[tuple[int, int, int, int]]]) -> np.ndarray:
    """Render only the top layer of a 16×16 metatile (for sprite overlay)."""
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


def parse_metatiles_bin(data: bytes) -> list[dict]:
    """Parse metatiles.bin. 16 bytes per metatile, 8 tile refs × 2 bytes."""
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


def process_tileset(tileset_dir: Path, name: str, output_dir: Path,
                    primary_tiles: np.ndarray | None = None,
                    primary_palettes: list | None = None) -> dict:
    """Process a single tileset directory into atlas PNG + TSJ.

    For secondary tilesets, primary_tiles and primary_palettes should be provided
    from the paired primary tileset (e.g., general or building).
    """
    tiles_png = tileset_dir / 'tiles.png'
    metatiles_bin = tileset_dir / 'metatiles.bin'
    palettes_dir = tileset_dir / 'palettes'

    if not tiles_png.exists():
        print(f"  SKIP {name}: no tiles.png")
        return None
    if not metatiles_bin.exists():
        print(f"  SKIP {name}: no metatiles.bin")
        return None

    own_tiles = load_indexed_tiles(tiles_png)
    own_palettes = load_palettes(palettes_dir) if palettes_dir.exists() else [[(0, 0, 0, 0)] * 16] * 16

    # Build combined tile set for rendering
    if primary_tiles is not None:
        # Secondary tileset: combine primary tiles (0-639) + own tiles (640+)
        combined_tiles = build_combined_tiles(primary_tiles, own_tiles)
        # Merge palettes matching GBA hardware allocation:
        # Palettes 0-6 (NUM_PALS_IN_PRIMARY=7) always come from the primary tileset.
        # Palettes 7-12 come from the secondary tileset.
        # Palettes 13-15 are unused/available.
        NUM_PALS_IN_PRIMARY = 7
        combined_palettes = list(own_palettes)
        if primary_palettes:
            for i in range(NUM_PALS_IN_PRIMARY):
                combined_palettes[i] = primary_palettes[i]
    else:
        # Primary tileset: just use own tiles
        combined_tiles = own_tiles
        combined_palettes = own_palettes

    metatiles = parse_metatiles_bin(metatiles_bin.read_bytes())

    if not metatiles:
        print(f"  SKIP {name}: no metatiles")
        return None

    # Render all metatiles
    num_metatiles = len(metatiles)
    cols = METATILES_PER_ROW
    rows = (num_metatiles + cols - 1) // cols

    atlas = np.zeros((rows * 16, cols * 16, 4), dtype=np.uint8)
    atlas_top = np.zeros((rows * 16, cols * 16, 4), dtype=np.uint8)
    for i, mt in enumerate(metatiles):
        row = i // cols
        col = i % cols
        rendered = render_metatile(combined_tiles, mt, combined_palettes)
        atlas[row * 16:(row + 1) * 16, col * 16:(col + 1) * 16] = rendered
        rendered_top = render_metatile_top_only(combined_tiles, mt, combined_palettes)
        atlas_top[row * 16:(row + 1) * 16, col * 16:(col + 1) * 16] = rendered_top

    # Save full atlas PNG
    atlas_img = Image.fromarray(atlas, 'RGBA')
    atlas_path = output_dir / f"{name}.png"
    atlas_img.save(atlas_path)

    # Save top-only atlas PNG (for sprite overlay layer)
    atlas_top_img = Image.fromarray(atlas_top, 'RGBA')
    atlas_top_path = output_dir / f"{name}_top.png"
    atlas_top_img.save(atlas_top_path)

    tile_count = cols * rows

    # Save TSJ (Tiled tileset JSON) for full atlas
    tsj = {
        "columns": cols,
        "image": f"{name}.png",
        "imageheight": rows * 16,
        "imagewidth": cols * 16,
        "margin": 0,
        "name": name,
        "spacing": 0,
        "tilecount": tile_count,
        "tiledversion": "1.11",
        "tileheight": 16,
        "tilewidth": 16,
        "type": "tileset",
        "version": "1.10"
    }
    tsj_path = output_dir / f"{name}.tsj"
    with open(tsj_path, 'w') as f:
        json.dump(tsj, f, indent=2)

    # Save TSJ for top-only atlas
    tsj_top = {**tsj, "name": f"{name}_top", "image": f"{name}_top.png"}
    tsj_top_path = output_dir / f"{name}_top.tsj"
    with open(tsj_top_path, 'w') as f:
        json.dump(tsj_top, f, indent=2)

    print(f"  {name}: {num_metatiles} metatiles -> {atlas_img.width}x{atlas_img.height} atlas (+top)")
    return {'name': name, 'tilecount': num_metatiles, 'file': f"{name}.tsj"}


def build_secondary_to_primary_map() -> dict[str, str]:
    """Build mapping from secondary tileset C names to their primary tileset C names.

    Uses layout data from intermediate/ to determine pairings.
    """
    from config import INTERMEDIATE_DIR
    layouts_dir = INTERMEDIATE_DIR / 'layouts'
    if not layouts_dir.exists():
        return {}

    pairings = {}
    for f in layouts_dir.glob('*.json'):
        d = json.load(open(f))
        primary = d.get('primaryTileset', '')
        secondary = d.get('secondaryTileset', '')
        if secondary and secondary != 'NULL' and primary and primary != 'NULL':
            # If multiple primaries, prefer gTileset_General (used by outdoor maps)
            if secondary not in pairings or primary == 'gTileset_General':
                pairings[secondary] = primary
    return pairings


def find_tileset_dir(c_name: str, tilesets_dir: Path) -> Path | None:
    """Find the directory for a tileset given its C name."""
    short = c_name.replace('gTileset_', '')
    for category in ['primary', 'secondary']:
        cat_dir = tilesets_dir / category
        if not cat_dir.exists():
            continue
        for d in cat_dir.iterdir():
            if d.is_dir() and d.name.lower().replace('_', '') == short.lower():
                return d
    return None


def main():
    tilesets_dir = DECOMP_DIR / 'data' / 'tilesets'
    output_dir = PUBLIC_DIR / 'tilesets'
    output_dir.mkdir(parents=True, exist_ok=True)

    if not tilesets_dir.exists():
        print("ERROR: decomp/data/tilesets not found. Clone pokefirered into decomp/")
        sys.exit(1)

    print("Rendering metatile atlases...")

    # Build secondary → primary mapping from layout data
    sec_to_primary = build_secondary_to_primary_map()
    print(f"  Found {len(sec_to_primary)} secondary->primary pairings")

    # Pre-load primary tileset tiles and palettes for reuse
    primary_cache = {}  # c_name -> (tiles_array, palettes)
    for category_dir in [tilesets_dir / 'primary']:
        if not category_dir.exists():
            continue
        for tileset_dir in category_dir.iterdir():
            if not tileset_dir.is_dir() or tileset_dir.name.startswith('dummy'):
                continue
            tiles_png = tileset_dir / 'tiles.png'
            palettes_dir = tileset_dir / 'palettes'
            if tiles_png.exists():
                tiles = load_indexed_tiles(tiles_png)
                palettes = load_palettes(palettes_dir) if palettes_dir.exists() else [[(0, 0, 0, 0)] * 16] * 16
                # Build C name for lookup
                for c_name, paired_primary in sec_to_primary.items():
                    primary_dir = find_tileset_dir(paired_primary, tilesets_dir)
                    if primary_dir and primary_dir.name == tileset_dir.name:
                        if paired_primary not in primary_cache:
                            primary_cache[paired_primary] = (tiles, palettes)

    # Also directly cache by name for primary tilesets we know about
    for c_name in ['gTileset_General', 'gTileset_Building']:
        if c_name not in primary_cache:
            d = find_tileset_dir(c_name, tilesets_dir)
            if d:
                tiles_png = d / 'tiles.png'
                palettes_dir = d / 'palettes'
                if tiles_png.exists():
                    tiles = load_indexed_tiles(tiles_png)
                    palettes = load_palettes(palettes_dir) if palettes_dir.exists() else [[(0, 0, 0, 0)] * 16] * 16
                    primary_cache[c_name] = (tiles, palettes)

    print(f"  Cached {len(primary_cache)} primary tilesets: {list(primary_cache.keys())}")

    results = []

    # Process primary tilesets first (they're self-contained or close to it)
    primary_dir = tilesets_dir / 'primary'
    if primary_dir.exists():
        for tileset_dir in sorted(primary_dir.iterdir()):
            if not tileset_dir.is_dir() or tileset_dir.name.startswith('dummy'):
                continue
            name = tileset_dir.name
            result = process_tileset(tileset_dir, name, output_dir)
            if result:
                results.append(result)

    # Process secondary tilesets with primary tiles loaded
    secondary_dir = tilesets_dir / 'secondary'
    if secondary_dir.exists():
        for tileset_dir in sorted(secondary_dir.iterdir()):
            if not tileset_dir.is_dir() or tileset_dir.name.startswith('dummy'):
                continue
            name = tileset_dir.name

            # Find paired primary tileset's C name
            paired_primary_c = None
            for c_name, primary_c in sec_to_primary.items():
                short = c_name.replace('gTileset_', '')
                if name.lower().replace('_', '') == short.lower():
                    paired_primary_c = primary_c
                    break

            primary_tiles = None
            primary_palettes = None
            if paired_primary_c and paired_primary_c in primary_cache:
                primary_tiles, primary_palettes = primary_cache[paired_primary_c]

            result = process_tileset(tileset_dir, name, output_dir,
                                     primary_tiles=primary_tiles,
                                     primary_palettes=primary_palettes)
            if result:
                results.append(result)

    print(f"\nDone: {len(results)} tilesets rendered")

    if not results:
        print("ERROR: No tilesets rendered!")
        sys.exit(1)


if __name__ == "__main__":
    main()
