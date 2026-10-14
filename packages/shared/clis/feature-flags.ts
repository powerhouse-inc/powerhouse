/**
 * Feature toggles shared by the CLIs (ph-cli and ph-cmd's dispatch/help).
 * Hand-rolled env predicates by the CLI convention — deliberately no
 * OpenFeature dependency here; that stack belongs to the runtime apps.
 */

/**
 * Gates the uniform-runners surface: the `ph run` command (registration,
 * help listing, and ph-cmd forwarding), host-name sugar, and the `ph init`
 * hosts/ scaffold. Off by default; set to `1` or `true` to enable. Rollout
 * plan: docs/plans/2026-10-13-uniform-runners.md.
 */
export const UNIFORM_RUNNERS_FLAG = "FEATURE_UNIFORM_RUNNERS_ENABLED";

export function isUniformRunnersEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const value = env[UNIFORM_RUNNERS_FLAG]?.trim().toLowerCase();
  return value === "1" || value === "true";
}
