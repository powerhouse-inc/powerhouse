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
  isManaged,
  managedDescriptors,
  servesDescriptor,
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
  notices: readonly ManagedNotice[];
  dismissNotice: (id: number) => void;
  /** Adds a descriptor per switchboard the instance serves. */
  attach: (instance: Instance) => void;
  /** handleKill's managed branch: stops the descriptor's instance. */
  kill: (name: string) => void;
  stopInstance: (id: string) => Promise<void>;
  stopAll: () => Promise<void>;
  /** Drops released descriptors whose instance exited or is gone. */
  reconcile: (instances: readonly Instance[]) => void;
  forget: (name: string) => void;
}

const keyOf = (descriptor: ManagedDescriptor) =>
  `${descriptor.name}\u0000${descriptor.managedBy.instanceId}\u0000${descriptor.managedBy.member ?? ""}`;

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
  useEffect(() => {
    mounted.current = true;
    const pending = timers.current;
    return () => {
      mounted.current = false;
      for (const timer of pending) clearTimeout(timer);
      pending.clear();
    };
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

  const drop = useCallback(
    (match: (descriptor: ManagedDescriptor) => boolean, notice?: string) => {
      const gone = latest.current.filter(isManaged).filter(match);
      if (gone.length === 0) return;
      for (const descriptor of gone) {
        probes.current.delete(keyOf(descriptor));
        setRemoteBearer(descriptor.remote.url, "");
      }
      const names = new Set(gone.map((descriptor) => descriptor.name));
      const kept = (d: ReactorDescriptor) =>
        !(isManaged(d) && match(d) && names.has(d.name));
      latest.current = latest.current.filter(kept);
      update((previous) => previous.filter(kept));
      if (notice) {
        for (const descriptor of gone) {
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
    if (!client) return;
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
        let outcome: Probe | { drop: string };
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
                  ? { drop: "its switchboard now serves another URL" }
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
          drop(sameDescriptor, outcome.drop);
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

  const attach = useCallback(
    (instance: Instance) => {
      const current = latest.current;
      if (stopping.current.has(instance.id)) return;
      const attached = new Set(
        current.filter(isManaged).map((d) => targetOf(d.managedBy)),
      );
      const added = managedDescriptors(
        instance,
        current.map((d) => d.name),
      ).filter((descriptor) => !attached.has(targetOf(descriptor.managedBy)));
      if (added.length === 0) return;
      for (const descriptor of added) {
        probes.current.set(keyOf(descriptor), { state: "released" });
      }
      latest.current = [...current, ...added];
      update((previous) => [...previous, ...added]);
      bump();
      onAttached?.(added[0].name);
    },
    [onAttached, update],
  );

  const kill = useCallback(
    (name: string) => {
      const descriptor = latest.current.find((d) => d.name === name);
      if (!descriptor || !isManaged(descriptor)) return;
      probes.current.delete(keyOf(descriptor));
      setRemoteBearer(descriptor.remote.url, "");
      if (!client) return;
      const id = descriptor.managedBy.instanceId;
      stopping.current.add(id);
      // The caller drops `name`; its instance's other members go with it.
      drop((d) => d.managedBy.instanceId === id && d.name !== name);
      client
        .stop(id)
        .catch((error: unknown) => {
          notify(
            `${name}: could not stop its switchboard: ${errorMessage(error)}`,
          );
        })
        .finally(() => stopping.current.delete(id));
    },
    [client, drop, notify],
  );

  const stopInstance = useCallback(
    async (id: string) => {
      if (!client) return;
      stopping.current.add(id);
      try {
        await client.stop(id);
        drop((d) => d.managedBy.instanceId === id);
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
      drop((d) => stopped.has(d.managedBy.instanceId));
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
        if (instance?.status === "exited" || instance?.status === "failed") {
          drop(
            (d) => keyOf(d) === keyOf(descriptor),
            `its switchboard ${instance.status}`,
          );
        } else if (!instance) {
          drop(
            (d) => keyOf(d) === keyOf(descriptor),
            "the controller no longer runs it",
          );
        }
      }
    },
    [drop],
  );

  const forget = useCallback(
    (name: string) => drop((d) => d.name === name),
    [drop],
  );

  const dismissNotice = useCallback((id: number) => {
    setNotices((previous) => previous.filter((n) => n.id !== id));
  }, []);

  return {
    client,
    visible,
    withheld,
    attachedIds,
    notices,
    dismissNotice,
    attach,
    kill,
    stopInstance,
    stopAll,
    reconcile,
    forget,
  };
}
