import { Text } from 'pixi.js';

export function createText(
  content: string,
  opts?: { fontSize?: number; fill?: number },
): Text {
  return new Text({
    text: content,
    style: {
      fontFamily: 'monospace',
      fontSize: opts?.fontSize ?? 8,
      fill: opts?.fill ?? 0xffffff,
      stroke: { color: 0x000000, width: 2 },
    },
  });
}
