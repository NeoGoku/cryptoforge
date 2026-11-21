import Phaser from 'phaser';
import { game } from './game';
import { HUD } from './hud';
import { MainScene } from './render';

const hud = new HUD();
if (game.offlineGain > 0) hud.toast(`Offline-Ertrag: +${game.offlineGain.toFixed(4)} BIT`);
window.addEventListener('beforeunload', () => game.save());

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0b0f1a',
  scale: { mode: Phaser.Scale.RESIZE },
  scene: [MainScene],
});
