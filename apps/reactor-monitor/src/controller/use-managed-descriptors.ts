import type { ReactorDescriptor } from "@powerhousedao/reactor-monitor";
import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { MonitoringSetsStore } from "../monitoring-sets.js";
import { setRemoteBearer } from "../provisioning.js";
import type { Instance } from "./api.js";
import {
  backoffMs,
  ControllerRequestError,
  controllerFromDocument,
  errorMessage,
  isNotFound,
  type ControllerClient,
} from "./client.js";
import {
  coveredBy,
  instanceReactors,
  isManaged,
  managedDescriptors,
  ownerOf,
  plainRemotes,
  servesDescriptor,
  switchboardOf,
  type InstanceReactors,
  type ManagedBy,
  type ManagedDescriptor,
} from "./managed.js";

const REPROBE_MS = 3000;

type Probe =
  | { state: "probing" }
  | { state: "released" }
  | { state: "withheld"; reason: string };

export interface WithheldDescriptor {
  name: string;
  managedBy: ManagedBy;
  reason: string;
}

export interface ManagedNotice {
  id: number;
  text: string;
}

export interface UseManagedDescriptorsOptions {
  store: MonitoringSetsStore;
  descriptors: readonly ReactorDescriptor[];
  setDescriptors: Dispatch<SetStateAction<ReactorDescriptor[]>>;
  onAttached?: (name: string) => void;
  /** Default: the page's controller, if its server injected one. */
  client?: ControllerClient;
  reprobeMs?: number;
}

export interface ManagedDescriptors {
  client: ControllerClient | undefined;
  /** What the provider may provision: managed ones only once probed live. */
  visible: ReactorDescriptor[];
  withheld: readonly WithheldDescriptor[];
  /** Instance ids with a descriptor in the active set. */
  attachedIds: ReadonlySet<string>;
  /** Whether every switchboard the instance serves is in the active set. */
  isAttached: (instance: Instance) => boolean;
  /** Plain remote descriptors a running instance serves, by name: those instances. */
  covered: ReadonlyMap<string, readonly string[]>;
  /** Ready remotes known to be unreachable, by name: why. */
  unreachable: ReadonlyMap<string, string>;
  /** Records a remote's last re-check; `reason` undefined when it answered. */
  setUnreachable: (name: string, reason?: string) => void;
  /** Browser reactors in the active set, by the instance that owns them. */
  owned: ReadonlyMap<string, readonly string[]>;
  /** Each instance's reactors in the active set, by the member each one is. */
  reactors: ReadonlyMap<string, InstanceReactors>;
  notices: readonly ManagedNotice[];
  dismissNotice: (id: number) => void;
  /** Adds a descriptor per switchboard the instance serves and the set lacks. */
  attach: (instance: Instance) => void;
  /** handleKill's managed branch: stops the descriptor's instance. */
  kill: (name: string) => void;
  stopInstance: (id: string) => Promise<void>;
  /** Drops everything of an instance that is already gone. */
  dropInstance: (id: string) => void;
  stopAll: () => Promise<void>;
  /** Drops released descriptors whose instance exited or is gone. */
  reconcile: (instances: readonly Instance[]) => void;
  forget: (name: string) => void;
}

const keyOf = (descriptor: ManagedDescriptor) =>
  `${descriptor.name}\u0000${descriptor.managedBy.instanceId}\u0000${descriptor.managedBy.member ?? ""}`;

const LIVE = new Set(["starting", "running"]);

/** A descriptor's name and drive address: a same-named reactor elsewhere is another. */
const identityOf = (descriptor: ReactorDescriptor) =>
  `${descriptor.name}\u0000${descriptor.remote?.url ?? ""}`;

/** One descriptor per (instance, member). */
const targetOf = (managedBy: ManagedBy) =>
  `${managedBy.instanceId}\u0000${managedBy.member ?? ""}`;

export function useManagedDescriptors(
  options: UseManagedDescriptorsOptions,
): ManagedDescriptors {
  const { store, descriptors, setDescriptors, onAttached } = options;
  const reprobeMs = options.reprobeMs ?? REPROBE_MS;
  const [documentClient] = useState(() => controllerFromDocument());
  const client = options.client ?? documentClient;

  const probes = useRef(new Map<string, Probe>());
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  const latest = useRef(descriptors);
  latest.current = descriptors;
  const mounted = useRef(true);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  /** Consecutive failed probes per key, for backoff. */
  const failures = useRef(new Map<string, number>());
  /** Instances with a stop in flight: never released or attached. */
  const stopping = useRef(new Set<string>());
  /** Owners of browser reactors: being asked about, or known to exist. */
  const owners = useRef(new Map<string, "checking" | "live">());
  useEffect(() => {
    mounted.current = true;
    const pending = timers.current;
    return () => {
      mounted.current = false;
      for (const timer of pending) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  /** Per running instance, the plain remote descriptors it serves, as identities. */
  const covering = useRef(new Map<string, ReadonlySet<string>>());
  /** Unreachable marks by name, each for the descriptor (url) it was made on. */
  const [marks, setMarks] = useState<
    ReadonlyMap<string, { identity: string; reason: string }>
  >(() => new Map());
  /** Marks `names` unreachable for `reason`, or clears them without one. */
  const mark = useCallback((names: readonly string[], reason?: string) => {
    const current = new Map(
      latest.current.map((d) => [d.name, identityOf(d)] as const),
    );
    setMarks((previous) => {
      const next = new Map(previous);
      for (const name of names) {
        const identity = current.get(name);
        if (reason === undefined) next.delete(name);
        // A name that left the set meanwhile is not marked.
        else if (identity !== undefined) next.set(name, { identity, reason });
      }
      const same =
        next.size === previous.size &&
        [...next].every(
          ([name, m]) =>
            previous.get(name)?.identity === m.identity &&
            previous.get(name)?.reason === m.reason,
        );
      return same ? previous : next;
    });
  }, []);
  const setUnreachable = useCallback(
    (name: string, reason?: string) => mark([name], reason),
    [mark],
  );

  /** Records what a running instance serves; returns the names newly covered. */
  const cover = useCallback((instance: Instance): string[] => {
    const before = covering.current.get(instance.id) ?? new Set<string>();
    const byName = new Map(latest.current.map((d) => [d.name, d] as const));
    const covered = coveredBy(instance, latest.current).map((name) => ({
      name,
      identity: identityOf(byName.get(name)!),
    }));
    const identities = new Set(covered.map((c) => c.identity));
    if (identities.size > 0) covering.current.set(instance.id, identities);
    else covering.current.delete(instance.id);
    const fresh = covered.filter((c) => !before.has(c.identity));
    if (
      fresh.length > 0 ||
      identities.size !== before.size ||
      [...before].some((identity) => !identities.has(identity))
    ) {
      bump();
    }
    return fresh.map((c) => c.name);
  }, []);

  const [notices, setNotices] = useState<ManagedNotice[]>([]);
  const nextNotice = useRef(0);
  const notify = useCallback((text: string) => {
    const id = nextNotice.current++;
    setNotices((previous) => [...previous, { id, text }]);
  }, []);

  const update = useCallback(
    (change: (previous: ReactorDescriptor[]) => ReactorDescriptor[]) => {
      setDescriptors((previous) => {
        const next = change(previous);
        if (next.length === previous.length) return previous;
        store.setActiveDescriptors(next);
        return next;
      });
    },
    [setDescriptors, store],
  );

  /** Drops matching managed descriptors, and the browser reactors of `gone`. */
  const drop = useCallback(
    (
      match: (descriptor: ManagedDescriptor) => boolean,
      notice?: string,
      gone: ReadonlySet<string> = new Set(),
    ) => {
      const ownedGone = (d: ReactorDescriptor) => {
        const owner = ownerOf(d);
        return owner !== undefined && gone.has(owner);
      };
      const dropped = latest.current.filter(isManaged).filter(match);
      const owned = latest.current.filter(ownedGone);
      if (dropped.length === 0 && owned.length === 0) return;
      for (const descriptor of dropped) {
        probes.current.delete(keyOf(descriptor));
        setRemoteBearer(descriptor.remote.url, "");
      }
      const names = new Set(
        [...dropped, ...owned].map((descriptor) => descriptor.name),
      );
      const kept = (d: ReactorDescriptor) =>
        !(names.has(d.name) && ((isManaged(d) && match(d)) || ownedGone(d)));
      latest.current = latest.current.filter(kept);
      update((previous) => previous.filter(kept));
      if (notice) {
        for (const descriptor of dropped) {
          notify(`${descriptor.name}: ${notice}`);
        }
      }
      bump();
    },
    [notify, update],
  );

  const settle = useCallback(
    (descriptor: ManagedDescriptor, probe: Probe | undefined) => {
      const key = keyOf(descriptor);
      if (probe) probes.current.set(key, probe);
      else probes.current.delete(key);
      bump();
    },
    [],
  );

  useEffect(() => {
    // A descriptor that left the active set is probed afresh when it returns.
    const present = new Set(descriptors.filter(isManaged).map(keyOf));
    for (const key of probes.current.keys()) {
      if (!present.has(key)) {
        probes.current.delete(key);
        failures.current.delete(key);
      }
    }
    const identities = new Set(descriptors.map(identityOf));
    setMarks((previous) =>
      [...previous.values()].every((m) => identities.has(m.identity))
        ? previous
        : new Map([...previous].filter(([, m]) => identities.has(m.identity))),
    );
    const ownerIds = new Set(descriptors.flatMap((d) => ownerOf(d) ?? []));
    for (const id of owners.current.keys()) {
      if (!ownerIds.has(id)) owners.current.delete(id);
    }
    if (!client) return;
    for (const id of ownerIds) {
      if (owners.current.has(id)) continue;
      owners.current.set(id, "checking");
      void (async () => {
        let live: boolean | undefined;
        try {
          live = LIVE.has((await client.get(id)).status);
        } catch (error) {
          live = isNotFound(error) ? false : undefined;
        }
        if (!mounted.current || owners.current.get(id) !== "checking") return;
        if (live === true) {
          owners.current.set(id, "live");
        } else if (live === false) {
          owners.current.delete(id);
          drop(() => false, undefined, new Set([id]));
        } else {
          const timer = setTimeout(() => {
            timers.current.delete(timer);
            if (owners.current.get(id) === "checking") {
              owners.current.delete(id);
              bump();
            }
          }, reprobeMs);
          timers.current.add(timer);
        }
      })();
    }
    const reprobe = (descriptor: ManagedDescriptor, failed: boolean) => {
      const key = keyOf(descriptor);
      const count = failed ? (failures.current.get(key) ?? 0) + 1 : 0;
      failures.current.set(key, count);
      const timer = setTimeout(
        () => {
          timers.current.delete(timer);
          if (probes.current.get(key)?.state === "withheld") {
            settle(descriptor, undefined);
          }
        },
        backoffMs(reprobeMs, count),
      );
      timers.current.add(timer);
    };
    for (const descriptor of descriptors.filter(isManaged)) {
      if (probes.current.has(keyOf(descriptor))) continue;
      probes.current.set(keyOf(descriptor), { state: "probing" });
      const { instanceId } = descriptor.managedBy;
      const sameDescriptor = (d: ManagedDescriptor) =>
        keyOf(d) === keyOf(descriptor);
      void (async () => {
        let outcome: Probe | { drop: string; moved?: true };
        let failed = false;
        let fatal = false;
        try {
          const instance = await client.get(instanceId);
          outcome = stopping.current.has(instanceId)
            ? { state: "withheld", reason: "stopping" }
            : instance.status === "starting"
              ? { state: "withheld", reason: "still starting" }
              : instance.status !== "running"
                ? { drop: `its switchboard is ${instance.status}` }
                : !servesDescriptor(instance, descriptor)
                  ? {
                      drop: "its switchboard now serves another URL",
                      moved: true,
                    }
                  : { state: "released" };
        } catch (error) {
          failed = true;
          fatal =
            error instanceof ControllerRequestError &&
            error.code === "bad_token";
          outcome = isNotFound(error)
            ? { drop: "the controller no longer runs it" }
            : { state: "withheld", reason: errorMessage(error) };
        }
        if (!mounted.current) return;
        // The active set may have changed while the probe was in flight.
        if (!latest.current.filter(isManaged).some(sameDescriptor)) {
          probes.current.delete(keyOf(descriptor));
          return;
        }
        if ("drop" in outcome) {
          drop(
            sameDescriptor,
            outcome.drop,
            outcome.moved ? undefined : new Set([instanceId]),
          );
          return;
        }
        settle(descriptor, outcome);
        if (outcome.state === "withheld" && !fatal) reprobe(descriptor, failed);
      })();
    }
  }, [client, descriptors, version, drop, settle, reprobeMs]);

  const managedList = descriptors.filter(isManaged);
  const released = (descriptor: ManagedDescriptor) =>
    probes.current.get(keyOf(descriptor))?.state === "released";

  const visible = descriptors.filter(
    (descriptor) => !isManaged(descriptor) || released(descriptor),
  );

  const withheld = managedList.flatMap((descriptor): WithheldDescriptor[] => {
    const probe = probes.current.get(keyOf(descriptor));
    if (probe?.state === "released") return [];
    const reason = !client
      ? "no controller on this page"
      : probe?.state === "withheld"
        ? probe.reason
        : "checking";
    return [{ name: descriptor.name, managedBy: descriptor.managedBy, reason }];
  });

  const attachedIds = new Set(
    managedList.map((descriptor) => descriptor.managedBy.instanceId),
  );
  const isAttached = (instance: Instance) => {
    if (attachedIds.has(instance.id)) return true;
    const plain = plainRemotes(descriptors);
    const served = managedDescriptors(instance, []);
    return (
      served.length > 0 &&
      served.every((descriptor) => plain.has(switchboardOf(descriptor) ?? ""))
    );
  };
  const identities = new Map(descriptors.map((d) => [identityOf(d), d.name]));
  const covered = new Map<string, string[]>();
  for (const [id, coveredIds] of covering.current) {
    for (const identity of coveredIds) {
      const name = identities.get(identity);
      if (name !== undefined)
        covered.set(name, [...(covered.get(name) ?? []), id]);
    }
  }
  const unreachable = new Map<string, string>();
  for (const [name, m] of marks) {
    if (identities.get(m.identity) === name) unreachable.set(name, m.reason);
  }

  const owned = new Map<string, string[]>();
  for (const descriptor of descriptors) {
    const owner = ownerOf(descriptor);
    if (owner) owned.set(owner, [...(owned.get(owner) ?? []), descriptor.name]);
  }
  const reactors = instanceReactors(descriptors);

  const attach = useCallback(
    (instance: Instance) => {
      const current = latest.current;
      if (stopping.current.has(instance.id)) return;
      const attached = new Set(
        current.filter(isManaged).map((d) => targetOf(d.managedBy)),
      );
      const plain = plainRemotes(current);
      mark(cover(instance));
      const added = managedDescriptors(
        instance,
        current.map((d) => d.name),
      ).filter(
        (descriptor) =>
          !attached.has(targetOf(descriptor.managedBy)) &&
          !plain.has(switchboardOf(descriptor) ?? ""),
      );
      if (added.length === 0) return;
      for (const descriptor of added) {
        probes.current.set(keyOf(descriptor), { state: "released" });
      }
      latest.current = [...current, ...added];
      update((previous) => [...previous, ...added]);
      bump();
      onAttached?.(added[0].name);
    },
    [cover, mark, onAttached, update],
  );

  const kill = useCallback(
    (name: string) => {
      mark([name]);
      const descriptor = latest.current.find((d) => d.name === name);
      if (!descriptor || !isManaged(descriptor)) return;
      probes.current.delete(keyOf(descriptor));
      setRemoteBearer(descriptor.remote.url, "");
      if (!client) return;
      const id = descriptor.managedBy.instanceId;
      stopping.current.add(id);
      // The caller drops `name`; its instance's other members go with it.
      drop(
        (d) => d.managedBy.instanceId === id && d.name !== name,
        undefined,
        new Set([id]),
      );
      client
        .stop(id)
        .catch((error: unknown) => {
          notify(
            `${name}: could not stop its switchboard: ${errorMessage(error)}`,
          );
        })
        .finally(() => stopping.current.delete(id));
    },
    [client, drop, mark, notify],
  );

  const stopInstance = useCallback(
    async (id: string) => {
      if (!client) return;
      stopping.current.add(id);
      try {
        await client.stop(id);
        drop((d) => d.managedBy.instanceId === id, undefined, new Set([id]));
      } finally {
        stopping.current.delete(id);
      }
    },
    [client, drop],
  );

  const stopAll = useCallback(async () => {
    if (!client) return;
    const attached = latest.current
      .filter(isManaged)
      .map((d) => d.managedBy.instanceId);
    for (const id of attached) stopping.current.add(id);
    try {
      const stopped = new Set((await client.stopAll()).map((i) => i.id));
      drop((d) => stopped.has(d.managedBy.instanceId), undefined, stopped);
    } finally {
      for (const id of attached) stopping.current.delete(id);
    }
  }, [client, drop]);

  const reconcile = useCallback(
    (instances: readonly Instance[]) => {
      const byId = new Map(instances.map((i) => [i.id, i]));
      for (const descriptor of latest.current.filter(isManaged)) {
        if (probes.current.get(keyOf(descriptor))?.state !== "released") {
          continue;
        }
        const instance = byId.get(descriptor.managedBy.instanceId);
        const { instanceId } = descriptor.managedBy;
        if (instance?.status === "exited" || instance?.status === "failed") {
          drop(
            (d) => keyOf(d) === keyOf(descriptor),
            `its switchboard ${instance.status}`,
            new Set([instanceId]),
          );
        } else if (!instance) {
          drop(
            (d) => keyOf(d) === keyOf(descriptor),
            "the controller no longer runs it",
            new Set([instanceId]),
          );
        }
      }
      for (const instance of instances) {
        if (instance.status === "running") mark(cover(instance));
      }
      const stopped = [...covering.current].filter(
        ([id]) => byId.get(id)?.status !== "running",
      );
      for (const [id] of stopped) covering.current.delete(id);
      if (stopped.length > 0) bump();
      // A switchboard another running instance still serves stays reachable.
      const served = new Set(
        [...covering.current.values()].flatMap((ids) => [...ids]),
      );
      const byIdentity = new Map(
        latest.current.map((d) => [identityOf(d), d.name] as const),
      );
      for (const [id, coveredIds] of stopped) {
        const status = byId.get(id)?.status;
        mark(
          [...coveredIds]
            .filter((identity) => !served.has(identity))
            .flatMap((identity) => byIdentity.get(identity) ?? []),
          status === undefined
            ? "the controller no longer runs its switchboard"
            : `its switchboard is ${status}`,
        );
      }
      // Only owners known to exist: a list sent before a start can't drop.
      const gone = new Set(
        [...owners.current]
          .filter(([, state]) => state === "live")
          .map(([id]) => id)
          .filter((id) => !LIVE.has(byId.get(id)?.status ?? "")),
      );
      if (gone.size > 0) drop(() => false, undefined, gone);
    },
    [cover, drop, mark],
  );

  const dropInstance = useCallback(
    (id: string) =>
      drop((d) => d.managedBy.instanceId === id, undefined, new Set([id])),
    [drop],
  );

  const forget = useCallback(
    (name: string) => {
      mark([name]);
      drop((d) => d.name === name);
    },
    [drop, mark],
  );

  const dismissNotice = useCallback((id: number) => {
    setNotices((previous) => previous.filter((n) => n.id !== id));
  }, []);

  return {
    client,
    visible,
    withheld,
    attachedIds,
    isAttached,
    covered,
    unreachable,
    setUnreachable,
    owned,
    reactors,
    notices,
    dismissNotice,
    attach,
    kill,
    stopInstance,
    dropInstance,
    stopAll,
    reconcile,
    forget,
  };
}
