import type { SharingType } from "@powerhousedao/shared";

export type AppOptions = {
  name: string;
  id: string;
  /** Who built the app, as "Built by …" shows it; Powerhouse when absent. */
  builtBy?: string;
  sharingType: SharingType;
  availableOffline: boolean;
};
