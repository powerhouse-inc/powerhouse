import { useFeatures } from "./features.js";

/**
 * Synchronous helper to check if legacy read is enabled.
 * For use in action functions that cannot be async.
 * Defaults to true (legacy enabled) if features not loaded.
 */
export function isLegacyReadEnabledSync(): boolean {
  return window.ph?.features?.get("FEATURE_LEGACY_READ_ENABLED") ?? true;
}

/**
 * Synchronous helper to check if legacy write is enabled.
 * For use in action functions that cannot be async.
 * Defaults to true (legacy enabled) if features not loaded.
 */
export function isLegacyWriteEnabledSync(): boolean {
  return window.ph?.features?.get("FEATURE_LEGACY_WRITE_ENABLED") ?? true;
}

/**
 * Synchronous helper to check if channel sync is enabled.
 * For use in action functions that cannot be async.
 * Defaults to false (legacy sync) if features not loaded.
 */
export function isChannelSyncEnabledSync(): boolean {
  return window.ph?.features?.get("FEATURE_CHANNEL_SYNC_ENABLED") ?? false;
}

/**
 * React hook to check if legacy read is enabled.
 * Defaults to true (legacy enabled) if features not loaded.
 */
export function useLegacyReadEnabled(): boolean {
  const features = useFeatures();
  return features?.get("FEATURE_LEGACY_READ_ENABLED") ?? true;
}

/**
 * React hook to check if legacy write is enabled.
 * Defaults to true (legacy enabled) if features not loaded.
 */
export function useLegacyWriteEnabled(): boolean {
  const features = useFeatures();
  return features?.get("FEATURE_LEGACY_WRITE_ENABLED") ?? true;
}

/**
 * React hook to check if channel sync is enabled.
 * Defaults to false (legacy sync) if features not loaded.
 */
export function useChannelSyncEnabled(): boolean {
  const features = useFeatures();
  return features?.get("FEATURE_CHANNEL_SYNC_ENABLED") ?? false;
}

/**
 * Synchronous helper to check if inspector is enabled.
 * Defaults to false if features not loaded.
 */
export function isInspectorEnabledSync(): boolean {
  return window.ph?.features?.get("FEATURE_INSPECTOR_ENABLED") ?? false;
}

/**
 * React hook to check if inspector is enabled.
 * Defaults to false if features not loaded.
 */
export function useInspectorEnabled(): boolean {
  const features = useFeatures();
  return features?.get("FEATURE_INSPECTOR_ENABLED") ?? false;
}
