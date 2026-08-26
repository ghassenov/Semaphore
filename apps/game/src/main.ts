import Phaser from "phaser";

/** Native resolution. Everything is authored at this size and scaled up whole. */
const NATIVE_WIDTH = 320;
const NATIVE_HEIGHT = 180;

class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  create(): void {
    this.add
      .text(NATIVE_WIDTH / 2, NATIVE_HEIGHT / 2, "SEMAPHORE", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#e8dcc8",
      })
      .setOrigin(0.5);
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: NATIVE_WIDTH,
  height: NATIVE_HEIGHT,
  pixelArt: true,
  backgroundColor: "#14100c",
  scale: {
    // NONE + a whole-number zoom, rather than FIT: fractional scaling makes
    // pixel rows uneven, which the art direction rules out (doc 04 §1).
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene],
});

function snapZoom(): void {
  const fit = Math.min(window.innerWidth / NATIVE_WIDTH, window.innerHeight / NATIVE_HEIGHT);
  game.scale.setZoom(Math.max(1, Math.floor(fit)));
}

snapZoom();
window.addEventListener("resize", snapZoom);
