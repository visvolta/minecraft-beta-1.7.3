export function wrapDegrees(value: number): number {
  let wrapped = value % 360;
  if (wrapped < -180) wrapped += 360;
  if (wrapped >= 180) wrapped -= 360;
  return wrapped;
}

export interface LivingYawResult { readonly bodyYaw: number; readonly headYaw: number; }

/**
 * Beta body/head correction with movement priority while actually travelling.
 * Moving bodies ease toward displacement; explicit look remains head-only until
 * the mob stops. Stationary bodies follow a head target beyond the ±75° clamp.
 */
export function updateLivingYaw(bodyYaw: number, movementYaw: number, desiredHeadYaw: number, moving: boolean): LivingYawResult {
  let body = bodyYaw;
  if (moving) {
    body += wrapDegrees(movementYaw - body) * 0.3;
  } else {
    let relative = wrapDegrees(desiredHeadYaw - body);
    relative = Math.max(-75, Math.min(75, relative));
    body = desiredHeadYaw - relative;
    if (relative * relative > 2500) body += relative * 0.2;
  }
  body = bodyYaw + wrapDegrees(body - bodyYaw);
  const relativeHead = Math.max(-75, Math.min(75, wrapDegrees(desiredHeadYaw - body)));
  return { bodyYaw: body, headYaw: body + relativeHead };
}

export function isMovementBackward(dx: number, dz: number, bodyYawDegrees: number): boolean {
  const length = Math.hypot(dx, dz);
  if (length <= 1e-8) return false;
  const yaw = bodyYawDegrees * Math.PI / 180;
  const forwardX = -Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  return dx / length * forwardX + dz / length * forwardZ < 0;
}

export interface LimbResult { readonly amount: number; readonly phaseDelta: number; }
export function updateLimbAnimation(moveDistance: number, currentAmount: number, backwards: boolean): LimbResult {
  const moving = moveDistance > 0.05;
  const amount = currentAmount + ((moving ? 1 : 0) - currentAmount) * 0.3;
  return { amount, phaseDelta: moveDistance * 3 * (backwards ? -1 : 1) };
}
