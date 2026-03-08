# scripts/

Python extraction pipeline that converts raw `pret/pokefirered` decomp data into game-ready assets.

## Extraction Scripts

Run in order, or all at once with `npm run extract`:

| Script | Purpose |
|---|---|
| `01_render_metatile_atlases.py` | Composite 8x8 GBA tiles + palettes into 16x16 metatile atlas PNGs |
| `02_extract_layouts.py` | Parse `map.bin` files into intermediate layout JSONs |
| `03_extract_map_headers.py` | Extract connections, map types, and properties from C headers |
| `04_extract_warps.py` | Extract warp events (source tile, destination map + warp ID) |
| `05_extract_collision.py` | Parse `metatile_attributes.bin` into passability flags |
| `06_stitch_overworld.py` | BFS from Pallet Town, assemble all outdoor maps into one overworld |
| `07_export_interiors.py` | Export indoor/cave maps as individual Tiled JSONs |
| `08_extract_sprites.py` | Extract player spritesheets + animation metadata |
| `09_extract_tile_anims.py` | Extract animated tile frames (water, flowers, sand) |

## Supporting Files

- **`config.py`** -- Shared paths and constants (decomp location, output dirs, tileset pairings)
- **`extract_all.py`** -- Runs all 9 scripts in sequence
- **`parsers/`** -- Shared binary format parsers (palettes, metatiles, map layouts)
- **`requirements.txt`** -- Python dependencies (`pillow`, `numpy`)
- **`tests/`** -- Validation scripts run by `npm test`
