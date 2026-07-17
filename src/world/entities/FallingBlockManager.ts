import * as THREE from 'three';
import type { BlockId } from '../../blocks/BlockId';
import { BlockIds } from '../../blocks/BlockId';
import type { BlockRegistry } from '../../blocks/BlockRegistry';
import { resolveBlockTexture } from '../../blocks/resolveBlockTexture';
import { resolveBlockTint } from '../../blocks/resolveBlockTint';
import type { TextureAtlas } from '../../assets/TextureAtlas';
import type { BlockUpdateWorld } from '../BlockUpdateWorld';
import type { ChunkManager } from '../ChunkManager';
import type { WorldEventQueue } from '../events/WorldEventQueue';
import { AABB } from '../../physics/AABB';

interface PersistedFallingBlock {
  readonly id: number;
  readonly blockId: BlockId;
  readonly metadata: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly previousX: number;
  readonly previousY: number;
  readonly previousZ: number;
  readonly velocityY: number;
  readonly ageTicks: number;
  readonly ownerChunkX: number;
  readonly ownerChunkZ: number;
  readonly paused: boolean;
}

interface FallingBlock extends PersistedFallingBlock {
  x: number;
  y: number;
  z: number;
  previousX: number;
  previousY: number;
  previousZ: number;
  velocityY: number;
  ageTicks: number;
  ownerChunkX: number;
  ownerChunkZ: number;
  paused: boolean;
  readonly mesh: THREE.Mesh;
}

/** Main-thread owner for fixed-tick Beta-style falling sand/gravel entities. */
export class FallingBlockManager {
  private readonly entities = new Map<number, FallingBlock>();
  private readonly persisted = new Map<string, PersistedFallingBlock[]>();
  private nextEntityId = 1;
  private simulationTick = 0;
  private accumulator = 0;
  private interpolationAlpha = 0;
  private readonly group: THREE.Group;
  private readonly material: THREE.MeshBasicMaterial;

  public constructor(
    private readonly world: BlockUpdateWorld,
    private readonly blocks: BlockRegistry,
    private readonly chunks: ChunkManager,
    private readonly scene: THREE.Scene,
    private readonly atlas: TextureAtlas,
    private readonly events?: WorldEventQueue,
  ) {
    this.group = new THREE.Group();
    this.group.name = 'falling-block-entities';
    this.group.renderOrder = 5;
    this.scene.add(this.group);
    this.material = new THREE.MeshBasicMaterial({ map: this.atlas.texture, vertexColors: true });
    this.chunks.addRemoveListener((chunk) => this.persistChunk(chunk.chunkX, chunk.chunkZ));
    this.chunks.addCreateListener((chunk) => this.restoreChunk(chunk.chunkX, chunk.chunkZ));
  }

  public spawn(blockId: BlockId, metadata: number, x: number, y: number, z: number): void {
    const id = this.nextEntityId++;
    this.attach({ id, blockId, metadata, x, y, z, previousX: x, previousY: y, previousZ: z, velocityY: 0, ageTicks: 0, ownerChunkX: Math.floor(x / 16), ownerChunkZ: Math.floor(z / 16), paused: false });
  }

  public update(deltaSeconds: number): void {
    this.accumulator += Math.min(Math.max(deltaSeconds, 0), 0.25);
    const fixedStep = 1 / 20;
    let steps = 0;
    while (this.accumulator >= fixedStep && steps < 5) {
      this.accumulator -= fixedStep;
      this.simulateTick();
      steps += 1;
    }
    if (steps === 5 && this.accumulator >= fixedStep) this.accumulator = 0;
    this.interpolationAlpha = this.accumulator / fixedStep;
    for (const entity of this.entities.values()) {
      entity.mesh.position.set(
        entity.previousX + (entity.x - entity.previousX) * this.interpolationAlpha,
        entity.previousY + (entity.y - entity.previousY) * this.interpolationAlpha,
        entity.previousZ + (entity.z - entity.previousZ) * this.interpolationAlpha,
      );
    }
  }

  private simulateTick(): void {
    this.simulationTick += 1;
    const ids = [...this.entities.keys()].sort((a, b) => a - b);
    for (const id of ids) {
      const entity = this.entities.get(id);
      if (entity === undefined) continue;
      entity.previousX = entity.x;
      entity.previousY = entity.y;
      entity.previousZ = entity.z;
      const currentChunkX = Math.floor(entity.x / 16);
      const currentChunkZ = Math.floor(entity.z / 16);
      if (currentChunkX !== entity.ownerChunkX || currentChunkZ !== entity.ownerChunkZ) {
        this.transferOwnership(entity, currentChunkX, currentChunkZ);
      }
      entity.paused = !this.world.isLoaded(Math.floor(entity.x), Math.floor(entity.z));
      if (entity.paused) {
        this.parkEntity(entity);
        continue;
      }
      entity.ageTicks += 1;
      entity.velocityY -= 0.04;
      const oldY = entity.y;
      entity.y += entity.velocityY;
      entity.velocityY *= 0.98;
      const x = Math.floor(entity.x);
      const z = Math.floor(entity.z);
      const supportY = this.findSupportY(x, z, oldY, entity.y);
      if (supportY !== undefined) {
        entity.y = supportY + 1.5;
        this.finishLanding(entity, supportY + 1);
      } else if (entity.ageTicks > 100 || entity.y <= 0) {
        this.dropAndRemove(entity, entity.ageTicks > 100 ? 'lifetime_expired' : 'placement_failed');
      }
    }
  }

  private finishLanding(entity: FallingBlock, landingY: number): void {
    const x = Math.floor(entity.x);
    const z = Math.floor(entity.z);
    if (!this.world.isLoaded(x, z)) {
      entity.paused = true;
      return;
    }
    const landing = this.world.getBlock(x, landingY, z);
    this.removeEntity(entity.id);
    if (this.canReplace(landing) && this.world.setBlock(x, landingY, z, entity.blockId, { metadata: entity.metadata, reason: 'world', notifyNeighbours: true, updateLighting: true })) return;
    this.events?.enqueueBlockDrop(this.simulationTick, entity.id, entity.blockId, entity.metadata, x, landingY, z, 'placement_failed');
  }

  private dropAndRemove(entity: FallingBlock, reason: 'placement_failed' | 'lifetime_expired'): void {
    this.removeEntity(entity.id);
    this.events?.enqueueBlockDrop(this.simulationTick, entity.id, entity.blockId, entity.metadata, Math.floor(entity.x), Math.max(0, Math.floor(entity.y)), Math.floor(entity.z), reason);
  }

  private findSupportY(x: number, z: number, fromCenterY: number, toCenterY: number): number | undefined {
    if (toCenterY >= fromCenterY) return undefined;
    const high = Math.floor(fromCenterY - 0.5) - 1;
    const low = Math.floor(toCenterY - 0.5) - 1;
    for (let y = high; y >= low; y--) {
      if (y < 0) continue;
      if (!this.canFallThrough(this.world.getBlock(x, y, z))) return y;
    }
    return undefined;
  }

  private attach(state: PersistedFallingBlock): void {
    if (this.entities.has(state.id)) return;
    this.nextEntityId = Math.max(this.nextEntityId, state.id + 1);
    const mesh = this.createMesh(state.blockId);
    this.group.add(mesh);
    mesh.position.set(state.x, state.y, state.z);
    this.entities.set(state.id, { ...state, mesh });
  }

  private transferOwnership(entity: FallingBlock, chunkX: number, chunkZ: number): void {
    entity.ownerChunkX = chunkX;
    entity.ownerChunkZ = chunkZ;
  }

  private parkEntity(entity: FallingBlock): void {
    const key = `${entity.ownerChunkX},${entity.ownerChunkZ}`;
    const states = this.persisted.get(key) ?? [];
    if (!states.some((state) => state.id === entity.id)) states.push(this.toPersisted(entity));
    this.persisted.set(key, states);
    this.removeEntity(entity.id);
  }

  private persistChunk(chunkX: number, chunkZ: number): void {
    const key = `${chunkX},${chunkZ}`;
    const states: PersistedFallingBlock[] = [];
    for (const entity of [...this.entities.values()]) {
      if (entity.ownerChunkX !== chunkX || entity.ownerChunkZ !== chunkZ) continue;
      states.push(this.toPersisted(entity));
      this.removeEntity(entity.id);
    }
    if (states.length > 0) this.persisted.set(key, states);
  }

  private restoreChunk(chunkX: number, chunkZ: number): void {
    const key = `${chunkX},${chunkZ}`;
    const states = this.persisted.get(key);
    if (states === undefined) return;
    this.persisted.delete(key);
    for (const state of states) this.attach({ ...state, paused: false, ownerChunkX: chunkX, ownerChunkZ: chunkZ });
  }

  private toPersisted(entity: FallingBlock): PersistedFallingBlock {
    const { mesh: _mesh, ...state } = entity;
    return state;
  }

  private removeEntity(id: number): void {
    const entity = this.entities.get(id);
    if (entity === undefined) return;
    this.group.remove(entity.mesh);
    entity.mesh.geometry.dispose();
    this.entities.delete(id);
  }

  public getCount(): number { return this.entities.size; }
  public getMeshCount(): number { return this.group.children.length; }
  public getSimulationTick(): number { return this.simulationTick; }
  public getInterpolationAlpha(): number { return this.interpolationAlpha; }
  public getPersistedCount(): number { let count = 0; for (const states of this.persisted.values()) count += states.length; return count; }
  public getDebugEntities(): readonly Readonly<PersistedFallingBlock>[] { return [...this.entities.values()].map((entity) => this.toPersisted(entity)); }

  public dispose(): void {
    for (const entity of [...this.entities.values()]) this.removeEntity(entity.id);
    this.persisted.clear();
    this.scene.remove(this.group);
    this.material.dispose();
  }

  private createMesh(blockId: BlockId): THREE.Mesh {
    const definition = this.blocks.getById(blockId);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const uv = geometry.getAttribute('uv');
    const slots = ['side', 'side', 'top', 'bottom', 'side', 'side'] as const;
    const colors: number[] = [];
    for (let face = 0; face < 6; face++) {
      const slot = slots[face]!;
      const textureName = definition === undefined ? undefined : resolveBlockTexture(definition, slot);
      const rect = textureName === undefined ? undefined : this.atlas.getUvRect(textureName);
      if (rect !== undefined) for (let i = 0; i < 4; i++) { const index = face * 4 + i; uv.setXY(index, rect.u0 + uv.getX(index) * (rect.u1 - rect.u0), rect.v0 + uv.getY(index) * (rect.v1 - rect.v0)); }
      const tint = definition === undefined ? [1, 1, 1] as const : resolveBlockTint(definition, slot);
      for (let i = 0; i < 4; i++) colors.push(tint[0], tint[1], tint[2]);
    }
    uv.needsUpdate = true;
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    // Keep the AABB definition explicit for collision/debug parity. The
    // current world collision query uses the same 1×1×1 footprint.
    void new AABB(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5);
    return new THREE.Mesh(geometry, this.material);
  }

  private canFallThrough(id: BlockId): boolean {
    if (id === BlockIds.Air || id === BlockIds.WaterFlowing || id === BlockIds.WaterStill || id === BlockIds.LavaFlowing || id === BlockIds.LavaStill) return true;
    return this.blocks.getById(id)?.replaceable === true;
  }
  private canReplace(id: BlockId): boolean { return this.canFallThrough(id); }
}
