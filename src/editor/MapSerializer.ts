import type { TiledMap } from '../types/tiled';
import { MapData } from '../world/MapData';

export function validateBeforeSave(json: TiledMap): string[] {
  const errors: string[] = [];

  if (!json.width || !json.height || json.width < 1 || json.height < 1) {
    errors.push('Invalid dimensions');
  }

  for (const layer of json.layers) {
    if (layer.type === 'tilelayer') {
      if (layer.data.length !== json.width * json.height) {
        errors.push(`Layer "${layer.name}": wrong data length`);
      }
      if (layer.data.some(gid => gid < 0)) {
        errors.push(`Layer "${layer.name}": negative GID`);
      }
    }
    if (layer.type === 'objectgroup') {
      for (const obj of layer.objects) {
        if (obj.x == null || obj.y == null) {
          errors.push(`Object "${obj.name}": missing position`);
        }
      }
    }
  }

  if (json.tilesets.length > 0) {
    const maxGid = Math.max(...json.tilesets.map(ts => ts.firstgid)) + 10000;
    for (const layer of json.layers) {
      if (layer.type !== 'tilelayer') continue;
      for (const gid of layer.data) {
        if (gid > maxGid) {
          errors.push(`GID ${gid} exceeds tileset range`);
          break;
        }
      }
    }
  }

  return errors;
}

export function serializeAndDownload(mapData: MapData, filename: string): boolean {
  const json = mapData.toTiledJSON();
  const errors = validateBeforeSave(json);
  if (errors.length > 0) {
    console.error('Save blocked:', errors);
    return false;
  }

  const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}
