import type { SharingType } from "@powerhousedao/shared";

export type AppOptions = {
  name: string;
  id: string;
  sharingType: SharingType;
  availableOffline: boolean;
};
