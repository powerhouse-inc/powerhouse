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

// Order-insensitive structural equality for plain JSON (what a persisted user
// is): the cookie and localStorage paths build the same user with different key
// order, and both must keep one object identity for did-keyed consumers.
function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keys = Object.keys(ra).filter((k) => ra[k] !== undefined);
  if (keys.length !== Object.keys(rb).filter((k) => rb[k] !== undefined).length)
    return false;
  return keys.every((k) => jsonEqual(ra[k], rb[k]));
}

function sameUser(a: User | undefined, b: User | undefined): boolean {
  return jsonEqual(a, b);
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
  // Tagged with the instance it came from. On a swap the value for this render
  // is derived here (state alone would be one frame stale) and persisted after
  // commit; the derivation is pure, so re-renders before that agree.
  const [tracked, setTracked] = useState<TrackedUser>(() => ({
    instance,
    user: instance ? resolveInstanceUser(instance, initialUser) : initialUser,
  }));
  const current: TrackedUser =
    tracked.instance === instance
      ? tracked
      : {
          instance,
          user: instance
            ? resolveInstanceUser(instance, tracked.user ?? initialUser)
            : tracked.user,
        };

  useEffect(() => {
    if (current !== tracked) setTracked(current);
  }, [current, tracked]);

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
