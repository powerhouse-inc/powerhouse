import type { InspectionThrottleConfig } from "@powerhousedao/reactor-api";
import type { ILogger } from "document-model";

const VARS = {
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
    if (!Number.isInteger(n) || n < 1) {
      logger.warn(
        `Ignoring invalid ${name}="${raw}" (expected an integer >= 1)`,
      );
      continue;
    }
    out[field] = n;
  }
  return out;
}
