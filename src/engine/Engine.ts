import { BlockRegistry } from '../blocks/BlockRegistry';
import { registerDefaultBlocks } from '../blocks/registerDefaultBlocks';
import { CameraController } from '../camera/CameraController';
import { Input } from '../input/Input';
import { ChunkRenderer } from '../rendering/ChunkRenderer';
import { Renderer } from '../rendering/Renderer';
import { ChunkManager } from '../world/ChunkManager';
import { ChunkStreamer } from '../world/ChunkStreamer';
import { FlatWorldGenerator } from '../world/FlatWorldGenerator';
import type { IUpdatable } from './IUpdatable';

/** Maximum delta (seconds) applied in one frame after tab focus / hitch. */
const MAX_DELTA_SECONDS = 0.1;

/** Starting camera height so the flat surface is visible. */
const INITIAL_CAMERA_Y = 72;

/**
 * Application lifecycle and game loop.
 * Coordinates systems; contains no gameplay rules.
 */
export class Engine {
  private readonly renderer: Renderer;
  private readonly input: Input;
  private readonly cameraController: CameraController;
  private readonly blockRegistry: BlockRegistry;
  private readonly chunkManager: ChunkManager;
  private readonly flatWorldGenerator: FlatWorldGenerator;
  private readonly chunkRenderer: ChunkRenderer;
  private readonly chunkStreamer: ChunkStreamer;
  private readonly updatables: IUpdatable[] = [];

  private running = false;
  private animationFrameId: number | null = null;
  private lastFrameTimeMs: number | null = null;

  public constructor() {
    this.blockRegistry = new BlockRegistry();
    registerDefaultBlocks(this.blockRegistry);
    this.chunkManager = new ChunkManager();
    this.flatWorldGenerator = new FlatWorldGenerator();

    this.renderer = new Renderer();
    this.renderer.camera.position.set(8, INITIAL_CAMERA_Y, 8);

    this.input = new Input(this.renderer.domElement);
    this.cameraController = new CameraController(
      this.renderer.camera,
      this.input,
    );

    this.chunkRenderer = new ChunkRenderer(
      this.renderer.scene,
      this.chunkManager,
      this.blockRegistry,
    );
    this.chunkStreamer = new ChunkStreamer(
      this.chunkManager,
      this.flatWorldGenerator,
      this.chunkRenderer,
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
    this.chunkRenderer.dispose();
    this.chunkManager.clear();
    this.renderer.domElement.remove();
    this.running = false;
  }

  /**
   * Frame order:
   * 1. Process input
   * 2. Update camera
   * 3. Stream chunks
   * 4. Rebuild dirty meshes
   * 5. Other systems
   * 6. Render
   */
  private tick = (timeMs: number): void => {
    this.animationFrameId = requestAnimationFrame(this.tick);

    const deltaSeconds =
      this.lastFrameTimeMs === null
        ? 0
        : Math.min((timeMs - this.lastFrameTimeMs) / 1000, MAX_DELTA_SECONDS);
    this.lastFrameTimeMs = timeMs;

    // 1. Process input
    this.input.beginFrame();

    // 2. Update camera
    this.cameraController.update(deltaSeconds);

    // 3. Stream chunks around the camera
    const camera = this.renderer.camera;
    this.chunkStreamer.update(camera.position.x, camera.position.z);

    // 4. Rebuild dirty chunk meshes (budgeted)
    this.chunkRenderer.update();

    // 5. Optional registered systems
    for (const system of this.updatables) {
      system.update(deltaSeconds);
    }

    // 6. Render
    this.renderer.render();
  };
}
