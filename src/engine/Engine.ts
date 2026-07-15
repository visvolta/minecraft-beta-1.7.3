import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { TextureAtlas } from '../assets/TextureAtlas';
import { CameraController } from '../camera/CameraController';
import { Input } from '../input/Input';
import { Player } from '../player/Player';
import { PlayerController } from '../player/PlayerController';
import { InteractionController } from '../player/InteractionController';
import { PlayerPhysics } from '../physics/PlayerPhysics';
import { BlockHighlight } from '../rendering/BlockHighlight';
import { ChunkRenderer } from '../rendering/ChunkRenderer';
import { Renderer } from '../rendering/Renderer';
import { ChunkManager } from '../world/ChunkManager';
import { ChunkStreamer } from '../world/ChunkStreamer';
import { BetaWorldGenerator } from '../world/generation/BetaWorldGenerator';
import { LightEngine } from '../world/generation/lighting/LightEngine';
import { DebugController } from '../debug/DebugController';
import { DebugOverlay } from '../debug/DebugOverlay';
import { DebugStatsCollector } from '../debug/DebugStatsCollector';
import type { IUpdatable } from './IUpdatable';

/** Maximum delta (seconds) applied in one frame after tab focus / hitch. */
const MAX_DELTA_SECONDS = 0.1;

/**
 * Hardcoded world seed for this stage (no seed-selection UI or save
 * system yet). BigInt because Beta's terrain noise depends on Java's
 * full 64-bit long seed semantics, which a plain JS number can't
 * represent exactly.
 *
 * Seed 2 was chosen after verifying (against a compiled, unmodified
 * mc-dev reference) that it produces a healthy, varied biome
 * distribution — all 10 reachable Beta biomes present over a 41x41
 * chunk sample, no single biome exceeding ~26%. The previous default
 * (12345) was confirmed — via the same reference — to be a genuinely
 * atypical Beta seed that generates ~83% Desert; that was authentic
 * Beta behaviour for that specific seed, not a code defect, but it made
 * the world look far less varied than typical Beta terrain, so the
 * default was changed. See BETA_TERRAIN_SEED_HEALTH_CHECK in
 * world/generation for the automated regression guarding this.
 */
const WORLD_SEED = 474747474747n;

/**
 * Player spawn (feet position). Fixed X/Z with a generously high Y so the
 * player always starts above generated terrain (which varies in height,
 * unlike the old flat world) and falls onto it under gravity + collision.
 * No spawn search or saved spawn data yet — fixed for this stage.
 */
const SPAWN_X = 8;
const SPAWN_Y = 140;
const SPAWN_Z = 8;

/**
 * Application lifecycle and game loop.
 * Coordinates systems; contains no gameplay rules.
 *
 * The block registry and texture atlas are built before the Engine exists
 * (asset loading is asynchronous) and are handed in already populated.
 */
export class Engine {
  private readonly renderer: Renderer;
  private readonly input: Input;
  private readonly cameraController: CameraController;
  private readonly player: Player;
  private readonly playerController: PlayerController;
  private readonly playerPhysics: PlayerPhysics;
  private readonly interactionController: InteractionController;
  private readonly blockHighlight: BlockHighlight;
  private readonly atlas: TextureAtlas;
  private readonly chunkManager: ChunkManager;
  private readonly worldGenerator: BetaWorldGenerator;
  private readonly chunkRenderer: ChunkRenderer;
  private readonly chunkStreamer: ChunkStreamer;
  private readonly lightEngine: LightEngine;
  private readonly updatables: IUpdatable[] = [];

  // Stage 12D debug systems. Kept isolated from gameplay: DebugController
  // only ever moves the player directly while no-clip is on (Engine picks
  // whether PlayerPhysics or DebugController runs each frame); DebugOverlay
  // only ever reads a DebugStats snapshot and never touches game state.
  private readonly debugOverlay: DebugOverlay;
  private readonly debugController: DebugController;
  private readonly debugStatsCollector: DebugStatsCollector;
  private noClipEnabled = false;
  private grayscaleMode = false;

  private running = false;
  private animationFrameId: number | null = null;
  private lastFrameTimeMs: number | null = null;

  public constructor(blockRegistry: BlockRegistry, atlas: TextureAtlas) {
    this.atlas = atlas;
    this.chunkManager = new ChunkManager();
    this.worldGenerator = new BetaWorldGenerator(WORLD_SEED);

    this.renderer = new Renderer();

    this.input = new Input(this.renderer.domElement);
    this.cameraController = new CameraController(
      this.renderer.camera,
      this.input,
    );

    this.player = new Player(SPAWN_X, SPAWN_Y, SPAWN_Z);
    this.playerController = new PlayerController(
      this.input,
      this.cameraController,
      this.player,
    );
    this.playerPhysics = new PlayerPhysics(this.chunkManager, blockRegistry);

    this.lightEngine = new LightEngine(this.chunkManager, blockRegistry);

    this.interactionController = new InteractionController(
      this.input,
      this.renderer.camera,
      this.player,
      this.chunkManager,
      blockRegistry,
      this.lightEngine,
    );
    this.blockHighlight = new BlockHighlight(this.renderer.scene);

    this.chunkRenderer = new ChunkRenderer(
      this.renderer.scene,
      this.chunkManager,
      blockRegistry,
      this.atlas,
    );
    this.chunkStreamer = new ChunkStreamer(
      this.chunkManager,
      this.worldGenerator,
      this.chunkRenderer,
      this.lightEngine,
    );

    this.debugOverlay = new DebugOverlay();
    this.debugController = new DebugController(
      this.input,
      this.cameraController,
      this.player,
    );
    this.debugStatsCollector = new DebugStatsCollector(
      this.player,
      this.chunkManager,
      this.chunkRenderer,
      this.renderer.renderer,
      WORLD_SEED,
    );
  }

  /**
   * Register a system to receive update(deltaSeconds) each frame.
   * Core systems are wired explicitly; use this for future systems.
   */
  public register(system: IUpdatable): void {
    if (this.updatables.includes(system)) {
      return;
    }

    this.updatables.push(system);
  }

  public unregister(system: IUpdatable): void {
    const index = this.updatables.indexOf(system);

    if (index !== -1) {
      this.updatables.splice(index, 1);
    }
  }

  public start(): void {
    if (this.running) {
      return;
    }

    document.body.appendChild(this.renderer.domElement);
    this.debugOverlay.mount();
    this.input.start();
    this.renderer.start();
    this.running = true;
    this.lastFrameTimeMs = null;
    this.animationFrameId = requestAnimationFrame(this.tick);
  }

  public stop(): void {
    if (!this.running) {
      return;
    }

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.lastFrameTimeMs = null;
    this.renderer.stop();
    this.input.stop();
    this.debugOverlay.dispose();
    this.blockHighlight.dispose();
    this.chunkRenderer.dispose();
    this.atlas.dispose();
    this.chunkManager.clear();
    this.renderer.domElement.remove();
    this.running = false;
  }

  /**
   * Frame order:
   * 1. Begin input frame
   * 2. Toggle debug systems (F3 overlay, F6 no-clip)
   * 3. Update camera look
   * 4. Read movement input (player wish velocity + jump) — only when not in no-clip
   * 5. Update player physics / no-clip movement
   * 6. Move camera to player eye position
   * 7. Stream chunks
   * 8. Update interaction (raycast + break/place)
   * 9. Rebuild dirty meshes (terrain + water)
   * 10. Update block highlight
   * 11. Update debug overlay stats
   * 12. Render (terrain, then water, then debug overlay is plain DOM
   *     drawn by the browser compositor, not part of the WebGL pass)
   *
   * Optional registered systems (see register()) run just before rendering,
   * after all core systems above.
   */
  private tick = (timeMs: number): void => {
    this.animationFrameId = requestAnimationFrame(this.tick);

    const deltaSeconds =
      this.lastFrameTimeMs === null
        ? 0
        : Math.min((timeMs - this.lastFrameTimeMs) / 1000, MAX_DELTA_SECONDS);
    this.lastFrameTimeMs = timeMs;

    // 1. Begin input frame
    this.input.beginFrame();

    // 2. Toggle debug systems
    if (this.input.isDebugKeyJustPressed('F3')) {
      this.debugOverlay.toggle();
    }

    if (this.input.isDebugKeyJustPressed('F4')) {
      this.grayscaleMode = !this.grayscaleMode;
      this.chunkRenderer.setGrayscaleMode(this.grayscaleMode, this.atlas);
    }

    if (this.input.isDebugKeyJustPressed('F6')) {
      this.noClipEnabled = !this.noClipEnabled;
      // Reset velocity/grounded state on every transition so re-enabling
      // normal physics (or starting no-clip mid-fall/mid-jump) never
      // carries over a stale velocity into the new mode.
      this.debugController.resetPhysicsState();
    }

    // 3. Update camera look
    this.cameraController.update();

    // 4-5. Movement + physics: no-clip bypasses PlayerController's wish
    // velocity entirely and moves the player directly, skipping
    // PlayerPhysics (gravity, player collision, block collision) so
    // none of it runs while no-clip is active, per this stage's
    // requirements.
    if (this.noClipEnabled) {
      this.debugController.update(deltaSeconds);
    } else {
      this.playerController.update();
      this.playerPhysics.update(this.player, deltaSeconds);
    }

    // 6. Move camera to the player's eye position
    const camera = this.renderer.camera;
    camera.position.set(
      this.player.position.x,
      this.player.getEyeY(),
      this.player.position.z,
    );

    // 7. Stream chunks around the player
    this.chunkStreamer.update(camera.position.x, camera.position.z);

    // 8. Update interaction (raycast targeting + break/place edits)
    this.interactionController.update();

    // 9. Rebuild dirty chunk meshes (budgeted, terrain + water together);
    // picks up this frame's edits
    this.chunkRenderer.update();

    // 10. Update the block highlight to match the current target
    this.blockHighlight.setTarget(this.interactionController.getCurrentHit()?.blockPos);

    // 11. Update debug overlay stats. Frame timing is recorded every
    // frame (so FPS smoothing stays accurate even while the overlay is
    // hidden); the full stats snapshot (including a climate/biome
    // sample) is only computed while the overlay is actually visible.
    this.debugStatsCollector.recordFrame(deltaSeconds);
    if (this.debugOverlay.isVisible()) {
      this.debugOverlay.render(this.debugStatsCollector.collect(this.noClipEnabled));
    }

    // Optional registered systems, before rendering.
    for (const system of this.updatables) {
      system.update(deltaSeconds);
    }

    // 12. Render terrain + water (both drawn in the one WebGL pass; the
    // debug overlay is a separate plain-HTML element composited by the
    // browser on top, not part of this render call).
    this.renderer.render();
  };
}
