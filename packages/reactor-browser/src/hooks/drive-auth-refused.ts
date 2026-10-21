import { useSyncExternalStore } from "react";
import {
  isDriveAuthRefused,
  subscribeDriveAuthRefusals,
} from "../actions/drive-auth-refusals.js";

/** Whether the switchboard refused this drive's discovery as an auth error. */
export function useDriveAuthRefused(idOrSlug: string): boolean {
  const get = () => isDriveAuthRefused(idOrSlug);
  return useSyncExternalStore(subscribeDriveAuthRefusals, get, get);
}
