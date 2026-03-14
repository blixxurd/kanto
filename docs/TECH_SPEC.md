# Kanto Open World RPG — Phase 1 Technical Specification

**Project:** Kanto Open World RPG
**Phase:** 1 — Traversable Overworld MVP
**Version:** 1.0
**Date:** March 2026

---

## Table of Contents

1. Project Vision
2. Phase 1 Scope
3. Tech Stack
4. Repository Structure
5. Data Pipeline
6. Engine Architecture
7. Core Systems Specification
8. Data Formats
9. Build & Dev Workflow
10. Phase 1 Sprint Plan
11. Testing & Agent Verification
12. Future Phase Hooks
13. Appendix: GBA Binary Format Reference

---

## 1. Project Vision

A browser-based open world Pokemon RPG set in the Kanto region, built from the `pret/pokefirered` decompilation as a data source. The final game features a continuous, vastly expanded Kanto overworld with explorable interiors, NPC schedules and routines, day/night cycles, and a full battle engine. Map editing is done in the Tiled desktop editor.

The game is not a port of FireRed. It is a new game that uses FireRed's reverse-engineered data — tile art, Pokemon stats, move data, trainer rosters, dialogue, and map layouts — as its foundation. The map layouts serve as the starting skeleton that gets expanded into a realistic, open-world Kanto inspired by the anime's sense of scale.

---

## 2. Phase 1 Scope

### Phase 1 IS

- A Python extraction pipeline that mines `pret/pokefirered` for tile art, map data, connections, warps, collision, and sprites
- A stitching script that assembles all outdoor maps into one continuous overworld based on the game's connection data
- All indoor/cave/dungeon maps exported as individual Tiled JSON files
- A PixiJS 8 browser application that renders the stitched overworld with correct tiles, palettes, and layering
- A player character that walks on a 16x16 tile grid with collision, smooth interpolation, walk/run animations
- A camera that follows the player at 4x pixel-perfect zoom
- Warp transitions between the overworld and interior maps (enter/exit buildings)
- Zone detection for music/area name changes as the player moves between towns and routes
- Screen scaling (1x-6x integer, fit-to-window, fullscreen)
- Field effects: tall grass stepping animation, ledge jumps with parabolic arcs, landing dust
- Tile animations: water, flowers, sand edges
- Door animations: open/close sequences matching GBA behavior
- Debug overlay (F3): collision grid, zone borders, tile IDs, mouse hover tooltip

### Phase 1 IS NOT

- NPCs, dialogue, or scripting
- Wild encounters or battles
- Pokémon data, party, bag, or any menus
- Audio playback (zone system tracks what SHOULD play, but no audio loaded yet)
- Day/night cycle (architecture supports it, not implemented)
- NPC schedules or pathfinding
- Any game progression, flags, or save system

### Phase 1 Success Criteria

- Player can walk from Pallet Town to Indigo Plateau entirely on the overworld, entering and exiting every building along the way
- Every outdoor map from the original game renders with correct tiles
- Collision prevents walking through walls, water, and obstacles
- Maps are editable in the Tiled desktop editor
- The application runs at 60fps in Chrome/Firefox/Safari on a 2020-era laptop

---

## 3. Tech Stack

### Runtime

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Renderer | PixiJS | 8.5+ | WebGL sprite rendering, containers, textures |
| Tilemaps | @pixi/tilemap | 5.0+ | Hardware-accelerated tilemap batching |
| Audio (future) | Howler.js | 2.2+ | Web Audio API wrapper (installed now, used in phase 2) |
| Language | TypeScript | 5.5+ | Type safety, IDE support |
| Bundler | Vite | 6.0+ | Dev server, hot reload, production builds |

### Extraction Pipeline

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Language | Python 3.10+ | All extraction and stitching scripts |
| Image processing | Pillow (PIL) | Metatile atlas rendering, palette application |
| Data parsing | regex + struct | C header parsing, binary format reading |
| Output | JSON + PNG | Tiled-compatible map files, atlas textures |

### External Tools

| Tool | Purpose |
|------|---------|
| Tiled Map Editor | Map editing — open map files in `public/maps/` directly |
| Aseprite | Pixel art for new tilesets (phase 2+) |
| Git | Version control for map files and source |

### Why This Stack

**PixiJS over Phaser:** We need full control over the game loop, scene management, and rendering pipeline. Pixi gives us raw rendering primitives with zero opinions about game structure.

**@pixi/tilemap over manual sprites:** Batches all visible tiles into minimal GPU draw calls. Handles multiple tileset textures via CompositeTilemap. Double-buffered rendering eliminates flash on viewport changes.

**Tiled JSON as canonical format:** Industry standard. Editable in Tiled desktop app or by hand. Phaser, Godot, Unity, and every other engine can import it if we ever migrate. Single source of truth for all map data.

**Vite over Webpack:** Faster dev server, native TypeScript support, simpler config. No reason to use anything heavier.

**Python for extraction:** The decomp's data is in C headers and GBA binary formats. Python's regex and struct modules handle both naturally. Pillow renders the metatile atlases. No reason to use Node for this.

---

## 4. Repository Structure

```
kanto/
│
├── README.md
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html                              # entry point: game canvas container
│
├── scripts/                                # Python extraction pipeline
│   ├── requirements.txt                    # pillow, numpy
│   ├── extract_all.py                      # orchestrator: runs scripts 01-10 in order
│   ├── config.py                           # paths to decomp repo, output dirs
│   │
│   ├── 01_render_metatile_atlases.py       # tiles.png + palettes + metatiles.bin → atlas PNGs
│   ├── 02_extract_layouts.py              # map.bin → intermediate layout JSONs
│   ├── 03_extract_map_headers.py          # C headers → connections, map types, properties
│   ├── 04_extract_warps.py                # events.json → warp data per map
│   ├── 05_extract_collision.py            # metatile_attributes.bin → collision attributes
│   ├── 06_stitch_overworld.py             # assembles outdoor maps into one overworld
│   ├── 07_export_interiors.py             # converts indoor/cave maps to individual Tiled JSONs
│   ├── 08_extract_sprites.py              # player spritesheets + animation metadata
│   ├── 09_extract_tile_anims.py           # animated tile frames (water, flowers, sand)
│   ├── 10_extract_door_anims.py           # door animation spritesheets from GBA graphics
│   │
│   ├── parsers/                            # shared parsing utilities
│   │   ├── __init__.py
│   │   ├── c_header_parser.py             # regex parser for #define, struct initializers
│   │   └── gba_binary.py                  # readers for .pal, metatiles.bin, map.bin, attrs.bin
│   │
│   └── tests/                              # automated verification tools
│       ├── run_all.py                     # master runner: executes all validators, exits 0/1
│       ├── validate_extraction.py         # checks tileset, layout, connection, warp integrity
│       ├── validate_stitch.py             # checks overworld structure, layers, GID ranges
│       ├── validate_traversal.py          # flood-fill from Pallet Town, verifies all towns reachable
│       ├── validate_warps.py              # checks every door has an exit, no traps, files exist
│       └── browser_test.mjs               # Playwright-based visual testing + automation
│
├── decomp/                                 # pret/pokefirered clone (pinned to commit 7e3f822)
│   └── (pokefirered repo)                  # NOT committed — user clones separately
│
├── public/                                 # static assets served by Vite (extraction output)
│   ├── maps/
│   │   ├── overworld.json                  # THE stitched overworld (Tiled JSON, 424×416 tiles)
│   │   ├── interiors/                      # ~300 indoor maps (houses, gyms, labs, etc.)
│   │   └── dungeons/                       # ~87 cave/tower maps
│   │
│   ├── tilesets/                            # pre-rendered metatile atlases (~70 pairs)
│   │   ├── general.png / general.tsj       # primary tileset (shared across all maps)
│   │   ├── {name}.png / {name}.tsj         # secondary tilesets (per-area)
│   │   ├── {name}_top.png / {name}_top.tsj # top layer variants
│   │   ├── {name}_anim_*.png              # animation frame atlases
│   │   ├── collision_overlay.png/.tsj      # Tiled collision visualization
│   │   └── behavior_overlay.png/.tsj       # Tiled behavior visualization
│   │
│   ├── sprites/
│   │   ├── player_male.png                 # walk/run/idle spritesheet
│   │   ├── player_female.png
│   │   ├── player.json                     # animation definitions (frame rects, timing)
│   │   ├── tall_grass.png                  # grass stepping animation (5 frames)
│   │   ├── landing_dust.png                # ledge landing dust (3 frames)
│   │   ├── shadow_small.png / shadow_medium.png
│   │   └── doors/                          # ~32 door animation spritesheets
│   │
│   └── data/
│       ├── overworld_zones.json            # zone bounds, music, weather per area
│       ├── warp_table.json                 # overworld warps + interior return points
│       ├── overworld_placement.json        # original map ID → bounding rect in overworld
│       ├── tileset_registry.json           # tileset name → firstgid, file path, tile count
│       ├── tile_anims.json                 # animated tile frame sequences + timing
│       └── door_anims.json                 # door animation metadata (32 door types)
│
├── src/                                    # TypeScript game source
│   ├── main.ts                             # creates Pixi Application, instantiates Game
│   ├── Game.ts                             # top-level state machine & update loop
│   │
│   ├── core/                               # engine-level systems
│   │   ├── Input.ts                        # keyboard polling, key state, key events
│   │   ├── Camera.ts                       # viewport position, zoom, follow, bounds clamping
│   │   ├── AssetLoader.ts                  # wraps Pixi Assets API for tilesets, sprites, JSON
│   │   ├── ScreenManager.ts               # resolution presets, fullscreen, resize handling
│   │   ├── TransitionEffect.ts            # fade to black/white, configurable duration + color
│   │   └── DebugOverlay.ts                # F3 debug modes: collision, zones, tile IDs, tooltip
│   │
│   ├── world/                              # overworld-specific systems
│   │   ├── TilemapRenderer.ts             # double-buffered CompositeTilemap, texture merging
│   │   ├── MapData.ts                      # parsed Tiled JSON: tiles, collision, behavior, warps
│   │   ├── MapManager.ts                   # loads overworld + interiors, handles transitions
│   │   ├── CollisionMap.ts                # passability grid + behavior queries
│   │   ├── WarpSystem.ts                  # behavior-based warp detection (matches GBA logic)
│   │   ├── ZoneSystem.ts                  # tracks which zone player is in, fires change events
│   │   ├── TileAnimator.ts               # animated tiles via canvas pixel blitting
│   │   └── DoorAnimator.ts               # door open/close overlay sprites
│   │
│   ├── entities/                           # game objects that exist in the world
│   │   ├── Player.ts                       # sprite, grid position, direction, animation state
│   │   └── PlayerController.ts            # grid movement, collision, ledge jumps
│   │
│   ├── effects/                            # visual field effects
│   │   ├── GrassEffect.ts                 # tall grass stepping overlay animation
│   │   └── LandingDustEffect.ts           # dust puff on ledge landing
│   │
│   ├── utils/                              # shared utilities
│   │   ├── Direction.ts                   # direction deltas, opposite directions
│   │   ├── EventEmitter.ts               # simple typed pub/sub
│   │   └── TileCoords.ts                 # pixel ↔ tile coordinate helpers, TILE_SIZE = 16
│   │
│   └── types/                              # TypeScript type definitions
│       ├── tiled.ts                        # Tiled JSON format types (TiledMap, TiledLayer, etc.)
│       └── game.ts                        # Direction, GameState, Zone, Warp, WarpEvent, etc.
│
└── docs/
    ├── TECH_SPEC.md                       # this document
    └── TESTING_TOOLKIT.md                 # the 4 validation tools
```

---

## 5. Data Pipeline

### Overview

```
pret/pokefirered (decomp repo)
        │
        ▼
┌─────────────────────────────────────────────────┐
│  Python Extraction Pipeline                      │
│                                                  │
│  01. Render metatile atlases (tiles + palettes)  │
│  02. Extract all map layouts (map.bin → JSON)    │
│  03. Extract map headers (connections, types)    │
│  04. Extract warps (events.json → warp data)     │
│  05. Extract collision (metatile attributes)     │
│  06. Stitch overworld (BFS + tile pasting)       │
│  07. Export interiors (indoor maps → Tiled JSON) │
│  08. Extract sprites (player spritesheets)       │
│  09. Extract tile animations (water, flowers)    │
│  10. Extract door animations (open/close)        │
│                                                  │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
              public/ directory
         (Tiled JSONs + PNGs + data JSONs)
                     │
                     ▼
         PixiJS application loads at runtime
```

### Script Specifications

#### 01_render_metatile_atlases.py

The foundation script. Without correct atlases, nothing renders.

**Input per tileset:**
- `data/tilesets/{primary|secondary}/{name}/tiles.png` — indexed 8×8 tile spritesheet
- `data/tilesets/{primary|secondary}/{name}/palettes/00.pal` through `15.pal` — JASC-PAL text format
- `data/tilesets/{primary|secondary}/{name}/metatiles.bin` — 16 bytes per metatile

**Process:**
1. Load `tiles.png` as indexed image (4bpp — each pixel is a palette index 0–15)
2. Parse all 16 palette files: JASC-PAL text format (header `JASC-PAL\n0100\n16\n` then 16 lines of `R G B` decimal 0-255)
3. Parse `metatiles.bin`: each metatile is 8 tile references × 2 bytes = 16 bytes
4. For each metatile:
   a. Read 8 tile references (4 bottom layer + 4 top layer)
   b. Each reference: bits 0–9 = tile index, bit 10 = flipX, bit 11 = flipY, bits 12–15 = palette
   c. For each tile reference, look up the 8×8 tile in tiles.png
   d. Apply the specified palette (replace index 0–15 with RGB, index 0 = transparent)
   e. Apply flipX/flipY
   f. Composite the 4 tiles into a 16×16 metatile image (TL, TR, BL, BR quadrants)
5. Render bottom layer metatiles and top layer metatiles separately
6. Stitch all metatiles into a grid atlas PNG (e.g., 16 metatiles per row)
7. Generate a Tiled tileset JSON (`.tsj`) referencing the atlas

**Output per tileset:**
- `{name}.png` — atlas of all pre-rendered 16×16 metatiles
- `{name}.tsj` — Tiled tileset definition

**JASC-PAL palette format:**
```python
def parse_jasc_pal(filepath: str) -> list[tuple[int, int, int, int]]:
    """Parse JASC-PAL text file → list of 16 RGBA tuples."""
    lines = open(filepath).read().strip().splitlines()
    # lines[0] = 'JASC-PAL', lines[1] = '0100', lines[2] = '16'
    colors = []
    for i, line in enumerate(lines[3:3+16]):
        r, g, b = [int(x) for x in line.split()]
        a = 0 if i == 0 else 255  # index 0 is always transparent
        colors.append((r, g, b, a))
    return colors
```

> **Note:** The decomp palette files use JASC-PAL text format (`.pal`), NOT raw GBA binary (`.gbapal`). The original GBA ROMs use 15-bit BGR binary palettes, but the decompilation project converts them to human-readable JASC-PAL text.

**Metatile reference format:**
```python
def parse_tile_ref(value: int) -> dict:
    """Parse 16-bit metatile tile reference."""
    return {
        'tileIndex': value & 0x3FF,
        'flipX': bool(value & 0x400),
        'flipY': bool(value & 0x800),
        'paletteIndex': (value >> 12) & 0xF
    }
```

#### 02_extract_layouts.py

**Input per map:** `data/layouts/{name}/map.bin` + layout config (dimensions, tileset refs)

**map.bin format (FireRed):** 2 bytes per tile, little-endian:
- Bits 0–9: metatile ID (0–1023)
- Bits 10–11: collision (0 = passable, 1–3 = impassable)
- Bits 12–15: elevation (0–15)

**Output per map:** intermediate JSON with tile array, dimensions, tileset refs

#### 03_extract_map_headers.py

**Input:** `src/data/map_headers.h`, `include/constants/maps.h`, generated map group files

**Output:** JSON with per-map: layout reference, connections (direction, target map, offset), mapType, music, weather

#### 04_extract_warps.py

**Input:** `data/maps/*/events.json` (or `.inc` files parsed from assembly)

**Output:** JSON with per-map array of warps: x, y, destMap, destWarpId

#### 05_extract_collision.py

**Input:** `data/tilesets/*/metatile_attributes.bin` — 4 bytes per metatile (FireRed)

**FireRed attribute format:**
- Bits 0–8: behavior (MB_NORMAL, MB_IMPASSABLE, MB_WATER, etc.)
- Bits 9–13: terrain type
- Bits 24–26: encounter type
- Bits 29–30: layer type

**Output:** Per-tileset JSON mapping metatile ID → passability boolean + behavior enum

#### 06_stitch_overworld.py

**Input:** All outputs from scripts 02–05

**Process:**
1. Filter to outdoor maps only (MAP_TYPE_TOWN, MAP_TYPE_CITY, MAP_TYPE_ROUTE, MAP_TYPE_OCEAN_ROUTE)
2. BFS from MAP_PALLET_TOWN, following connections to compute absolute (x, y) position of every outdoor map
3. Build tileset registry: assign firstgid ranges (512 per tileset) for all tilesets used by outdoor maps
4. Allocate tile grids sized to bounding box of all placed maps + padding
5. For each placed map, paste its tiles into the grids, remapping metatile IDs to global GIDs (localId + firstgid offset)
6. Build collision grid from metatile attributes
7. Build zone array from placed map positions + header properties
8. Adjust warp coordinates: local warp positions + map absolute offset = overworld coordinates
9. Compute interior return points: for each interior map's exit warps, record the overworld return position
10. Output Tiled JSON + zone data + warp table

**Output:**
- `public/maps/overworld.json` — Tiled JSON with layers: bottom, top, collision, warps (objects), zones (objects)
- `public/data/overworld_zones.json` — zone definitions for runtime lookup
- `public/data/warp_table.json` — overworld warp coords + interior return mappings
- `public/data/overworld_placement.json` — debug: original map ID → bounding rect in overworld
- `public/data/tileset_registry.json` — tileset name → firstgid, file path

#### 07_export_interiors.py

**Input:** All non-outdoor map layouts + their warps

**Process:** Convert each indoor/cave map to a standalone Tiled JSON with its own tileset references, collision layer, and warp objects. Interior exit warps reference overworld coordinates from the return point table.

**Output:** `public/maps/interiors/*.json` and `public/maps/dungeons/*.json`

#### 08_extract_sprites.py

**Input:** `graphics/object_events/pics/people/` + `src/data/object_events/object_event_graphics_info.h`

**Output:**
- `public/sprites/player_male.png` — organized spritesheet
- `public/sprites/player_female.png`
- `public/sprites/player.json` — frame rects and animation definitions

---

## 6. Engine Architecture

### State Machine

```
Game
 ├── state: 'booting' | 'playing' | 'transitioning'
 │
 ├── 'booting'
 │    └── AssetLoader loads overworld.json, tilesets, player sprite
 │        → transitions to 'playing'
 │
 ├── 'playing'
 │    ├── PlayerController reads input, moves player
 │    ├── Camera follows player
 │    ├── WarpSystem checks for warp triggers
 │    ├── ZoneSystem checks for zone changes
 │    ├── GrassEffect + LandingDustEffect run field effects
 │    ├── TileAnimator ticks animated tiles
 │    ├── TilemapRenderer renders visible viewport
 │    └── DebugOverlay renders F3 debug modes
 │
 └── 'transitioning'
      ├── TransitionEffect runs fade animation
      ├── DoorAnimator plays door open/close sequences
      ├── MapManager swaps overworld ↔ interior
      └── auto-transitions to 'playing' when complete
```

### Pixi Scene Graph

```
app.stage
 └── worldContainer                    # Camera moves this container
      ├── bottomTilemap[0,1]           # CompositeTilemap — double-buffered ground layer
      ├── entityContainer              # Container (sortableChildren) — player, grass, dust, doors
      │    ├── playerSprite            # Sprite — player character
      │    ├── grassSprites            # Sprite[] — active grass overlay animations
      │    ├── dustSprites             # Sprite[] — landing dust animations
      │    └── doorSprites             # Sprite[] — door open/close overlays
      ├── topTilemap[0,1]             # CompositeTilemap — double-buffered overhead layer
      └── debugOverlay                 # Container — collision/zone/tile ID overlays (F3)

 └── uiContainer                       # Fixed to screen (not affected by camera)
      ├── transitionOverlay            # Graphics — full-screen fade rect (black or white)
      ├── zoneNameText                 # Text — "Pallet Town" popup
      └── debugTooltip                 # Text — tile info on mouse hover
```

### System Dependencies

```
Input ─────────────────────────────────────────────────┐
                        │                              │
                        ▼                              ▼
              PlayerController                   DebugOverlay
                   │    │
                   │    ▼
                   │  CollisionMap ◄──── MapData
                   │                      ▲
                   ▼                      │
              WarpSystem                  │
                   │                      │
                   ▼                      │
              MapManager ─────────────────┘
                   │
                   ▼
           TilemapRenderer ◄──── Camera
                   │
                   ▼
           TileAnimator (mutates atlas textures in-place)
```

---

## 7. Core Systems Specification

### 7.1 Game.ts — Main Loop

```typescript
class Game {
  private app: Application;
  private state: GameState = 'booting';

  // Core
  private input: Input;
  private camera: Camera;
  private screenManager: ScreenManager;
  private transition: TransitionEffect;
  private debugOverlay: DebugOverlay;

  // World
  private worldContainer: Container;
  private tilemapRenderer: TilemapRenderer;
  private mapManager: MapManager;
  private collisionMap: CollisionMap;
  private warpSystem: WarpSystem;
  private zoneSystem: ZoneSystem;
  private tileAnimator: TileAnimator;
  private doorAnimator: DoorAnimator;

  // Entities
  private player: Player;
  private playerController: PlayerController;

  // Effects
  private grassEffect: GrassEffect;
  private landingDust: LandingDustEffect;

  async init(): Promise<void>;  // create Pixi app, load assets, start loop
  private update(): void;       // called every frame by app.ticker
}
```

### 7.2 Input.ts

Polls keyboard state every frame. Supports both arrow keys and WASD. Provides direction queries and key event callbacks.

```typescript
class Input {
  isDown(key: string): boolean;
  justPressed(key: string): boolean;
  justReleased(key: string): boolean;
  getDirection(): Direction | null;    // returns first held arrow/WASD direction
  isRunning(): boolean;                // shift key held
  onKeyDown(key: string, callback: () => void): void;
  poll(): void;                        // called once per frame to update state
}
```

### 7.3 Camera.ts

Controls the `worldContainer` position and scale. Supports smooth follow, instant snap, and manual pan.

```typescript
class Camera {
  x: number;                           // world-space position of viewport center
  y: number;

  setZoom(scale: number): void;        // integer zoom (1-6), sets worldContainer.scale
  follow(target: { x: number; y: number }, lerp?: number): void;
  stopFollow(): void;
  panTo(x: number, y: number): void;   // instant move
  clampToBounds(mapW: number, mapH: number): void;
  update(): void;                       // apply lerp follow + bounds clamping
  screenToWorld(sx: number, sy: number): { x: number; y: number };
  worldToScreen(wx: number, wy: number): { x: number; y: number };
}
```

### 7.4 TilemapRenderer.ts

Renders visible tiles using `@pixi/tilemap` CompositeTilemap with double-buffering. Handles viewport culling for large maps and texture source merging (stacking atlas textures vertically to fit within CompositeTilemap's 16-source limit).

```typescript
class TilemapRenderer {
  // Double-buffered tilemaps (swap to avoid flash)
  private buffers: Array<{ bottom: CompositeTilemap; top: CompositeTilemap }>;
  private activeBuffer: number;
  readonly entityLayer: Container;

  // Tile texture lookup: global GID → Pixi Texture
  private tileTextures: Map<number, Texture>;

  loadMap(mapData: MapData, tileTextures: Map<number, Texture>): void;
  renderViewport(cameraX: number, cameraY: number, viewW: number, viewH: number): void;
  getMergedSourceInfo(original: TextureSource): MergedSourceInfo | undefined;
  refreshAll(): void;                        // force re-render on next frame
}
```

**Viewport culling:** Only tiles within the camera view + 2-tile buffer are rendered. Viewport bounds are memoized — re-render only occurs when the visible tile range changes.

**Texture merging:** When a map uses more than 16 tileset sources, pairs of atlas textures are composited vertically into shared canvases. Tile UV coordinates are adjusted by the merge offset.

### 7.5 MapData.ts

Runtime representation of a loaded Tiled JSON map. Provides read access for rendering, collision, behavior, warps, and zones.

```typescript
class MapData {
  readonly id: string;
  readonly width: number;
  readonly height: number;

  // Tile layers (flat typed arrays, row-major, GID values)
  bottomTiles: Uint32Array;
  topTiles: Uint32Array;
  collisionGrid: Uint8Array;
  behaviorGrid: Uint16Array;

  // Tileset metadata (parallel arrays)
  tilesetFirstGids: number[];
  tilesetSources: string[];

  // Object layers
  warps: Warp[];
  zones: Zone[];

  // Read
  getBottomTile(x: number, y: number): number;
  getTopTile(x: number, y: number): number;
  isPassable(x: number, y: number): boolean;
  getBehavior(x: number, y: number): number;
  getWarpAt(x: number, y: number): Warp | null;
  getZoneAt(x: number, y: number): Zone | null;

  // Serialization
  static fromTiledJSON(json: TiledMap, id?: string): MapData;
}
```

### 7.6 MapManager.ts

Manages which map is currently active and handles transitions.

```typescript
class MapManager {
  private overworldData: MapData;
  private currentInterior: MapData | null = null;
  private activeMode: 'overworld' | 'interior' = 'overworld';
  private warpTable: WarpTable;
  private interiorReturnPoints: Map<string, ReturnPoint[]>;

  async init(): Promise<void>;             // load overworld + zones + warp table
  getActiveMap(): MapData;                 // returns overworld or current interior
  getActiveMode(): 'overworld' | 'interior';

  // Transitions
  async enterInterior(overworldX: number, overworldY: number): Promise<void>;
  async exitToOverworld(interiorId: string, warpId: number): Promise<void>;

  // Collision proxy (delegates to active map)
  isPassable(x: number, y: number): boolean;
}
```

### 7.7 PlayerController.ts

Grid-locked movement with smooth interpolation.

```typescript
class PlayerController {
  // Movement parameters
  static readonly WALK_FRAMES = 12;    // frames to traverse one tile walking
  static readonly RUN_FRAMES = 7;      // frames to traverse one tile running

  private state: 'idle' | 'moving' = 'idle';
  private moveProgress: number = 0;    // 0 to 1
  private startPos: { x: number; y: number };
  private targetPos: { x: number; y: number };

  update(): void;

  // Movement flow:
  // 1. If idle and direction pressed: face that direction
  // 2. Check collision at target tile
  // 3. If passable: start moving (interpolate over N frames)
  // 4. On arrival: snap to grid, check warp, check if direction still held
  // 5. If direction held: immediately start next step (no 1-frame idle gap)
}
```

### 7.8 WarpSystem.ts

Checks player position against warp table on each completed step.

```typescript
class WarpSystem {
  check(tileX: number, tileY: number): void;

  // On overworld: look up (tileX, tileY) in overworld warps → enter interior
  // In interior: look up (tileX, tileY) in current interior's warps → exit to overworld
  // Triggers MapManager.enterInterior() or MapManager.exitToOverworld()
}
```

### 7.9 ZoneSystem.ts

Tracks which zone the player occupies and emits events on change.

```typescript
class ZoneSystem {
  private currentZone: Zone | null = null;
  readonly onZoneChange: EventEmitter<{ from: Zone | null; to: Zone | null }>;

  update(tileX: number, tileY: number): void;
  getCurrentZone(): Zone | null;

  // On zone change:
  // - Emit event (audio manager listens for music changes)
  // - Show/hide map name popup
  // - Swap active encounter table (future)
}
```

---

## 8. Data Formats

### 9.1 Tiled JSON Map (overworld.json)

```typescript
interface TiledMap {
  width: number;                    // map width in tiles
  height: number;                   // map height in tiles
  tilewidth: 16;                    // always 16
  tileheight: 16;                   // always 16
  orientation: 'orthogonal';
  renderorder: 'right-down';
  infinite: false;
  compressionlevel: -1;

  layers: TiledLayer[];
  tilesets: TiledTilesetRef[];
  properties?: TiledProperty[];
}

interface TiledTileLayer {
  name: string;                     // 'bottom', 'top', 'collision'
  type: 'tilelayer';
  width: number;
  height: number;
  data: number[];                   // flat array of GIDs (1-indexed, 0 = empty)
  visible: boolean;
  opacity: number;
  x: 0;
  y: 0;
}

interface TiledObjectLayer {
  name: string;                     // 'warps', 'zones'
  type: 'objectgroup';
  objects: TiledObject[];
}

interface TiledObject {
  id: number;
  name: string;
  type: string;                     // 'warp', 'zone'
  x: number;                       // pixel coordinates
  y: number;
  width: number;
  height: number;
  properties?: TiledProperty[];
}

interface TiledTilesetRef {
  firstgid: number;
  source: string;                   // relative path to .tsj file
}

interface TiledProperty {
  name: string;
  type: 'string' | 'int' | 'float' | 'bool';
  value: string | number | boolean;
}
```

### 9.2 Warp Table (warp_table.json)

```typescript
interface WarpTable {
  overworldWarps: OverworldWarp[];
  interiorReturns: Record<string, InteriorReturn[]>;
}

interface OverworldWarp {
  overworldX: number;               // tile coords in the overworld
  overworldY: number;
  destMap: string;                  // interior map filename (no path)
  destWarpId: number;               // which warp point in the destination
}

interface InteriorReturn {
  warpId: number;                   // warp index inside the interior map
  returnX: number;                  // overworld tile coords to return to
  returnY: number;
}
```

### 9.3 Zone Definitions (overworld_zones.json)

```typescript
interface ZoneFile {
  zones: Zone[];
}

interface Zone {
  id: string;                       // 'PALLET_TOWN', 'ROUTE_1', etc.
  name: string;                     // display name: 'Pallet Town'
  bounds: { x: number; y: number; width: number; height: number };  // tile coords
  music: string;                    // music track ID (resolved in phase 2)
  weather: string;                  // weather type (resolved in phase 2)
  mapType: string;                  // 'town', 'city', 'route', etc.
  showNameOnEntry: boolean;         // show "Pallet Town" popup on entry
  encounterTable?: string;          // ref to encounter data (phase 2)
}
```

### 9.4 Player Animation (player.json)

```typescript
interface PlayerSpriteData {
  spritesheet: string;              // filename
  frameWidth: number;               // pixels
  frameHeight: number;

  animations: Record<string, {
    frames: number[];               // frame indices into spritesheet
    frameDuration: number;          // ticks per frame (60fps base)
    loop: boolean;
  }>;
}

// Animation names: idle_down, idle_up, idle_left, idle_right,
//                  walk_down, walk_up, walk_left, walk_right,
//                  run_down, run_up, run_left, run_right
```

---

## 9. Build & Dev Workflow

### Initial Setup

```bash
# Clone the project
git clone <repo-url> kanto
cd kanto

# Clone the decomp (required for extraction)
git clone https://github.com/pret/pokefirered.git decomp

# Install Node dependencies
npm install

# Install Python dependencies
pip install -r scripts/requirements.txt

# Run extraction pipeline
python scripts/extract_all.py

# Start dev server
npm run dev
```

### package.json Scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "extract": "python3 scripts/extract_all.py",
    "extract:tilesets": "python3 scripts/01_render_metatile_atlases.py",
    "extract:stitch": "python3 scripts/06_stitch_overworld.py",
    "test": "python3 scripts/tests/run_all.py",
    "test:extraction": "python3 scripts/tests/validate_extraction.py",
    "test:stitch": "python3 scripts/tests/validate_stitch.py",
    "test:traversal": "python3 scripts/tests/validate_traversal.py",
    "test:warps": "python3 scripts/tests/validate_warps.py",
    "test:browser": "node scripts/tests/browser_test.mjs",
    "typecheck": "tsc --noEmit"
  }
}
```

### vite.config.ts

```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 3000,
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    assetsInlineLimit: 0,      // never inline assets — keep PNGs as files
  },
  // Ensure .json files in public/ aren't bundled, just served
});
```

### index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kanto</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; overflow: hidden; }
    #game-container {
      width: 100vw;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      image-rendering: pixelated;
    }
    #game-container canvas {
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    }
  </style>
</head>
<body>
  <div id="game-container"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

---

## 10. Phase 1 Sprint Plan

### Sprint 1: Extraction Pipeline (Day 1–3)

| Task | Script | Estimated Hours |
|------|--------|----------------|
| Palette parser + tile renderer | 01_render_metatile_atlases.py | 4–6h |
| Test: render one tileset, verify visually | — | 1h |
| Render ALL tilesets | 01 (batch run) | 1h |
| Map layout extractor | 02_extract_layouts.py | 2–3h |
| Map header/connection extractor | 03_extract_map_headers.py | 2–3h |
| Warp extractor | 04_extract_warps.py | 1–2h |
| Collision attribute extractor | 05_extract_collision.py | 1–2h |
| **Run validate_extraction.py — fix any errors** | **scripts/tests/** | **1h** |
| Overworld stitcher | 06_stitch_overworld.py | 4–6h |
| Interior map exporter | 07_export_interiors.py | 2–3h |
| Player sprite extractor | 08_extract_sprites.py | 1–2h |
| **Run validate_stitch + validate_traversal + validate_warps — fix any errors** | **scripts/tests/** | **1–2h** |

**Sprint 1 deliverable:** `public/` directory fully populated with overworld.json, all interior maps, all tilesets, player sprite, and data JSONs. All four validators pass.

### Sprint 2: Engine Scaffold + Rendering (Day 4–6)

| Task | Files | Estimated Hours |
|------|-------|----------------|
| Vite + TypeScript + PixiJS project setup | package.json, vite.config, tsconfig | 1h |
| main.ts + Game.ts shell | main.ts, Game.ts | 1h |
| AssetLoader: load overworld + one tileset | core/AssetLoader.ts | 2h |
| TilesetRegistry: parse tileset refs, build GID→Texture map | data/TilesetRegistry.ts | 2–3h |
| TilemapRenderer: render bottom layer of overworld | world/TilemapRenderer.ts | 3–4h |
| ViewportCuller: only render visible tiles | world/ViewportCuller.ts | 1–2h |
| Camera: zoom + manual pan (no follow yet) | core/Camera.ts | 1–2h |
| Top layer rendering | TilemapRenderer.ts | 1h |
| Verify: Pallet Town area renders correctly at 4× | — | 1h |

**Sprint 2 deliverable:** Browser shows the stitched overworld rendered correctly. Pan around with arrow keys. Both tile layers visible.

### Sprint 3: Player Movement + Collision (Day 7–9)

| Task | Files | Estimated Hours |
|------|-------|----------------|
| Input system | core/Input.ts | 1–2h |
| Player entity + sprite loading | entities/Player.ts | 2–3h |
| Direction + GridMovement utilities | utils/Direction.ts, utils/GridMovement.ts | 1h |
| PlayerController: grid movement + interpolation | entities/PlayerController.ts | 3–4h |
| CollisionMap: parse collision layer, passability checks | world/CollisionMap.ts | 2h |
| Camera follow with lerp | Camera.ts update | 1h |
| ScreenManager: scaling, resize handling | core/ScreenManager.ts | 1–2h |
| Verify: walk around, collision works, camera follows | — | 2h |

**Sprint 3 deliverable:** Player walks around the overworld. Collision prevents walking through walls. Camera follows smoothly. Walk + run + idle animations play.

### Sprint 4: Warps + Interiors (Day 10–12)

| Task | Files | Estimated Hours |
|------|-------|----------------|
| WarpRegistry: load warp table | data/WarpRegistry.ts | 1h |
| WarpSystem: detect warp on step | world/WarpSystem.ts | 2h |
| TransitionEffect: fade to black/white | core/TransitionEffect.ts | 1–2h |
| MapManager: load interior, swap active map | world/MapManager.ts | 3–4h |
| Interior → overworld return flow | MapManager.ts | 2h |
| ZoneRegistry + ZoneSystem: zone detection, events | data/ZoneRegistry.ts, world/ZoneSystem.ts | 2–3h |
| Zone name popup on entry | Game.ts | 1h |
| AudioManager stub (logs music changes, no playback) | core/AudioManager.ts | 30min |
| Verify: enter/exit buildings, zone names show | — | 2h |

**Sprint 4 deliverable:** Player can enter every building in Pallet Town, walk around inside, exit back to the correct overworld position. Zone name displays when entering a new area.

### Sprint 5: Effects + Animations (Day 13–15)

| Task | Files | Estimated Hours |
|------|-------|----------------|
| Tile animation extractor | 09_extract_tile_anims.py | 3h |
| Door animation extractor | 10_extract_door_anims.py | 2h |
| TileAnimator: canvas pixel blitting | world/TileAnimator.ts | 3-4h |
| DoorAnimator: open/close overlay | world/DoorAnimator.ts | 3-4h |
| GrassEffect: tall grass stepping | effects/GrassEffect.ts | 2-3h |
| LandingDustEffect: ledge landing | effects/LandingDustEffect.ts | 1-2h |
| Ledge jump detection in PlayerController | entities/PlayerController.ts | 2-3h |
| Door warp sequence in Game.ts | Game.ts | 2-3h |
| Verify: grass animates, doors animate, ledges jump | -- | 2h |

**Sprint 5 deliverable:** Water and flowers animate. Doors play open/close sequences. Grass rustles when stepped on. Ledge jumps work with parabolic arcs and landing dust.

### Sprint 6: Polish + Full World Verification (Day 16–18)

| Task | Files | Estimated Hours |
|------|-------|----------------|
| **Run `run_all.py` -- fix all failures** | **scripts/tests/** | **2-3h** |
| Walk the entire overworld: verify all maps stitched correctly | -- | 3-4h |
| Fix tile rendering issues (wrong palette, missing tiles, misaligned) | -- | 2-4h |
| Fix collision issues (walkable walls, blocked open areas) | -- | 2h |
| Fix warp issues (wrong destinations, missing return points) | -- | 2h |
| **Implement debug API (`window.__gameDebug`)** | **Game.ts** | **1h** |
| Debug overlay: tile IDs, collision grid, zone borders, tooltip | DebugOverlay.ts | 2h |
| Screen scaling options (1x-6x, fit, fullscreen) | ScreenManager.ts | 1-2h |
| **Final `run_all.py` -- confirm PASS** | **scripts/tests/** | **30min** |

**Sprint 6 deliverable:** Phase 1 complete. Full Kanto overworld traversable. Every building enterable. Maps editable in Tiled. All validators pass.

---

## 11. Testing & Agent Verification

### Principle

If the data is correct, the rendering is correct. Test data and logic, not pixels. Four Python validators for the data pipeline. An agent runs `python scripts/tests/run_all.py` after any change and gets a clear PASS/FAIL with specific error messages. No human needed for verification.

### Tool 1: `scripts/tests/validate_extraction.py`

Run after any extraction script. Checks structural integrity of all extracted data.

**Checks:**
- Every tileset atlas PNG exists, dimensions divisible by 16, TSJ tilecount matches atlas capacity
- Every layout has tile count == width × height, all metatile IDs in range 0–1023
- All map connections are reciprocal (A→NORTH→B implies B→SOUTH→A)
- All warp positions are within their map's bounds
- Warp destination maps exist in the extracted data
- Player sprite files exist

**Output:** PASS/FAIL + list of specific errors

### Tool 2: `scripts/tests/validate_stitch.py`

Run after the overworld stitcher. Checks the assembled overworld is structurally sound.

**Checks:**
- Required Tiled layers exist: bottom, top, collision, warps, zones
- All tile layer data arrays have length == width × height
- No two placed maps overlap (occupy the same tile coordinates)
- Every placed map has non-zero tile data in the overworld (not all empty)
- Every placed map has a corresponding zone definition
- Every warp destination has an existing interior/dungeon map file
- All warp coordinates are within overworld bounds
- All referenced tileset source files exist on disk

**Output:** PASS/FAIL + list of specific errors

### Tool 3: `scripts/tests/validate_traversal.py`

Run after stitching. Flood-fills from Pallet Town to verify all towns are reachable.

**Algorithm:**
1. Parse the overworld collision layer into a passability grid
2. Find Pallet Town's center coordinates from zone data
3. BFS flood-fill across all passable tiles from that starting point
4. For each reachable warp tile, follow the warp through its interior (using interior return points) and continue flood-filling from the return position on the overworld
5. Check that every town/city zone has reachable passable tiles

**Catches:** Disconnected map regions, accidentally sealed passages, broken warp chains that prevent reaching areas beyond an interior (e.g., a gatehouse between two routes)

**Output:** Reachable tile count + percentage, PASS/FAIL per zone, list of unreachable zones

### Tool 4: `scripts/tests/validate_warps.py`

Run after stitching. Verifies every door can be entered and exited.

**Checks:**
- Every overworld warp destination has at least one return point (no traps)
- Every interior with return points has at least one overworld warp leading to it (no orphans)
- Every warp destination file exists and is valid JSON with width, height, and layers
- No warp points to a file that can't be parsed

**Output:** PASS/FAIL + list of traps, orphans, and missing files

### Master Runner: `scripts/tests/run_all.py`

Executes all four Python validators in sequence. Prints a summary table. Exits with code 0 (all pass) or 1 (any failure). Designed for CI or agent automation.

```
$ python scripts/tests/run_all.py

==================================================
KANTO — VERIFICATION SUITE
==================================================

[1/4] Extraction integrity...
PASS: 0 errors

[2/4] Overworld stitch...
PASS: 0 errors

[3/4] Traversability...
Reachable: 48392/52100 passable tiles (93%)
PASS: 0 errors

[4/4] Warp consistency...
PASS: 0 errors

==================================================
OVERALL: PASS
  ✓ extraction
  ✓ stitch
  ✓ traversal
  ✓ warps
==================================================
```

### When to Run

| After... | Run... |
|----------|--------|
| Any extraction script | `validate_extraction.py` |
| Overworld stitcher | `validate_stitch.py` + `validate_traversal.py` + `validate_warps.py` |
| Any change at all | `run_all.py` |

### Debug API for Runtime Inspection

In development mode, the Game exposes a debug interface on `window.__gameDebug` for programmatic inspection:

```typescript
// Available in dev mode only (import.meta.env.DEV)
interface GameDebugAPI {
  getPlayerPosition(): { x: number; y: number };
  getActiveMapId(): string;
  teleportPlayer(x: number, y: number): void;
  simulateInput(direction: string): void;
  tickFrames(n: number): void;
  getCollisionAt(x: number, y: number): boolean;
  getZoneAt(x: number, y: number): Zone | null;
  getWarpAt(x: number, y: number): Warp | null;
  getMapDimensions(): { width: number; height: number };
}
```

This allows agents to programmatically query game state, teleport the player, and verify behavior without UI interaction.

---

## 12. Future Phase Hooks

The phase 1 architecture explicitly supports these future features without refactoring:

### Phase 2: NPCs & Dialogue

**Hook:** `entityContainer` in the scene graph accepts any number of sprites. `AnimatedEntity` base class provides grid position + animation. `GridMovement` utility is shared with player.

**What to build:** `NPC.ts` extends `AnimatedEntity`. `NPCController.ts` reads from schedule data. `Pathfinder.ts` runs A* over `CollisionMap`. `DialogueSystem.ts` renders text boxes as HTML overlays. `ScriptInterpreter.ts` executes the decomp's event scripting commands from JSON.

### Phase 3: Day/Night + Weather

**Hook:** `worldContainer` is the parent of all world rendering. A `ColorMatrixFilter` applied to it tints the entire world. `ZoneSystem` already tracks weather per zone.

**What to build:** `TimeSystem.ts` manages game clock. `DayNightFilter.ts` applies palette shifts. `WeatherRenderer.ts` adds particle effects (rain, snow) in a container above `topTilemap`.

### Phase 4: NPC Schedules & Routines

**Hook:** `ZoneSystem` provides area awareness. `Pathfinder` provides cross-map pathfinding. `TimeSystem` provides schedule triggers.

**What to build:** `NPCSchedule.ts` data format. `ScheduleController.ts` evaluates schedule against current time, fast-forwards NPC positions on map load.

### Phase 5: Pokémon Data & Encounters

**Hook:** `ZoneSystem` already references encounter tables. Encounter data is extracted by the pipeline (parse_encounters.py). Extracted species/moves/items data is in JSON.

**What to build:** `EncounterSystem.ts` triggers on grass/water tiles. `BattleScene.ts` — a separate rendering context that swaps out the overworld. `PokemonData.ts` loads species/moves/items JSON. `Party.ts` manages the player's team.

### Phase 6: Battle Engine

**Hook:** Game state machine already has a 'transitioning' state. Battle is just another state that renders to the same Pixi stage with different content.

**What to build:** `BattleScene.ts`, `BattleState.ts`, `DamageCalc.ts`, `MoveEffect.ts`, `BattleAI.ts`, `BattleUI.ts`. The decomp's `src/battle_script_commands.c` and `src/battle_util.c` serve as line-by-line specification.

### Phase 7: Menus (Party, Bag, Pokedex)

**Hook:** HTML overlay system works for game UI. Menus are HTML/CSS panels that pause the game loop while open.

**What to build:** `PartyMenu.ts`, `BagMenu.ts`, `PokedexMenu.ts`, `SummaryScreen.ts`, `SettingsMenu.ts`.

### Phase 8: Overworld Expansion

**Hook:** Tiled desktop editor. The entire expansion workflow — resize the overworld, paint new terrain, add buildings, place NPCs — uses Tiled to edit map files directly. New tilesets are added by creating atlas PNGs in Aseprite and registering them in the tileset registry.

### Phase 9: Audio

**Hook:** `AudioManager` is stubbed. `ZoneSystem` already fires zone change events with music track IDs.

**What to build:** Convert decomp music to OGG via M4A→MIDI→soundfont rendering. Load via Howler.js. Crossfade on zone transitions.

### Phase 10: Save System

**Hook:** All game state is in typed objects (player position, party, flags, inventory) that can be serialized to JSON.

**What to build:** `SaveManager.ts` serializes game state to JSON, stores in localStorage or IndexedDB. Multiple save slots. Autosave on zone transitions.

---

## 13. Appendix: GBA Binary Format Reference

### Palette (.pal — JASC-PAL text format)
- Text file, NOT binary
- Header: `JASC-PAL\n0100\n16\n`
- Followed by 16 lines of `R G B` (decimal 0-255)
- Color index 0 is always transparent
- Original GBA format was 32 bytes binary (15-bit BGR), but the decomp converts to JASC-PAL

### Metatile Definition (metatiles.bin)
- 16 bytes per metatile
- 8 tile references × 2 bytes each (little-endian)
- First 4 refs = bottom layer (TL, TR, BL, BR)
- Last 4 refs = top layer (TL, TR, BL, BR)
- Each tile reference:
  - Bits 0–9: tile index in tiles.png
  - Bit 10: horizontal flip
  - Bit 11: vertical flip
  - Bits 12–15: palette index (0–15)

### Metatile Attributes (metatile_attributes.bin) — FireRed
- 4 bytes per metatile (u32, little-endian)
- Bits 0–8: behavior (e.g., 0x00 = normal, 0x01 = tall grass, etc.)
- Bits 9–13: terrain type
- Bits 24–26: encounter type
- Bits 29–30: layer type (0 = normal, 1 = covered, 2 = split)

### Map Layout (map.bin)
- 2 bytes per tile (u16, little-endian)
- Grid of width × height tiles, row-major
- Bits 0–9: metatile ID (0–1023)
- Bits 10–11: collision (0 = passable, 1–3 = impassable)
- Bits 12–15: elevation (0–15)

### Map Connection
- Direction: NORTH, SOUTH, EAST, WEST
- Target map: group + number
- Offset: signed integer, tiles along the shared edge axis

### Warp Event
- x, y: tile coordinates within the map
- Destination map: group + number
- Destination warp ID: index into destination map's warp list
