/**
 * Logical UV scale for supplied fluid animation sheets. Values operate on
 * frame-local UVs around their centre; source assets are never resampled.
 * Water remains at the accepted scale, while lava flow is independently
 * tunable because its supplied sheet has a different visual density.
 */
export const FLUID_RENDER_SETTINGS = {
  waterFlowScale: .55,
  lavaFlowScale: 0.5,
  // Final RGB lift for flowing water only. Keep lighting, AO and tint
  // inputs untouched; tune this single value against stationary water.
  waterFlowBrightness: 1,
} as const;
