"""Paths configuration for extraction scripts."""
from pathlib import Path

DECOMP_DIR = Path(__file__).parent.parent / "decomp"
INTERMEDIATE_DIR = Path(__file__).parent.parent / "intermediate"
PUBLIC_DIR = Path(__file__).parent.parent / "public"
REFERENCE_DIR = Path(__file__).parent.parent / "reference" / "original_maps"

for d in [INTERMEDIATE_DIR, INTERMEDIATE_DIR / "layouts",
          PUBLIC_DIR / "maps" / "interiors", PUBLIC_DIR / "maps" / "dungeons",
          PUBLIC_DIR / "tilesets", PUBLIC_DIR / "sprites", PUBLIC_DIR / "data", REFERENCE_DIR]:
    d.mkdir(parents=True, exist_ok=True)
