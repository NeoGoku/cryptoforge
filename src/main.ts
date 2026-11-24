import Phaser from 'phaser';
import { game } from './game';
import { HUD } from './hud';
import { MainScene } from './render';
import { sfx } from './audio';
import { DPR } from './env';

(window as unknown as { __game: typeof game }).__game = game;
const hud = new HUD();
if (game.offlineReport) hud.showOfflineReport(game.offlineReport);
const syncVisibility = () => {
  if (document.hidden) {
    game.pauseForOffline();
  } else {
    const report = game.resumeOffline();
    if (report) hud.showOfflineReport(report);
  }
};
document.addEventListener('visibilitychange', syncVisibility);
window.addEventListener('pagehide', () => game.pauseForOffline());
window.addEventListener('pageshow', syncVisibility);
syncVisibility();
window.addEventListener('pointerdown', () => sfx.unlock(), { once: true });

const phaser = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  transparent: true,
  width: Math.round(window.innerWidth * DPR),
  height: Math.round(window.innerHeight * DPR),
  scale: { mode: Phaser.Scale.NONE, zoom: 1 / DPR },
  scene: [MainScene],
});
window.addEventListener('resize', () => phaser.scale.resize(Math.round(window.innerWidth * DPR), Math.round(window.innerHeight * DPR)));

if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !location.hostname.includes('localhost')) {
  navigator.serviceWorker.register('./sw.js').catch(() => undefined);
}
