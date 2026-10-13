import type { InspectionThrottleConfig } from "@powerhousedao/reactor-api";
import type { ILogger } from "document-model";

const VARS = {
  maxConcurrent: "PH_INSPECTION_MAX_CONCURRENT",
  maxQueued: "PH_INSPECTION_MAX_QUEUED",
  callsPerMinute: "PH_INSPECTION_CALLS_PER_MINUTE",
} as const satisfies Record<keyof InspectionThrottleConfig, string>;

/** Unset or invalid values keep reactor-api's default; invalid ones warn. */
export function inspectionThrottleFromEnv(
  env: NodeJS.ProcessEnv,
  logger: Pick<ILogger, "warn">,
): Partial<InspectionThrottleConfig> {
  const out: Partial<InspectionThrottleConfig> = {};
  for (const [field, name] of Object.entries(VARS) as [
    keyof InspectionThrottleConfig,
    string,
  ][]) {
    const raw = env[name]?.trim();
    if (!raw) continue;
    const n = Number(raw);
    // maxQueued may be 0 (refuse instead of waiting); the others must be >= 1.
    const min = field === "maxQueued" ? 0 : 1;
    if (!Number.isInteger(n) || n < min) {
      logger.warn(
        `Ignoring invalid ${name}="${raw}" (expected an integer >= ${min})`,
      );
      continue;
    }
    out[field] = n;
  }
  return out;
}
