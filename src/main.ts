/**
 * Kanto Open World RPG — Entry Point
 * See docs/TECH_SPEC.md for architecture details.
 */
import { TextureSource } from 'pixi.js';
import { Game } from './Game';

// Force nearest-neighbor filtering globally — this is pixel art, no bilinear blending
TextureSource.defaultOptions.scaleMode = 'nearest';

const game = new Game();
game.init().catch(console.error);
