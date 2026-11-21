import Phaser from 'phaser';
import { game } from './game';
import { HUD } from './hud';
import { MainScene } from './render';
import { sfx } from './audio';

const hud = new HUD();
if (game.offlineGain > 0) hud.toast(`Offline-Ertrag: +${game.offlineGain.toFixed(4)} BIT`);
window.addEventListener('beforeunload', () => game.save());
window.addEventListener('pointerdown', () => sfx.unlock(), { once: true });

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  transparent: true,
  scale: { mode: Phaser.Scale.RESIZE },
  scene: [MainScene],
});
