import type { IRenown, LoginStatus, User } from "@renown/sdk";
import { useEffect, useState } from "react";
import { makePHEventFunctions } from "./make-ph-event-functions.js";

/** Login status extended with "initializing" for when the Renown instance is being built */
export type RenownLoginStatus = LoginStatus | "initializing";

const renownEventFunctions = makePHEventFunctions("renown");

/** Returns the renown instance */
export const useRenown: () => IRenown | undefined =
  renownEventFunctions.useValue;

/** Sets the renown instance */
export const setRenown: (value: IRenown | undefined) => void =
  renownEventFunctions.setValue;

/** Returns the DID from the renown instance */
export function useDid() {
  const renown = useRenown();
  return renown?.did;
}

/** Returns the current user from the renown instance, subscribing to user events */
export function useUser(): User | undefined {
  const renown = useRenown();
  const [user, setUser] = useState<User | undefined>(() => renown?.user);

  useEffect(() => {
    setUser(renown?.user);
    if (!renown) return;
    return renown.on("user", setUser);
  }, [renown]);

  return user;
}

/** Returns the login status, subscribing to renown status events.
 * Returns "initializing" while the Renown instance is being built. */
export function useLoginStatus(): RenownLoginStatus {
  const renown = useRenown();
  const [status, setStatus] = useState<RenownLoginStatus>(() =>
    renown ? renown.status : "initializing",
  );

  useEffect(() => {
    setStatus(renown ? renown.status : "initializing");
    if (!renown) return;
    return renown.on("status", setStatus);
  }, [renown]);

  return status;
}

/** Adds an event handler for the renown instance */
export const addRenownEventHandler: () => void =
  renownEventFunctions.addEventHandler;
