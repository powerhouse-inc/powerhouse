import type { ReactNode } from "react";
import type { syncStatuses } from "./constants/syncing.js";

export type * from "./components/types.js";

export type DriveLocation = "LOCAL" | "CLOUD" | "SWITCHBOARD";

export type OptionMetadata = {
  label: ReactNode;
  icon: React.JSX.Element;
  className?: string;
};

export type SyncStatuses = typeof syncStatuses;
export type SyncStatus = SyncStatuses[number];
