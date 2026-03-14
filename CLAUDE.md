# CLAUDE.md — Kanto Open World RPG

## Project Overview

You are building a browser-based open world Pokemon RPG set in the Kanto region. The game uses tile art and game data extracted from the `pret/pokefirered` decompilation (a complete reverse-engineering of Pokemon FireRed). All outdoor maps are stitched into one continuous overworld. Indoor maps (houses, caves, gyms) are loaded via warp transitions. Map editing is done in the Tiled desktop editor.

## Tech Stack

- **Runtime:** PixiJS 8 + @pixi/tilemap + Howler.js (stubbed for phase 1) + TypeScript + Vite
- **Extraction:** Python 3.10+ with Pillow and NumPy
- **Map Format:** Tiled JSON (industry standard, editable in Tiled desktop app)
- **Map Editor:** Tiled (desktop app)
- **Source Data:** `pret/pokefirered` decomp cloned into `decomp/` directory (pinned to commit `7e3f822`)

## Key Documents

Read these BEFORE writing any code:

1. **`docs/TECH_SPEC.md`** — The complete technical specification. Contains repo structure, all system APIs, data formats, binary format reference, sprint plan, and future phase hooks. This is your primary reference.
2. **`docs/TESTING_TOOLKIT.md`** — The 4 validation tools. Run `python scripts/tests/run_all.py` after ANY change to verify correctness.

## Architecture Summary

```
Python extraction → public/ (Tiled JSONs + PNG atlases + data JSONs) → PixiJS app loads at runtime
```

The game has 3 states: `booting`, `playing`, `transitioning`.

The overworld is ONE large Tiled JSON map assembled by stitching all outdoor maps from the decomp using their connection data. Indoor maps are separate Tiled JSONs loaded via warps.

The renderer uses `@pixi/tilemap` CompositeTilemap for hardware-accelerated tile batching. Only the viewport (~1000 tiles) is rendered each frame regardless of overworld size.

## Critical Files

```
src/Game.ts                        — state machine, main update loop
src/world/TilemapRenderer.ts       — renders tile layers via CompositeTilemap
src/world/MapManager.ts            — loads overworld + interiors, handles transitions
src/world/MapData.ts               — parsed Tiled JSON with read API
src/world/CollisionMap.ts          — passability grid from collision layer
src/world/WarpSystem.ts            — detects warps, triggers map transitions
src/world/ZoneSystem.ts            — tracks current zone for music/encounters
src/world/TileAnimator.ts          — animated tiles (water, flowers, sand)
src/world/DoorAnimator.ts          — door open/close animation overlay
src/entities/PlayerController.ts   — grid-locked movement with interpolation
src/effects/GrassEffect.ts         — tall grass stepping overlay animation
src/effects/LandingDustEffect.ts   — landing dust puff on ledge jumps
src/core/TransitionEffect.ts       — fade to/from black/white
src/core/ScreenManager.ts          — resolution presets, fullscreen, integer zoom
src/core/DebugOverlay.ts           — F3 debug modes (collision, zones, tile IDs)
```

## Commands

```bash
# Extract all data from decomp (run once, or after decomp updates)
npm run extract

# Run all validators (run after ANY change)
npm test

# Start dev server
npm run dev

# Type check
npm run typecheck

# Browser-based visual testing (Playwright)
npm run test:browser

# Individual validators
npm run test:extraction
npm run test:stitch
npm run test:traversal
npm run test:warps
```

## Rules

1. **Always run `npm test` after completing any task.** If validators fail, fix the issues before moving on. Never leave failing validators.
2. **The decomp is read-only reference data.** Never modify files in `decomp/`. All output goes to `public/` or `intermediate/`.
3. **All map files are Tiled JSON format.** The overworld and every interior use the same format. The engine reads Tiled JSON. Tiled desktop app edits the same files.
4. **Metatile atlases are pre-rendered.** The extraction pipeline composites 8x8 tiles + palettes into 16x16 metatile atlas PNGs. These atlases are the tileset images for both Tiled and the Pixi renderer.
5. **GIDs are 1-indexed in Tiled JSON.** Tile ID 0 means empty. Actual tile data starts at firstgid (1+). Every tileset has a firstgid offset. When reading/writing tile data, always account for this.
6. **Viewport culling is mandatory for the overworld.** The overworld may be 500x400+ tiles. Only render tiles visible in the camera viewport + a 2-tile buffer.
7. **The debug API (`window.__gameDebug`) is dev-mode only.** Expose it behind `import.meta.env.DEV`. It allows programmatic game state inspection for testing.
8. **Use nearest-neighbor scaling everywhere.** Set `image-rendering: pixelated` on canvas. No bilinear filtering. This is pixel art.
9. **Indoor maps stay separate.** Phase 1 only stitches outdoor maps (MAP_TYPE_TOWN, MAP_TYPE_CITY, MAP_TYPE_ROUTE, MAP_TYPE_OCEAN_ROUTE). Everything else loads via warps.

## Extraction Pipeline

Scripts run in order, or all at once with `npm run extract`:

### Core Extraction (scripts 01-08)
1. `01_render_metatile_atlases.py` — THE critical script. tiles.png + palettes + metatiles.bin -> atlas PNGs
2. `02_extract_layouts.py` — map.bin -> intermediate layout JSONs
3. `03_extract_map_headers.py` — C headers -> connections, map types, properties
4. `04_extract_warps.py` — events.json -> warp data per map
5. `05_extract_collision.py` — metatile_attributes.bin -> collision flags
6. Run `npm run test:extraction` — fix any errors
7. `06_stitch_overworld.py` — BFS from Pallet Town, assemble overworld
8. `07_export_interiors.py` — indoor/cave maps -> individual Tiled JSONs
9. `08_extract_sprites.py` — player spritesheets + animation data
10. Run `npm test` — all 4 validators must pass

### Additional Extraction (scripts 09-10)
11. `09_extract_tile_anims.py` — animated tile frames (water, flowers, sand)
12. `10_extract_door_anims.py` — door animation spritesheets from GBA graphics


## GBA Binary Format Quick Reference

**Palette (.gbapal):** 32 bytes, 16 colors x 2 bytes, LE 15-bit BGR (0bBBBBBGGGGGRRRRR), index 0 = transparent

**Metatile (metatiles.bin):** 16 bytes per metatile, 8 tile refs x 2 bytes. First 4 = bottom layer, last 4 = top layer. Each ref: bits 0-9 = tile index, bit 10 = flipX, bit 11 = flipY, bits 12-15 = palette

**Metatile Attributes (metatile_attributes.bin):** 4 bytes per metatile (u32 LE). Bits 0-8 = behavior, bits 29-30 = layer type

**Map (map.bin):** 2 bytes per tile (u16 LE), row-major. Bits 0-9 = metatile ID, bits 10-11 = collision, bits 12-15 = elevation

**Connections:** direction (N/S/E/W) + target map + tile offset along shared edge

**Warps:** x, y (tile coords) + destination map + destination warp ID
