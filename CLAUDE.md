# CLAUDE.md — Kanto Open World RPG

## Project Overview

You are building a browser-based open world Pokémon RPG set in the Kanto region. The game uses tile art and game data extracted from the `pret/pokefirered` decompilation (a complete reverse-engineering of Pokémon FireRed). All outdoor maps are stitched into one continuous overworld. Indoor maps (houses, caves, gyms) are loaded via warp transitions. The project includes an in-game editor for expanding the world.

## Tech Stack

- **Runtime:** PixiJS 8 + @pixi/tilemap + Howler.js (stubbed for phase 1) + TypeScript + Vite
- **Extraction:** Python 3.10+ with Pillow and NumPy
- **Map Format:** Tiled JSON (industry standard, editable in Tiled or in-game editor)
- **Source Data:** `pret/pokefirered` decomp cloned into `decomp/` directory (pinned to commit `7e3f822`)

## Key Documents

Read these BEFORE writing any code:

1. **`docs/TECH_SPEC.md`** — The complete technical specification. Contains repo structure, all system APIs, data formats, binary format reference, sprint plan, and future phase hooks. This is your primary reference.
2. **`docs/TESTING_TOOLKIT.md`** — The 5 validation tools. Run `python scripts/tests/run_all.py` after ANY change to verify correctness.

## Architecture Summary

```
Python extraction → public/ (Tiled JSONs + PNG atlases + data JSONs) → PixiJS app loads at runtime
```

The game has 4 states: `booting`, `playing`, `editor`, `transitioning`.

The overworld is ONE large Tiled JSON map assembled by stitching all outdoor maps from the decomp using their connection data. Indoor maps are separate Tiled JSONs loaded via warps.

The renderer uses `@pixi/tilemap` CompositeTilemap for hardware-accelerated tile batching. Only the viewport (~1000 tiles) is rendered each frame regardless of overworld size.

## Critical Files

```
src/Game.ts                    — state machine, main update loop
src/world/TilemapRenderer.ts   — renders tile layers via CompositeTilemap
src/world/MapManager.ts        — loads overworld + interiors, handles transitions
src/world/MapData.ts           — parsed Tiled JSON with read/write API
src/world/CollisionMap.ts      — passability grid from collision layer
src/world/WarpSystem.ts        — detects warps, triggers map transitions
src/world/ZoneSystem.ts        — tracks current zone for music/encounters
src/entities/PlayerController.ts — grid-locked movement with interpolation
src/editor/Editor.ts           — in-game editor toggle and tool management
src/editor/MapSerializer.ts    — exports MapData back to valid Tiled JSON
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

# Individual validators
npm run test:extraction
npm run test:stitch
npm run test:traversal
npm run test:warps
```

## Rules

1. **Always run `npm test` after completing any task.** If validators fail, fix the issues before moving on. Never leave failing validators.
2. **The decomp is read-only reference data.** Never modify files in `decomp/`. All output goes to `public/` or `intermediate/`.
3. **All map files are Tiled JSON format.** The overworld and every interior use the same format. The engine reads Tiled JSON. The editor writes Tiled JSON. Tiled desktop app can open the same files.
4. **Metatile atlases are pre-rendered.** The extraction pipeline composites 8×8 tiles + palettes into 16×16 metatile atlas PNGs. These atlases are the tileset images for both Tiled and the Pixi renderer.
5. **GIDs are 1-indexed in Tiled JSON.** Tile ID 0 means empty. Actual tile data starts at firstgid (1+). Every tileset has a firstgid offset. When reading/writing tile data, always account for this.
6. **Viewport culling is mandatory for the overworld.** The overworld may be 500×400+ tiles. Only render tiles visible in the camera viewport + a 2-tile buffer.
7. **The editor saves must pass `validateBeforeSave()`.** Never write invalid Tiled JSON. The validator checks dimensions, data lengths, GID ranges, and object coordinates before allowing a save.
8. **The debug API (`window.__gameDebug`) is dev-mode only.** Expose it behind `import.meta.env.DEV`. It allows programmatic game state inspection for testing.
9. **Use nearest-neighbor scaling everywhere.** Set `image-rendering: pixelated` on canvas. No bilinear filtering. This is pixel art.
10. **Indoor maps stay separate.** Phase 1 only stitches outdoor maps (MAP_TYPE_TOWN, MAP_TYPE_CITY, MAP_TYPE_ROUTE, MAP_TYPE_OCEAN_ROUTE). Everything else loads via warps.

## Phase 1 Build Order

This is the critical path. Do these in order:

### Step 1: Extraction Pipeline (scripts/)
1. `01_render_metatile_atlases.py` — THE critical script. tiles.png + palettes + metatiles.bin → atlas PNGs
2. `02_extract_layouts.py` — map.bin → intermediate layout JSONs
3. `03_extract_map_headers.py` — C headers → connections, map types, properties
4. `04_extract_warps.py` — events.json → warp data per map
5. `05_extract_collision.py` — metatile_attributes.bin → collision flags
6. Run `npm run test:extraction` — fix any errors
7. `06_stitch_overworld.py` — BFS from Pallet Town, assemble overworld
8. `07_export_interiors.py` — indoor/cave maps → individual Tiled JSONs
9. `08_extract_sprites.py` — player spritesheets + animation data
10. Run `npm test` — all 4 validators must pass

### Step 2: Engine Scaffold (src/)
1. Vite + TS + Pixi project setup
2. `main.ts` + `Game.ts` skeleton
3. `AssetLoader.ts` — load overworld JSON + tileset PNGs
4. `TilesetRegistry.ts` — parse tileset refs, build GID→Texture lookup
5. `TilemapRenderer.ts` — render bottom + top layers
6. `Camera.ts` — 4× zoom, follow target, bounds clamping
7. Verify: Pallet Town area renders in browser

### Step 3: Player + Collision
1. `Input.ts` — keyboard polling (arrows, WASD, shift)
2. `Player.ts` — sprite, grid position, animation
3. `PlayerController.ts` — grid movement, collision checks, interpolation
4. `CollisionMap.ts` — parse collision layer
5. Camera follow with lerp

### Step 4: Warps + Zones
1. `WarpSystem.ts` — detect warp tiles, trigger transition
2. `MapManager.ts` — load interiors, swap active map, handle returns
3. `TransitionEffect.ts` — fade to/from black
4. `ZoneSystem.ts` — detect zone changes, fire events

### Step 5: Editor
1. `Editor.ts` — F1 toggle, tool management
2. Tile palette HTML panel + TilePaintTool
3. CollisionPaintTool + overlay
4. WarpTool + markers
5. `MapSerializer.ts` + `validateBeforeSave()`
6. Save button (download JSON)

### Step 6: Polish
1. Run `npm test` — fix all failures
2. Debug API on `window.__gameDebug`
3. Screen scaling, fullscreen
4. Debug overlays (tile IDs, collision grid, zone borders)
5. Final `npm test` — confirm PASS

## GBA Binary Format Quick Reference

**Palette (.gbapal):** 32 bytes, 16 colors × 2 bytes, LE 15-bit BGR (0bBBBBBGGGGGRRRRR), index 0 = transparent

**Metatile (metatiles.bin):** 16 bytes per metatile, 8 tile refs × 2 bytes. First 4 = bottom layer, last 4 = top layer. Each ref: bits 0-9 = tile index, bit 10 = flipX, bit 11 = flipY, bits 12-15 = palette

**Metatile Attributes (metatile_attributes.bin):** 4 bytes per metatile (u32 LE). Bits 0-8 = behavior, bits 29-30 = layer type

**Map (map.bin):** 2 bytes per tile (u16 LE), row-major. Bits 0-9 = metatile ID, bits 10-11 = collision, bits 12-15 = elevation

**Connections:** direction (N/S/E/W) + target map + tile offset along shared edge

**Warps:** x, y (tile coords) + destination map + destination warp ID
