import { useSyncExternalStore } from "react";
import { subscribeToUser } from "../internal/events.js";

export function useUser() {
  const user = useSyncExternalStore(subscribeToUser, () => window.user);
  return user;
}
