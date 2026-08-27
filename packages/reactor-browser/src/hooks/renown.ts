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

// Structural equality for persisted users (plain JSON), so a re-parse of the
// same credential keeps its object identity for did-keyed consumers.
function sameUser(a: User | undefined, b: User | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

// What the SDK says once it exists. Its `user` is a synchronous storage read,
// so undefined with status "initial" means nothing was restored and a stale seed
// (e.g. a cookie outliving localStorage) must go; during "checking"/"authorized"
// the SDK owns a session it has not published yet, so the seed stands.
function resolveInstanceUser(
  instance: IRenown,
  seed: User | undefined,
): User | undefined {
  const restored = instance.user;
  if (restored) return sameUser(seed, restored) ? seed : restored;
  return instance.status === "initial" ? undefined : seed;
}

interface TrackedUser {
  instance: IRenown | undefined;
  user: User | undefined;
}

/** Returns the current user from the renown instance, subscribing to user events */
export function useUser(): User | undefined {
  const renown = useRenown();
  // Seed (cookie on the server, localStorage once mounted) covers the first
  // paint; the SDK is authoritative after, so a logout/revoke clears it.
  const initialUser = useRenownInitialUser();
  const instance = renown ? renown : undefined;
  // Tagged with the instance it came from so an instance swap resyncs in the
  // same render — an effect would leave one frame of stale state.
  const [tracked, setTracked] = useState<TrackedUser>(() => ({
    instance,
    user: instance ? resolveInstanceUser(instance, initialUser) : initialUser,
  }));
  let current = tracked;
  if (tracked.instance !== instance) {
    current = {
      instance,
      user: instance
        ? resolveInstanceUser(instance, tracked.user ?? initialUser)
        : tracked.user,
    };
    setTracked(current);
  }

  useEffect(() => {
    if (!instance) return;
    return instance.on("user", (user) =>
      setTracked((prev) => ({
        instance,
        user: sameUser(prev.user, user) ? prev.user : user,
      })),
    );
  }, [instance]);

  // Until the SDK exists the seed wins, which is what lands the post-mount
  // localStorage read.
  return instance ? current.user : (initialUser ?? current.user);
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
