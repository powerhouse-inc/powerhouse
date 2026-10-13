import type { BooleanFlagSource } from "./workflow-runtime.mjs";

/** The env var and OpenFeature flag key that can keep the inspection subgraph unmounted. */
export const INSPECTION_ENABLED = "INSPECTION_ENABLED";

/** Whether `/graphql/inspection` is mounted when neither the host nor INSPECTION_ENABLED says. */
export const INSPECTION_ENABLED_DEFAULT = true;

export interface InspectionFlagInput {
  featureFlags: BooleanFlagSource;
  /** The host's `inspection` option. */
  option?: boolean;
}

/** Whether to mount `/graphql/inspection`. A host's `inspection: false` wins;
 * otherwise INSPECTION_ENABLED decides, falling back to the host's option and
 * then INSPECTION_ENABLED_DEFAULT. */
export async function resolveInspectionEnabled({
  featureFlags,
  option,
}: InspectionFlagInput): Promise<boolean> {
  if (option === false) return false;
  return featureFlags.getBooleanValue(
    INSPECTION_ENABLED,
    option ?? INSPECTION_ENABLED_DEFAULT,
  );
}
