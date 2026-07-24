import type { IRenown, LoginStatus, User } from "@renown/sdk";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRenownInitialUser } from "../renown/initial-user.js";
import type { LOADING } from "../types/global.js";
import { loading } from "./loading.js";
import { makePHEventFunctions } from "./make-ph-event-functions.js";

const renownEventFunctions = makePHEventFunctions("renown");

/** Adds an event handler for the renown instance */
export const addRenownEventHandler: () => void =
  renownEventFunctions.addEventHandler;

/** Returns the renown instance */
export const useRenown: () => IRenown | LOADING | undefined =
  renownEventFunctions.useValue;

/** Sets the renown instance */
export const setRenown: (value: IRenown | LOADING | undefined) => void =
  renownEventFunctions.setValue;

/** Returns the DID from the renown instance */
export function useDid() {
  const renown = useRenown();
  return renown?.did;
}

/** Returns the current user from the renown instance, subscribing to user events */
export function useUser(): User | undefined {
  const renown = useRenown();
  // Seed (cookie for SSR, localStorage for client-only) covers the first paint;
  // once the SDK is ready it is authoritative, so a logout/revoke clears it.
  const initialUser = useRenownInitialUser();
  const instance = renown ? renown : undefined;
  const [user, setUser] = useState<User | undefined>(
    instance ? instance.user : initialUser,
  );

  useEffect(() => {
    if (instance) {
      setUser(instance.user);
      return instance.on("user", setUser);
    }
  }, [instance]);

  return user;
}

/** Returns the login status, subscribing to renown status events */
export function useLoginStatus(): LoginStatus | "loading" | undefined {
  const renown = useRenown();
  return useSyncExternalStore(
    (cb) => {
      if (!renown) {
        return () => {};
      }
      return renown.on("status", cb);
    },
    () => (renown === loading ? "loading" : renown?.status),
    () => undefined,
  );
}
