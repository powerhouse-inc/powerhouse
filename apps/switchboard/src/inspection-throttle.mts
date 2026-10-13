import type { InspectionThrottleConfig } from "@powerhousedao/reactor-api";
import { parseNonNegativeInt } from "./env.mjs";

const NAME = "PH_INSPECTION_CALLS_PER_MINUTE";

/** Unset keeps reactor-api's default; an invalid value fails boot. */
export function inspectionThrottleFromEnv(
  env: NodeJS.ProcessEnv,
): Partial<InspectionThrottleConfig> {
  const callsPerMinute = parseNonNegativeInt(env[NAME], NAME);
  if (callsPerMinute === undefined) {
    return {};
  }
  if (callsPerMinute < 1) {
    throw new Error(`${NAME} must be at least 1, got "${env[NAME]}"`);
  }
  return { callsPerMinute };
}
