import { Sprite, Texture, Rectangle, Container, Assets } from 'pixi.js';
import { TILE_SIZE } from '../utils/TileCoords';
import type { MapData } from './MapData';

interface DoorAnimDef {
  name: string;
  image: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  frameDuration: number;
  sound: 'normal' | 'sliding';
  size: '1x1' | '1x2';
}

interface DoorAnim {
  def: DoorAnimDef;
  frames: Texture[];
}

/**
 * Door animation system.
 *
 * Loads door animation spritesheets and plays open/close sequences
 * by overlaying sprites on top of door metatiles.
 *
 * From the GBA source (field_door.c):
 * - 32 unique door types, each identified by metatile ID
 * - Open: 3 frames at 4 ticks each (~0.27s)
 * - Close: 3 frames in reverse (~0.27s)
 * - Two sizes: 1×1 (16×16) and 1×2 (16×32)
 * - Two sounds: normal (creak) and sliding
 *
 * The manifest (door_anims.json) maps GBA metatile IDs to animation data.
 * At runtime, we convert tile GIDs to GBA metatile IDs using tileset firstgid info.
 */
export class DoorAnimator {
  private container: Container;
  /** GBA metatile ID → animation */
  private anims = new Map<number, DoorAnim>();
  /** GBA metatile ID (decimal string) → def from manifest */
  private manifest: Record<string, DoorAnimDef> = {};
  private activeSprite: Sprite | null = null;

  constructor(container: Container) {
    this.container = container;
  }

  async load(): Promise<void> {
    try {
      const resp = await fetch('./data/door_anims.json');
      this.manifest = await resp.json();
    } catch {
      console.warn('Door animation manifest not found');
    }
  }

  /**
   * Play door open animation at a tile position.
   * @param tileX Door tile X (the building facade, one tile north of player)
   * @param tileY Door tile Y
   * @param gid The GID of the bottom tile at the door position
   * @param mapData Current map data (for tileset firstgid lookup)
   */
  async playOpen(tileX: number, tileY: number, gid: number, mapData?: MapData): Promise<void> {
    const anim = await this.resolveAnim(gid, mapData);
    if (!anim) return;
    // hold=true: keep the sprite visible (showing open door) after animation ends.
    // The sprite stays until playClose runs or clear() is called.
    return this.playSequence(tileX, tileY, anim, false, true);
  }

  /**
   * Play door close animation at a tile position.
   */
  async playClose(tileX: number, tileY: number, gid: number, mapData?: MapData): Promise<void> {
    const anim = await this.resolveAnim(gid, mapData);
    if (!anim) return;
    return this.playSequence(tileX, tileY, anim, true, false);
  }

  /**
   * Resolve a GID to the correct door animation.
   * Converts GID → GBA metatile ID using tileset firstgid info,
   * then looks up the animation in the manifest.
   */
  private async resolveAnim(gid: number, mapData?: MapData): Promise<DoorAnim | null> {
    if (gid <= 0) return this.loadFallback();

    const resolved = this.gidToManifestKey(gid, mapData);
    if (resolved) {
      const { key, localId } = resolved;
      if (this.manifest[key]) {
        const cached = this.anims.get(localId);
        if (cached) return cached;
        return this.loadAnim(localId, this.manifest[key]);
      }
    }

    return this.loadFallback();
  }

  /**
   * Convert a Tiled GID to a manifest key ("tileset_name/local_id").
   *
   * Metatile IDs are only unique within a single map's tileset pair, so we
   * need both the tileset name and local index to identify the door type.
   */
  private gidToManifestKey(gid: number, mapData?: MapData): { key: string; localId: number } | null {
    if (!mapData) return null;

    const firstGids = mapData.tilesetFirstGids;
    if (!firstGids || firstGids.length === 0) return null;

    // Find the tileset with the largest firstgid that doesn't exceed the GID
    let tilesetIdx = 0;
    for (let i = firstGids.length - 1; i >= 0; i--) {
      if (gid >= firstGids[i]) {
        tilesetIdx = i;
        break;
      }
    }

    const localId = gid - firstGids[tilesetIdx];
    const source = (mapData.tilesetSources[tilesetIdx] ?? '').toLowerCase();

    // Skip top-layer tilesets — doors are only in bottom layer
    if (source.includes('_top')) return null;

    // Extract tileset name from source filename (e.g. "pallet_town.tsj" → "pallet_town")
    const tilesetName = source.replace(/\.tsj$/, '');
    if (!tilesetName) return null;

    return { key: `${tilesetName}/${localId}`, localId };
  }

  private async loadAnim(metatileId: number, def: DoorAnimDef): Promise<DoorAnim | null> {
    try {
      const tex = await Assets.load(`./sprites/${def.image}`) as Texture;
      tex.source.scaleMode = 'nearest';

      const frames: Texture[] = [];
      for (let i = 0; i < def.frameCount; i++) {
        frames.push(new Texture({
          source: tex.source,
          frame: new Rectangle(
            i * def.frameWidth, 0,
            def.frameWidth, def.frameHeight,
          ),
        }));
      }

      const anim: DoorAnim = { def, frames };
      this.anims.set(metatileId, anim);
      return anim;
    } catch {
      return null;
    }
  }

  /** Load the 'general' door animation as a fallback. */
  private async loadFallback(): Promise<DoorAnim | null> {
    const cached = this.anims.get(61);
    if (cached) return cached;

    const def = this.manifest['general/61'];
    if (!def) return null;
    return this.loadAnim(61, def);
  }

  private playSequence(
    tileX: number,
    tileY: number,
    anim: DoorAnim,
    reverse: boolean,
    hold: boolean,
  ): Promise<void> {
    return new Promise(resolve => {
      // Clean up any existing animation sprite
      if (this.activeSprite) {
        this.activeSprite.destroy();
        this.activeSprite = null;
      }

      const frames = reverse ? [...anim.frames].reverse() : anim.frames;
      const sprite = new Sprite(frames[0]);
      sprite.anchor.set(0, 0);
      sprite.x = tileX * TILE_SIZE;
      // For 1x2 doors, the sprite is 32px tall, position one tile higher
      const yOffset = anim.def.size === '1x2' ? -TILE_SIZE : 0;
      sprite.y = tileY * TILE_SIZE + yOffset;
      // Door sprite renders below the player (background element)
      sprite.zIndex = tileY * TILE_SIZE - 1;
      this.container.addChild(sprite);
      this.activeSprite = sprite;

      let frameIdx = 0;
      let tick = 0;
      const frameDuration = anim.def.frameDuration;
      const totalTicks = frames.length * frameDuration;

      const animate = () => {
        tick++;
        if (tick >= totalTicks) {
          if (hold) {
            // Keep sprite visible on last frame (e.g. door stays open)
            resolve();
          } else {
            sprite.destroy();
            this.activeSprite = null;
            resolve();
          }
          return;
        }
        const newFrame = Math.floor(tick / frameDuration);
        if (newFrame !== frameIdx) {
          frameIdx = newFrame;
          sprite.texture = frames[frameIdx];
        }
        requestAnimationFrame(animate);
      };

      requestAnimationFrame(animate);
    });
  }

  clear(): void {
    if (this.activeSprite) {
      this.activeSprite.destroy();
      this.activeSprite = null;
    }
  }
}
