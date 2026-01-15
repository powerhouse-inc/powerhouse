import { useFeatures } from "./features.js";

const FEATURE_LEGACY_READ_ENABLED = "FEATURE_LEGACY_READ_ENABLED";
const FEATURE_LEGACY_READ_ENABLED_DEFAULT = false;

const FEATURE_LEGACY_WRITE_ENABLED = "FEATURE_LEGACY_WRITE_ENABLED";
const FEATURE_LEGACY_WRITE_ENABLED_DEFAULT = false;

const FEATURE_CHANNEL_SYNC_ENABLED = "FEATURE_CHANNEL_SYNC_ENABLED";
const FEATURE_CHANNEL_SYNC_ENABLED_DEFAULT = true;

const FEATURE_INSPECTOR_ENABLED = "FEATURE_INSPECTOR_ENABLED";
const FEATURE_INSPECTOR_ENABLED_DEFAULT = false;

/**
 * Synchronous helper to check if legacy read is enabled.
 * For use in action functions that cannot be async.
 */
export function isLegacyReadEnabledSync(): boolean {
  return (
    window.ph?.features?.get(FEATURE_LEGACY_READ_ENABLED) ??
    FEATURE_LEGACY_READ_ENABLED_DEFAULT
  );
}

/**
 * Synchronous helper to check if legacy write is enabled.
 * For use in action functions that cannot be async.
 */
export function isLegacyWriteEnabledSync(): boolean {
  return (
    window.ph?.features?.get(FEATURE_LEGACY_WRITE_ENABLED) ??
    FEATURE_LEGACY_WRITE_ENABLED_DEFAULT
  );
}

/**
 * Synchronous helper to check if channel sync is enabled.
 * For use in action functions that cannot be async.
 */
export function isChannelSyncEnabledSync(): boolean {
  return (
    window.ph?.features?.get(FEATURE_CHANNEL_SYNC_ENABLED) ??
    FEATURE_CHANNEL_SYNC_ENABLED_DEFAULT
  );
}

/**
 * React hook to check if legacy read is enabled.
 */
export function useLegacyReadEnabled(): boolean {
  const features = useFeatures();
  return (
    features?.get(FEATURE_LEGACY_READ_ENABLED) ??
    FEATURE_LEGACY_READ_ENABLED_DEFAULT
  );
}

/**
 * React hook to check if legacy write is enabled.
 */
export function useLegacyWriteEnabled(): boolean {
  const features = useFeatures();
  return (
    features?.get(FEATURE_LEGACY_WRITE_ENABLED) ??
    FEATURE_LEGACY_WRITE_ENABLED_DEFAULT
  );
}

/**
 * React hook to check if channel sync is enabled.
 */
export function useChannelSyncEnabled(): boolean {
  const features = useFeatures();
  return (
    features?.get(FEATURE_CHANNEL_SYNC_ENABLED) ??
    FEATURE_CHANNEL_SYNC_ENABLED_DEFAULT
  );
}

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
