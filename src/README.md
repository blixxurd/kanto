# src/

TypeScript source for the PixiJS game engine.

## Entry Points

- **`main.ts`** -- App bootstrap: creates Pixi Application, initializes Game
- **`Game.ts`** -- State machine (`booting` / `playing` / `editor` / `transitioning`), main update loop, debug API

## Modules

### `core/` -- Engine foundations
- `AssetLoader.ts` -- Loads overworld JSON, tileset PNGs, sprite sheets
- `Camera.ts` -- Viewport with follow, lerp, zoom, and bounds clamping
- `Input.ts` -- Keyboard polling (arrows, WASD, shift)
- `ScreenManager.ts` -- Resolution presets, integer scaling, fullscreen
- `TransitionEffect.ts` -- Fade to/from black for warp transitions
- `DebugOverlay.ts` -- Collision grid, zone borders, tile ID overlays (F3)

### `world/` -- Map and tile systems
- `TilemapRenderer.ts` -- Hardware-accelerated tile rendering via `@pixi/tilemap`
- `MapManager.ts` -- Loads overworld + interiors, handles warp transitions
- `MapData.ts` -- Parsed Tiled JSON with tile read/write API
- `CollisionMap.ts` -- Passability grid from collision layer
- `WarpSystem.ts` -- Step-based warp detection with direction filtering
- `ZoneSystem.ts` -- Tracks current zone for music cues and encounter tables
- `TileAnimator.ts` -- Animates water, flower, and sand tiles

### `entities/` -- Game objects
- `Player.ts` -- Sprite, grid position, animation frames
- `PlayerController.ts` -- Grid-locked movement with collision checks and smooth interpolation

### `editor/` -- In-game editor (F1)
- `Editor.ts` -- Toggle and tool management
- `EditorState.ts` -- Shared editor state (selected tile, active tool)
- `MapSerializer.ts` -- Exports MapData back to valid Tiled JSON with pre-save validation
- `tools/` -- TilePaintTool, CollisionPaintTool, WarpTool
- `overlays/` -- Visual overlays for collision and warp markers
- `ui/` -- Tile palette panel, toolbar

### `types/` -- TypeScript type definitions
- `game.ts` -- Game state, direction, debug API types
- `tiled.ts` -- Tiled JSON format types
- `editor.ts` -- Editor tool and state types

### `utils/` -- Shared utilities
- `Direction.ts` -- Cardinal direction helpers
- `EventEmitter.ts` -- Lightweight typed event system
- `TileCoords.ts` -- Pixel-to-tile coordinate conversion
