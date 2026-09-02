// Shim for @/hooks/flags-hooks: every AP feature flag reads as off/unset.
export const flagsHooks = {
  useFlag<T>(_flag: unknown): { data: T | null } {
    return { data: null };
  },
  useWebsiteBranding(): null {
    return null;
  },
};
