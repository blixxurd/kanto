# Kanto Open World

A browser-based open world RPG engine that renders the entire Kanto region from Pokemon FireRed, built by extracting and reassembling data from the [pret/pokefirered](https://github.com/pret/pokefirered) decompilation.

All outdoor maps are stitched into one seamless overworld. Indoor maps (houses, caves, gyms, gatehouses) load through warp transitions with GBA-accurate door animations.

![Pallet Town with NPCs](docs/screenshots/npc_oak_exclamation.png)

## Features

- **Seamless overworld** -- all towns, cities, and routes stitched into a single continuous map (~424x416 tiles)
- **NPC system** -- entities with 5 movement patterns (standing, look_around, wander, pace, mega_wander), collision blocking, and overhead icons
- **Overhead icons** -- pixel-art exclamation marks, question marks, speech bubbles, and more above NPCs/player
- **Warp system** -- behavior-based warp detection matching GBA logic, with door open/close animations and fade transitions
- **Animated tiles** -- water, flowers, and sand edges animate using the GBA's original frame data
- **Field effects** -- tall grass stepping overlay, ledge jumps with parabolic arcs and landing dust
- **Surfing** -- water traversal with bob animation and dedicated surf sprite
- **Pixel-perfect rendering** -- metatile atlases composited from raw GBA tile/palette data at native resolution
- **Grid-based movement** -- collision-aware player movement with smooth interpolation and running
- **Debug menu** -- backtick to open; teleport, sprite swap, overhead icons, surf toggle, zoom, overlay modes
- **Debug overlays** -- collision grid, zone borders, tile IDs, hover tooltip (F3 to cycle)
- **Auto-scaling** -- integer-scaled pixel art that fills any screen size
- **136 NPC sprites** -- extracted from the decomp with correct palettes

<details>
<summary>More screenshots</summary>

| Cerulean City | Vermilion City |
|---|---|
| ![Cerulean City](docs/screenshots/cerulean_city.png) | ![Vermilion City](docs/screenshots/vermilion_city.png) |

| Pewter City | Lavender Town |
|---|---|
| ![Pewter City](docs/screenshots/pewter_city.png) | ![Lavender Town](docs/screenshots/lavender_town.png) |

| Diglett's Cave |
|---|
| ![Cave](docs/screenshots/cave.png) |

</details>

## Getting Started

### Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.10+ with `pip`
- **Git** (to clone the decomp)

### 1. Clone

```bash
git clone https://github.com/YOUR_USERNAME/kanto.git
cd kanto
npm install
pip install pillow numpy
```

### 2. Get the decomp

The extraction pipeline reads from the [pret/pokefirered](https://github.com/pret/pokefirered) decompilation. Clone it into a `decomp/` directory at the project root, pinned to the tested commit:

```bash
git clone https://github.com/pret/pokefirered.git decomp
cd decomp && git checkout 7e3f822 && cd ..
```

> **Note:** This project is tested against pokefirered commit `7e3f822`. Later revisions may change data layouts or file paths and break extraction. If you use a newer version and something breaks, try checking out this commit first.

You do **not** need to build the decomp -- the extraction scripts read the raw data files directly.

### 3. Extract game data

This runs all extraction scripts to produce tileset atlases, map JSONs, collision data, warps, sprites, and tile animations:

```bash
npm run extract
```

Output goes to `public/` (Tiled JSON maps + PNG atlases + data JSONs) and `intermediate/` (working files).

### 4. Validate

```bash
npm test
```

All 4 validators should pass: extraction, stitch, traversal, warps.

### 5. Run

```bash
npm run dev
```

Open the URL shown in your terminal (usually `http://localhost:3000`). You'll spawn in Pallet Town.

### Controls

| Key | Action |
|---|---|
| Arrow keys / WASD | Move |
| Hold Shift | Run |
| Backtick (`) | Debug menu |
| F3 | Cycle debug overlays |
| F11 | Fullscreen |

## Architecture

```
pret/pokefirered (decomp/)
        |
   Python extraction scripts (scripts/01-12)
        |
   public/ (Tiled JSON maps + PNG atlases + data JSONs)
        |
   PixiJS 8 + @pixi/tilemap (src/)
        |
   Browser
```

### Extraction Pipeline

| Script | Purpose |
|---|---|
| `01_render_metatile_atlases.py` | Composite 8x8 GBA tiles + palettes into 16x16 metatile atlas PNGs |
| `02_extract_layouts.py` | Parse `map.bin` files into intermediate layout JSONs |
| `03_extract_map_headers.py` | Extract connections, map types, and properties from C headers |
| `04_extract_warps.py` | Extract warp events (source tile, destination map + warp ID) |
| `05_extract_collision.py` | Parse `metatile_attributes.bin` into passability and behavior flags |
| `06_stitch_overworld.py` | BFS from Pallet Town, assemble all outdoor maps into one overworld |
| `07_export_interiors.py` | Export indoor/cave maps as individual Tiled JSONs |
| `08_extract_sprites.py` | Extract player spritesheets + animation metadata |
| `09_extract_tile_anims.py` | Extract animated tile frames (water, flowers, sand) |
| `10_extract_door_anims.py` | Extract door animation spritesheets from GBA graphics |
| `11_extract_surf_sprites.py` | Extract surfing player sprites |
| `12_extract_npc_sprites.py` | Extract 136 NPC spritesheets with correct palettes |

### Engine (`src/`)

| Module | Purpose |
|---|---|
| `Game.ts` | State machine (`booting` / `playing` / `menu` / `transitioning`), 2x tick speed |
| `TilemapRenderer.ts` | Double-buffered hardware-accelerated tile rendering via `@pixi/tilemap` |
| `MapManager.ts` | Loads overworld + interiors, handles warp transitions |
| `MapData.ts` | Parsed Tiled JSON with tile/warp/zone/NPC read API |
| `CollisionMap.ts` | Passability grid with entity collision callback |
| `WarpSystem.ts` | Behavior-based warp detection matching GBA field_control_avatar.c |
| `DoorAnimator.ts` | Door open/close animation overlay |
| `Entity.ts` | Base class for Player/NPC with sprite, animation, and overhead icons |
| `Player.ts` | Player entity with jump arcs, surf sprite swap, shadow |
| `NPC.ts` | NPC entity with programmatic animation from spritesheets |
| `NPCController.ts` | Movement AI: standing, look_around, wander, pace, mega_wander |
| `NPCManager.ts` | NPC lifecycle: spawn, despawn, update, occupancy checks |
| `PlayerController.ts` | Grid-locked movement with running, ledge jumps |
| `TileAnimator.ts` | Animates water/flower/sand tiles by patching atlas textures |
| `GrassEffect.ts` | Tall grass stepping overlay animation |
| `LandingDustEffect.ts` | Landing dust puff on ledge jumps |
| `SurfEffect.ts` | Water surfing blob sprite with bob animation |
| `TransitionEffect.ts` | Fade to/from black or white |
| `Camera.ts` | Viewport management with follow, lerp, and bounds clamping |
| `ScreenManager.ts` | Resolution presets, fullscreen, integer zoom |
| `DebugOverlay.ts` | Collision/zone/tile ID overlays with hover tooltip |
| `MenuStack.ts` | GBA-style menu framework |
| `DebugMenu.ts` | Debug menu: teleport, sprite swap, overhead icons, surf, zoom |

### Map Format

All maps use the [Tiled JSON format](https://doc.mapeditor.org/en/stable/reference/json-map-format/). The overworld and every interior can be opened in the [Tiled](https://www.mapeditor.org/) desktop editor. NPCs are placed via `npcs` object layers with custom properties (sprite, direction, movement pattern, overhead icon).

## Tech Stack

- **[PixiJS 8](https://pixijs.com/)** + **[@pixi/tilemap](https://github.com/pixijs/tilemap)** -- WebGL tile rendering
- **TypeScript** + **[Vite](https://vitejs.dev/)** -- dev server and bundling
- **Python 3** + **Pillow** + **NumPy** -- data extraction
- **[pret/pokefirered](https://github.com/pret/pokefirered)** -- source data (decompilation)

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run extract      # Run full extraction pipeline
npm test             # Run all validators
npm run typecheck    # TypeScript type checking
npm run test:browser # Browser-based visual testing (Playwright)
```

## Project Structure

| Directory | Description |
|---|---|
| [`src/`](src/) | TypeScript game engine (PixiJS, entities, effects, UI, world systems) |
| [`src/entities/`](src/entities/) | Entity base class, Player, NPC, NPCController, NPCManager |
| [`src/effects/`](src/effects/) | Field effects (grass, dust, surf) |
| [`src/ui/`](src/ui/) | Menu system (UIPanel, UIList, UIText, MenuStack, DebugMenu) |
| [`scripts/`](scripts/) | Python extraction pipeline (12 scripts converting decomp data to game assets) |
| [`public/`](public/) | Generated game assets (maps, tilesets, sprites, data) -- do not edit manually |
| [`public/custom/`](public/custom/) | Hand-made assets (overhead icon spritesheet) |
| [`docs/`](docs/) | Technical spec, testing toolkit, and screenshots |

## License

MIT -- see [LICENSE](LICENSE).
