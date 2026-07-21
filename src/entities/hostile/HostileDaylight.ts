import type { EntityWorldContext } from '../core/EntityContext';
import { isExposedToSky, isWaterInAABB } from '../living/HazardDetection';
import type { HostileEntity } from './HostileEntity';

export interface HostileDaylightExposure {
  readonly daytime: boolean;
  readonly brightness: number;
  readonly skyVisible: boolean;
  readonly inWater: boolean;
  readonly canIgnite: boolean;
}

/** Shared Zombie/Skeleton sunlight preconditions; ignition remains species-owned. */
export function evaluateHostileDaylight(entity: HostileEntity, ctx: EntityWorldContext): HostileDaylightExposure {
  const x = Math.floor(entity.position.x);
  const y = Math.floor(entity.position.y);
  const z = Math.floor(entity.position.z);
  const sky = ctx.blockUpdateWorld.getSkylight(x, y, z);
  const block = ctx.blockUpdateWorld.getBlocklight(x, y, z);
  const brightness = Math.max(block, sky - (ctx.skylightSubtracted?.() ?? 0)) / 15;
  const daytime = ctx.isDaytime?.() ?? false;
  const skyVisible = isExposedToSky(ctx.chunkManager, x, y, z);
  const inWater = isWaterInAABB(ctx.blockUpdateWorld, entity.getAABB());
  return { daytime, brightness, skyVisible, inWater, canIgnite: daytime && brightness > 0.5 && skyVisible && !inWater };
}
