import { Container } from 'pixi.js';
import { NPC } from './NPC';
import { NPCController } from './NPCController';
import type { OverheadIcon } from './Entity';
import { CollisionMap } from '../world/CollisionMap';
import { MapData } from '../world/MapData';
import { Player } from './Player';
import { AssetLoader } from '../core/AssetLoader';

interface ManifestEntry {
  sheet: string;
  frameWidth: number;
  frameHeight: number;
  animated: boolean;
}

interface Manifest {
  sprites: Record<string, ManifestEntry>;
}

export class NPCManager {
  private npcs: NPC[] = [];
  private controllers: NPCController[] = [];
  private manifest: Manifest | null = null;
  private assetLoader = new AssetLoader();
  private player: Player | null = null;

  async loadManifest(): Promise<void> {
    try {
      this.manifest = await this.assetLoader.loadJSON<Manifest>('./sprites/npcs/manifest.json');
    } catch (e) {
      console.warn('Failed to load NPC manifest:', e);
    }
  }

  async spawn(
    mapData: MapData,
    entityLayer: Container,
    collision: CollisionMap,
    player: Player,
  ): Promise<void> {
    this.player = player;
    if (!this.manifest || mapData.npcs.length === 0) return;

    const loads: Promise<void>[] = [];

    for (const def of mapData.npcs) {
      const entry = this.manifest.sprites[def.sprite];
      if (!entry || !entry.animated) {
        console.warn(`NPC sprite "${def.sprite}" not found in manifest`);
        continue;
      }

      const npc = new NPC(def, entityLayer);
      this.npcs.push(npc);

      const controller = new NPCController(npc, collision, (x, y) =>
        this.isOccupiedExcluding(npc, x, y),
      );
      this.controllers.push(controller);

      loads.push(
        npc.loadSprite(`./sprites/npcs/${entry.sheet}`, entry.frameWidth, entry.frameHeight),
      );
    }

    await Promise.all(loads);

    // Show overhead icons
    for (const npc of this.npcs) {
      if (npc.def.overheadIcon) {
        npc.showOverheadIcon(npc.def.overheadIcon as OverheadIcon);
      }
    }
  }

  despawn(): void {
    for (const npc of this.npcs) npc.destroy();
    this.npcs = [];
    this.controllers = [];
    this.player = null;
  }

  update(): void {
    for (let i = 0; i < this.controllers.length; i++) {
      this.controllers[i].update();
      this.npcs[i].updateAnimation();
      this.npcs[i].updateOverhead();
    }
  }

  /** Check if any NPC occupies or is walking toward (x, y). */
  isOccupied(x: number, y: number): boolean {
    for (const ctrl of this.controllers) {
      const t = ctrl.getTargetTile();
      if (t.x === x && t.y === y) return true;
    }
    return false;
  }

  /** Same as isOccupied but excludes one NPC (for NPC-vs-NPC) and also checks the player. */
  private isOccupiedExcluding(exclude: NPC, x: number, y: number): boolean {
    // Check player position
    if (this.player && this.player.tileX === x && this.player.tileY === y) return true;

    for (let i = 0; i < this.npcs.length; i++) {
      if (this.npcs[i] === exclude) continue;
      const t = this.controllers[i].getTargetTile();
      if (t.x === x && t.y === y) return true;
    }
    return false;
  }
}
