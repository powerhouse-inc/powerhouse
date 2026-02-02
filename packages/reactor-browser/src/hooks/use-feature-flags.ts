import { useFeatures } from "./features.js";

const FEATURE_INSPECTOR_ENABLED = "FEATURE_INSPECTOR_ENABLED";
const FEATURE_INSPECTOR_ENABLED_DEFAULT = false;

/**
 * Synchronous helper to check if inspector is enabled.
 */
export function isInspectorEnabledSync(): boolean {
  return (
    window.ph?.features?.get(FEATURE_INSPECTOR_ENABLED) ??
    FEATURE_INSPECTOR_ENABLED_DEFAULT
  );
}

/**
 * React hook to check if inspector is enabled.
 */
export function useInspectorEnabled(): boolean {
  const features = useFeatures();
  return (
    features?.get(FEATURE_INSPECTOR_ENABLED) ??
    FEATURE_INSPECTOR_ENABLED_DEFAULT
  );
}
