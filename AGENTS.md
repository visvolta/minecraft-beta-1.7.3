# Development Rules

## Scope and source of truth

- Recreate **Minecraft Beta 1.7.3** behaviour in a browser using TypeScript, Three.js/WebGL, Vite, HTML, and SCSS. Keep the project browser-based.
- Treat the existing code and documentation as the current architecture source of truth. For original behaviour, consult https://github.com/jacobo-mc/mc_b1.7.3_release.git; adapt behaviour to TypeScript rather than copying Java blindly. Do not substitute modern Minecraft behaviour.
- Do not introduce an engine, ECS, UI/state-management, physics, rendering framework, or new dependency without explicit approval. Do not upgrade dependencies or replace npm/package-lock.json without approval.

## Architecture

- Preserve the existing layout. Prefer small, targeted, modular changes with narrow responsibilities and explicit APIs; avoid global mutable state, circular dependencies, catch-all utilities, unnecessary abstractions, and style-only rewrites.
- Separate rendering, simulation, world data, generation, and input. Keep worker-safe logic independent of browser APIs.
- Keep constants named near their owning system. Keep public APIs minimal. Use strict TypeScript with proper types; do not use `any`, weaken compiler settings, hide broken invariants, or leave dead/debug/temporary code.
- In hot paths, avoid unjustified allocations and reuse temporaries where practical. Add comments for constraints, reasoning, and non-obvious formulas, not obvious syntax.

## Beta-specific invariants

- Target chunk dimensions are **16 × 128 × 16**. Use culled-face meshing; do not use greedy meshing.
- Generation and biomes must be deterministic for a world seed, including negative coordinates. Avoid chunk-border seams; optimisations must not alter deterministic or simulation results.
- Handle missing/unloaded chunks consistently in every system. Rendering changes must not change world simulation.
- Preserve Beta texture orientation, UV, tint, transparency, pixel filtering, and atlas conventions. Do not generate or replace user-supplied artwork.

## Required workflow

Before every major implementation stage:
1. Inspect the relevant existing system(s) and research Beta behaviour when needed.
2. Ask **exactly six** concise, high-value technical questions, each with options and a recommendation; wait for answers.
3. Present a short implementation plan and request confirmation.
4. Implement only the approved scope.

For each implementation stage, make the smallest coherent change; explain any cross-system file change. Do not move, rename, delete, broadly format, or clean up unrelated files. Never commit, push, merge, open a PR, or change branches unless explicitly asked. Never use destructive Git operations or discard user work without explicit permission.

## Validation and reporting

After changes, run all relevant available checks: typecheck, targeted validation, production build, runtime/browser-console checks, worker checks, and deterministic/chunk-boundary/negative-coordinate checks as applicable. Clearly distinguish pre-existing failures from introduced failures and never report unrun checks as tested. Review the final Git diff.

End every task with:
- **Summary**
- **Validation** (each command/test and result)
- **Files added**
- **Files changed**
- **Files deleted**
- **Existing issues**
- **Next step** (do not start it automatically)
