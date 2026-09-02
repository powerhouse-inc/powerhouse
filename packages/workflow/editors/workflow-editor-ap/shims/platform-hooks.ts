// Shim for @/hooks/platform-hooks: a minimal platform with all plan gates off.
import type { PlatformWithoutSensitiveData } from "../vendor/shared/index.js";

const platform = {
  id: "ph-platform",
  name: "Powerhouse",
  plan: new Proxy({} as Record<string, boolean>, {
    get: () => false,
  }),
  pinnedPieces: [] as string[],
  pieceSelectorConfig: undefined,
} as unknown as PlatformWithoutSensitiveData;

export const platformHooks = {
  useCurrentPlatform(): { platform: PlatformWithoutSensitiveData } {
    return { platform };
  },
};
