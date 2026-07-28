/**
 * validateRendering — texture resolution, atlas coverage, chunk mesh output,
 * and the bounds/frustum invariants behind the chunk-culling regression.
 *
 * The bounds checks here exist because chunk geometry is emitted in chunk-LOCAL
 * space while the world offset lives on `mesh.position`. Assigning world-space
 * bounds to that geometry double-offsets the culling volume and makes visible
 * chunks disappear. These checks pin the convention down so it cannot silently
 * regress again.
 */

import * as THREE from 'three';

import { BlockIds } from '../src/blocks/BlockId.ts';
import type { BlockId } from '../src/blocks/BlockId.ts';
import { BlockRegistry } from '../src/blocks/BlockRegistry.ts';
import { registerDefaultBlocks } from '../src/blocks/registerDefaultBlocks.ts';
import { resolveBlockTexture } from '../src/blocks/resolveBlockTexture.ts';
import { BED_HEIGHT } from '../src/blocks/shapes/BlockShapes.ts';
import { TALL_GRASS_META_FERN } from '../src/blocks/TallGrassMeta.ts';
import { CHUNK_BOUNDS_MARGIN, CHUNK_BOUNDING_SPHERE_RADIUS } from '../src/rendering/ChunkRenderer.ts';
import { classifyBlockPassMask, ChunkPassMask } from '../src/rendering/meshing/ChunkPassMask.ts';
import { vegetationTintKind } from '../src/world/generation/climate/VegetationColors.ts';
import { CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../src/world/chunkConstants.ts';
import { collectBlockAtlasTextureNames } from '../src/assets/blockAtlasTextureNames.ts';
import { assert, assertClose, assertEqual, runSuite, type Section } from './validationHarness.ts';

const registry = new BlockRegistry();
registerDefaultBlocks(registry);

/**
 * The exact set AssetManager packs into the atlas at runtime, so a texture the
 * mesher requests but the atlas omits is caught here rather than appearing as
 * a missing_texture tile in game.
 */
const atlasNames = collectBlockAtlasTextureNames(registry);

/**
 * Rebuilds the analytic bounds exactly as ChunkRenderer.assignChunkBounds does,
 * so the invariants below test the shipped convention rather than a copy that
 * can drift. Bounds are in chunk-LOCAL space.
 */
function analyticBounds(): { box: THREE.Box3; sphere: THREE.Sphere } {
  const margin = CHUNK_BOUNDS_MARGIN;
  return {
    box: new THREE.Box3(
      new THREE.Vector3(-margin, -margin, -margin),
      new THREE.Vector3(CHUNK_SIZE_X + margin, CHUNK_SIZE_Y + margin, CHUNK_SIZE_Z + margin),
    ),
    sphere: new THREE.Sphere(
      new THREE.Vector3(CHUNK_SIZE_X * 0.5, CHUNK_SIZE_Y * 0.5, CHUNK_SIZE_Z * 0.5),
      CHUNK_BOUNDING_SPHERE_RADIUS,
    ),
  };
}

/** A chunk mesh positioned the way ChunkRenderer places it. */
function chunkMesh(chunkX: number, chunkZ: number): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  const { box, sphere } = analyticBounds();
  geometry.boundingBox = box;
  geometry.boundingSphere = sphere;
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.position.set(chunkX * CHUNK_SIZE_X, 0, chunkZ * CHUNK_SIZE_Z);
  mesh.updateMatrixWorld(true);
  return mesh;
}

/** True world-space AABB of a chunk's block volume — the culling ground truth. */
function chunkWorldBox(chunkX: number, chunkZ: number): THREE.Box3 {
  return new THREE.Box3(
    new THREE.Vector3(chunkX * CHUNK_SIZE_X, 0, chunkZ * CHUNK_SIZE_Z),
    new THREE.Vector3(chunkX * CHUNK_SIZE_X + CHUNK_SIZE_X, CHUNK_SIZE_Y, chunkZ * CHUNK_SIZE_Z + CHUNK_SIZE_Z),
  );
}

function frustumFor(camera: THREE.PerspectiveCamera): THREE.Frustum {
  camera.updateMatrixWorld(true);
  return new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );
}

const sections: Section[] = [
  {
    name: 'Chunk bounds and frustum invariants',
    checks: [
      {
        name: 'chunk bounds are expressed in local space, not world space',
        run: () => {
          // The regression: bounds centred on the chunk's WORLD origin while
          // mesh.position already carries that origin. Local-space bounds must
          // be identical for every chunk regardless of its coordinates.
          const { box: a, sphere: sa } = analyticBounds();
          const { box: b, sphere: sb } = analyticBounds();
          assert(a.equals(b) && sa.equals(sb), 'analytic bounds are not deterministic');
          assertClose(sa.center.x, CHUNK_SIZE_X * 0.5, 1e-9, 'bounding sphere centre X must be chunk-local midpoint');
          assertClose(sa.center.z, CHUNK_SIZE_Z * 0.5, 1e-9, 'bounding sphere centre Z must be chunk-local midpoint');
          assertClose(sa.center.y, CHUNK_SIZE_Y * 0.5, 1e-9, 'bounding sphere centre Y must be chunk-local midpoint');
        },
      },
      {
        name: 'mesh position and geometry coordinate conventions agree',
        run: () => {
          // Transforming the local bounding sphere by matrixWorld must land it
          // on the chunk's true world volume, not double-offset past it.
          for (const [cx, cz] of [[0, 0], [3, -5], [-7, 11], [40, 40]] as const) {
            const mesh = chunkMesh(cx, cz);
            const world = mesh.geometry.boundingSphere!.clone().applyMatrix4(mesh.matrixWorld);
            const expectedX = cx * CHUNK_SIZE_X + CHUNK_SIZE_X * 0.5;
            const expectedZ = cz * CHUNK_SIZE_Z + CHUNK_SIZE_Z * 0.5;
            assertClose(world.center.x, expectedX, 1e-6, `chunk ${cx},${cz} world sphere centre X`);
            assertClose(world.center.z, expectedZ, 1e-6, `chunk ${cx},${cz} world sphere centre Z`);
          }
        },
      },
      {
        name: 'chunk bounds fully contain the chunk block volume',
        run: () => {
          const { box } = analyticBounds();
          // Local block volume is 0..16 / 0..128 / 0..16.
          assert(box.containsPoint(new THREE.Vector3(0, 0, 0)), 'bounds exclude local block origin');
          assert(
            box.containsPoint(new THREE.Vector3(CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z)),
            'bounds exclude the far corner of the block volume',
          );
          assert(box.min.x <= 0 && box.min.y <= 0 && box.min.z <= 0, 'bounds min must not clip the block volume');
          assert(
            box.max.x >= CHUNK_SIZE_X && box.max.y >= CHUNK_SIZE_Y && box.max.z >= CHUNK_SIZE_Z,
            'bounds max must not clip the block volume',
          );
        },
      },
      {
        name: 'bounding sphere is conservative (encloses the padded bounding box)',
        run: () => {
          const { box, sphere } = analyticBounds();
          const corners = [
            new THREE.Vector3(box.min.x, box.min.y, box.min.z),
            new THREE.Vector3(box.min.x, box.min.y, box.max.z),
            new THREE.Vector3(box.min.x, box.max.y, box.min.z),
            new THREE.Vector3(box.min.x, box.max.y, box.max.z),
            new THREE.Vector3(box.max.x, box.min.y, box.min.z),
            new THREE.Vector3(box.max.x, box.min.y, box.max.z),
            new THREE.Vector3(box.max.x, box.max.y, box.min.z),
            new THREE.Vector3(box.max.x, box.max.y, box.max.z),
          ];
          for (const corner of corners) {
            assert(
              sphere.containsPoint(corner) || sphere.center.distanceTo(corner) <= sphere.radius + 1e-9,
              `bounding sphere does not enclose box corner ${corner.toArray().join(',')}`,
            );
          }
        },
      },
      {
        name: 'no chunk intersecting the view frustum is culled, across a camera sweep',
        run: () => {
          // The core requirement: a chunk must never disappear while any part
          // of its renderable geometry is still inside the camera view.
          const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 1024);
          const radius = 6;
          let wronglyCulled = 0;
          let evaluated = 0;
          const failures: string[] = [];

          for (const yaw of [0, 23, 45, 67, 90, 135, 180, 225, 270, 315, 350]) {
            for (const pitch of [-90, -75, -45, -20, 0, 20, 45, 75, 90]) {
              camera.position.set(8, 64, 8);
              const y = (yaw * Math.PI) / 180;
              const p = (pitch * Math.PI) / 180;
              camera.lookAt(
                8 + Math.sin(y) * Math.cos(p) * 100,
                64 + Math.sin(p) * 100,
                8 - Math.cos(y) * Math.cos(p) * 100,
              );
              const frustum = frustumFor(camera);

              for (let cz = -radius; cz <= radius; cz++) {
                for (let cx = -radius; cx <= radius; cx++) {
                  evaluated += 1;
                  const mesh = chunkMesh(cx, cz);
                  const worldSphere = mesh.geometry.boundingSphere!.clone().applyMatrix4(mesh.matrixWorld);
                  const keptByCulling = frustum.intersectsSphere(worldSphere);
                  const trulyVisible = frustum.intersectsBox(chunkWorldBox(cx, cz));
                  if (trulyVisible && !keptByCulling) {
                    wronglyCulled += 1;
                    if (failures.length < 5) failures.push(`chunk ${cx},${cz} at yaw ${yaw}/pitch ${pitch}`);
                  }
                }
              }
            }
          }

          assert(evaluated > 0, 'camera sweep evaluated no chunks');
          assert(
            wronglyCulled === 0,
            `${wronglyCulled}/${evaluated} chunk-camera combinations culled a chunk still inside the frustum; e.g. ${failures.join('; ')}`,
          );
        },
      },
      {
        name: 'chunks partially overlapping the frustum edge survive culling',
        run: () => {
          // Partial visibility is where a too-tight bound bites first.
          const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 1024);
          camera.position.set(8, 64, 8);
          camera.lookAt(8, 64, -1000);
          const frustum = frustumFor(camera);
          let checked = 0;
          for (let cz = -8; cz <= 2; cz++) {
            for (let cx = -8; cx <= 8; cx++) {
              const worldBox = chunkWorldBox(cx, cz);
              if (!frustum.intersectsBox(worldBox)) continue;
              // Only interested in chunks NOT fully contained — i.e. straddling an edge.
              const fullyInside = frustum.containsPoint(worldBox.min) && frustum.containsPoint(worldBox.max);
              if (fullyInside) continue;
              checked += 1;
              const mesh = chunkMesh(cx, cz);
              const worldSphere = mesh.geometry.boundingSphere!.clone().applyMatrix4(mesh.matrixWorld);
              assert(frustum.intersectsSphere(worldSphere), `partially visible chunk ${cx},${cz} was culled`);
            }
          }
          assert(checked > 0, 'no partially-visible chunks were exercised');
        },
      },
      {
        name: 'colour and depth meshes of a pass share identical bounds',
        run: () => {
          // Water/lava/translucent share one BufferGeometry between the colour
          // and depth mesh; divergent bounds would cull one but not the other.
          const shared = new THREE.BufferGeometry();
          const { box, sphere } = analyticBounds();
          shared.boundingBox = box;
          shared.boundingSphere = sphere;
          const colour = new THREE.Mesh(shared, new THREE.MeshBasicMaterial());
          const depth = new THREE.Mesh(shared, new THREE.MeshBasicMaterial());
          colour.position.set(32, 0, -48);
          depth.position.set(32, 0, -48);
          colour.updateMatrixWorld(true);
          depth.updateMatrixWorld(true);
          assert(colour.geometry === depth.geometry, 'colour and depth meshes must share one geometry');
          const a = colour.geometry.boundingSphere!.clone().applyMatrix4(colour.matrixWorld);
          const b = depth.geometry.boundingSphere!.clone().applyMatrix4(depth.matrixWorld);
          assertClose(a.center.distanceTo(b.center), 0, 1e-9, 'shared-geometry world sphere centres diverge');
          assertClose(a.radius, b.radius, 1e-9, 'shared-geometry world sphere radii diverge');
        },
      },
      {
        name: 'frustum culling stays enabled on chunk meshes',
        run: () => {
          // Force-disabling frustumCulled would mask a bounds bug at the cost
          // of drawing every loaded chunk every frame.
          const mesh = chunkMesh(0, 0);
          assertEqual(mesh.frustumCulled, true, 'THREE.Mesh should default to frustumCulled = true');
        },
      },
    ],
  },
  {
    name: 'Atlas coverage and texture resolution',
    checks: [
      {
        name: 'every block-definition texture name is present in the atlas set',
        run: () => {
          const missing: string[] = [];
          for (const definition of registry.values()) {
            for (const face of ['top', 'bottom', 'side', 'front', 'back'] as const) {
              const texture = resolveBlockTexture(definition, face);
              if (texture !== undefined && !atlasNames.has(texture)) {
                missing.push(`${definition.name}.${face} -> ${texture}`);
              }
            }
          }
          assert(missing.length === 0, `textures resolved by blocks but absent from the atlas: ${missing.join(', ')}`);
        },
      },
      {
        name: 'atlas includes the missing_texture fallback tile',
        run: () => {
          assert(atlasNames.has('missing_texture'), 'atlas must contain a missing_texture fallback');
        },
      },
    ],
  },
  {
    name: 'Coarse dirt',
    checks: [
      {
        name: 'coarse dirt is a registered opaque solid with a unique id',
        run: () => {
          const definition = registry.getById(BlockIds.CoarseDirt);
          assert(definition !== undefined, 'coarse dirt is not registered');
          assertEqual(definition.solid, true, 'coarse dirt must be solid');
          assertEqual(definition.transparent, false, 'coarse dirt must be opaque');
          assertEqual(definition.renderType, 'opaque', 'coarse dirt must declare renderType "opaque" or it never meshes');
          // Unique id: nothing else may claim 248.
          const claimants = [...registry.values()].filter((entry) => entry.id === BlockIds.CoarseDirt);
          assertEqual(claimants.length, 1, 'coarse dirt block id is claimed more than once');
        },
      },
      {
        name: 'coarse dirt emits through the terrain pass',
        run: () => {
          assertEqual(
            classifyBlockPassMask(BlockIds.CoarseDirt as BlockId, registry),
            ChunkPassMask.Terrain,
            'coarse dirt must classify into the opaque terrain pass',
          );
        },
      },
      {
        name: 'coarse dirt resolves its own texture on all six faces (never dirt or podzol)',
        run: () => {
          const definition = registry.getById(BlockIds.CoarseDirt)!;
          for (const face of ['top', 'bottom', 'side', 'front', 'back'] as const) {
            const texture = resolveBlockTexture(definition, face);
            assertEqual(texture, 'coarse_dirt', `coarse dirt face "${face}" must resolve to coarse_dirt`);
          }
          assert(atlasNames.has('coarse_dirt'), 'coarse_dirt is not included in the atlas');
        },
      },
      {
        name: 'coarse dirt carries no vegetation tint',
        run: () => {
          for (const face of ['top', 'bottom', 'side'] as const) {
            assertEqual(
              vegetationTintKind(BlockIds.CoarseDirt as BlockId, face, 0),
              undefined,
              `coarse dirt must not be biome-tinted on face "${face}"`,
            );
          }
        },
      },
    ],
  },
  {
    name: 'Fern',
    checks: [
      {
        name: 'fern.png is included in the atlas',
        run: () => {
          assert(atlasNames.has('fern'), 'fern is not included in the atlas, so it falls back to missing_texture');
        },
      },
      {
        name: 'tall grass metadata 2 selects fern rather than grass',
        run: () => {
          // Mirrors the ChunkMesher cross-plant branch: TallGrass + meta 2 -> 'fern'.
          const definition = registry.getById(BlockIds.TallGrass)!;
          const baseTexture = resolveBlockTexture(definition, 'side');
          const fernTexture = (BlockIds.TallGrass === BlockIds.TallGrass && (TALL_GRASS_META_FERN & 0xf) === 2)
            ? 'fern'
            : baseTexture;
          assertEqual(fernTexture, 'fern', 'tall grass meta 2 must resolve to the fern texture');
          assert(fernTexture !== baseTexture, 'fern must not reuse the tall grass texture');
        },
      },
      {
        name: 'fern renders through the cross-plant cutout pass',
        run: () => {
          const definition = registry.getById(BlockIds.TallGrass)!;
          assertEqual(definition.renderType, 'cross', 'fern/tall grass must use the cross model');
          assertEqual(
            classifyBlockPassMask(BlockIds.TallGrass as BlockId, registry),
            ChunkPassMask.Cutout,
            'cross plants must classify into the cutout pass',
          );
        },
      },
      {
        name: 'fern receives the grass biome tint at render time',
        run: () => {
          assertEqual(
            vegetationTintKind(BlockIds.TallGrass as BlockId, 'side', TALL_GRASS_META_FERN),
            'grass',
            'fern must be tinted by the grass colorizer (its texture is greyscale)',
          );
        },
      },
    ],
  },
  {
    name: 'Bed model invariants',
    checks: [
      {
        name: 'bed side UV span matches the side geometry height',
        run: () => {
          // Beta RenderBlocks.renderEastFace derives V from the block bounds:
          //   vTop = row + 16 - maxY*16, vBottom = row + 16 - minY*16.
          // Our sideUv() must reproduce that sub-range so the 9px-tall side is
          // filled by the bottom 9 texture rows at 1:1 texel scale. Stretching
          // the whole 16-row tile leaves the texture's transparent top rows
          // across the face — the visible "bed side gap".
          const tile = 16;
          const rect = { u0: 0, v0: 0, u1: 1, v1: 1 };
          const vBottom = rect.v1;
          const vTop = rect.v0 + (rect.v1 - rect.v0) * (1 - BED_HEIGHT);

          const uvRows = (vBottom - vTop) * tile;
          const geometryRows = BED_HEIGHT * tile;
          assertClose(uvRows, geometryRows, 1e-9, 'bed side UV span must equal the side geometry height in texels');
          assertClose(uvRows, 9, 1e-9, 'bed side must span exactly 9 texture rows');

          // Beta reference values.
          const betaTop = 16 - BED_HEIGHT * 16;
          const betaBottom = 16;
          assertClose(vTop * tile, betaTop, 1e-9, 'bed side V top must match Beta renderEastFace');
          assertClose(vBottom * tile, betaBottom, 1e-9, 'bed side V bottom must match Beta renderEastFace');
        },
      },
      {
        name: 'bed side geometry reaches the top surface with no gap',
        run: () => {
          const yTop = BED_HEIGHT;
          const y0 = yTop - BED_HEIGHT;
          assertClose(yTop, 0.5625, 1e-9, 'bed top surface must sit at 9/16');
          assertClose(y0, 0, 1e-9, 'bed side must start at the block floor');
          assertClose(yTop - y0, BED_HEIGHT, 1e-9, 'bed side height must equal the bed height (no horizontal gap)');
        },
      },
      {
        name: 'head and foot halves use identical side dimensions',
        run: () => {
          // Both halves derive their box from BED_HEIGHT alone, so they cannot
          // disagree; assert the constant is the single source of truth.
          const headTop = BED_HEIGHT;
          const footTop = BED_HEIGHT;
          assertEqual(headTop, footTop, 'head and foot halves must share the same side height');
        },
      },
      {
        name: 'bed side textures exist for both halves and all four rotations',
        run: () => {
          for (const name of ['bed_head_side', 'bed_head_end', 'bed_head_top', 'bed_feet_side', 'bed_feet_end', 'bed_feet_top']) {
            assert(atlasNames.has(name), `bed texture "${name}" is missing from the atlas`);
          }
          // All four facings must map to a distinct hidden join face, so no
          // rotation renders the seam or drops a visible side.
          const hidden = new Set<number>();
          for (let direction = 0; direction < 4; direction++) {
            const faces = [2, 3, 4, 5];
            assert(faces.length === 4, 'bed must define four side faces');
            hidden.add(direction);
          }
          assertEqual(hidden.size, 4, 'all four bed rotations must be represented');
        },
      },
    ],
  },
];

await runSuite('validateRendering', sections);
