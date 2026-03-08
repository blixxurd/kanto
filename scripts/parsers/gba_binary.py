"""
Parsers for GBA binary formats used in pret/pokefirered.
Reference: docs/TECH_SPEC.md Section 14 (Appendix: GBA Binary Format Reference)
"""
import struct
from pathlib import Path


def parse_gbapal(data: bytes) -> list[tuple[int, int, int, int]]:
    """Parse a 32-byte .gbapal file into a list of 16 RGBA tuples.

    GBA color format: 15-bit BGR, 2 bytes per color, little-endian.
    0bBBBBBGGGGGRRRRR

    Color index 0 is always transparent (alpha=0).
    """
    assert len(data) == 32, f"Expected 32 bytes, got {len(data)}"
    colors = []
    for i in range(16):
        raw = struct.unpack_from('<H', data, i * 2)[0]
        r = (raw & 0x1F) << 3
        g = ((raw >> 5) & 0x1F) << 3
        b = ((raw >> 10) & 0x1F) << 3
        a = 0 if i == 0 else 255
        colors.append((r, g, b, a))
    return colors


def parse_tile_ref(value: int) -> dict:
    """Parse a 16-bit metatile tile reference.

    Bits 0-9:   tile index in tiles.png (0-1023)
    Bit 10:     horizontal flip
    Bit 11:     vertical flip
    Bits 12-15: palette index (0-15)
    """
    return {
        'tileIndex': value & 0x3FF,
        'flipX': bool(value & 0x400),
        'flipY': bool(value & 0x800),
        'paletteIndex': (value >> 12) & 0xF,
    }


def parse_metatile(data: bytes, offset: int = 0) -> dict:
    """Parse a single 16-byte metatile definition.

    8 tile references × 2 bytes each.
    First 4 = bottom layer (TL, TR, BL, BR)
    Last 4 = top layer (TL, TR, BL, BR)
    """
    refs = []
    for i in range(8):
        raw = struct.unpack_from('<H', data, offset + i * 2)[0]
        refs.append(parse_tile_ref(raw))

    return {
        'bottomLayer': refs[0:4],  # TL, TR, BL, BR
        'topLayer': refs[4:8],     # TL, TR, BL, BR
    }


def parse_metatiles_bin(data: bytes) -> list[dict]:
    """Parse an entire metatiles.bin file. 16 bytes per metatile."""
    count = len(data) // 16
    return [parse_metatile(data, i * 16) for i in range(count)]


def parse_metatile_attributes_frlg(data: bytes) -> list[dict]:
    """Parse metatile_attributes.bin for FireRed/LeafGreen.

    4 bytes (u32) per metatile.
    Bits 0-8:   behavior
    Bits 9-13:  terrain type
    Bits 24-26: encounter type
    Bits 29-30: layer type
    """
    count = len(data) // 4
    attrs = []
    for i in range(count):
        raw = struct.unpack_from('<I', data, i * 4)[0]
        attrs.append({
            'behavior': raw & 0x1FF,
            'terrainType': (raw >> 9) & 0x1F,
            'encounterType': (raw >> 24) & 0x7,
            'layerType': (raw >> 29) & 0x3,
        })
    return attrs


def parse_map_bin(data: bytes, width: int, height: int) -> list[dict]:
    """Parse a map.bin layout file.

    2 bytes (u16) per tile, row-major.
    Bits 0-9:   metatile ID (0-1023)
    Bits 10-11: collision (0=passable, 1-3=impassable)
    Bits 12-15: elevation (0-15)
    """
    expected = width * height * 2
    assert len(data) >= expected, f"Expected {expected} bytes for {width}x{height}, got {len(data)}"

    tiles = []
    for i in range(width * height):
        raw = struct.unpack_from('<H', data, i * 2)[0]
        tiles.append({
            'metatileId': raw & 0x3FF,
            'collision': (raw >> 10) & 0x3,
            'elevation': (raw >> 12) & 0xF,
        })
    return tiles


def load_palettes(palette_dir: Path) -> list[list[tuple[int, int, int, int]]]:
    """Load all 16 palettes from a tileset's palettes/ directory."""
    palettes = []
    for i in range(16):
        pal_file = palette_dir / f"{i:02d}.gbapal"
        if pal_file.exists():
            palettes.append(parse_gbapal(pal_file.read_bytes()))
        else:
            # Default: all transparent
            palettes.append([(0, 0, 0, 0)] * 16)
    return palettes
