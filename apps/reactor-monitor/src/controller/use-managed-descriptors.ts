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
  controllerFromDocument,
  isNotFound,
  type ControllerClient,
} from "./client.js";
import {
  isManaged,
  managedByOf,
  managedDescriptor,
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
  `${descriptor.name}\u0000${descriptor.managedBy.instanceId}`;

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
    if (!client) return;
    const reprobe = (descriptor: ManagedDescriptor) => {
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        if (probes.current.get(keyOf(descriptor))?.state === "withheld") {
          settle(descriptor, undefined);
        }
      }, reprobeMs);
      timers.current.add(timer);
    };
    for (const descriptor of descriptors.filter(isManaged)) {
      if (probes.current.has(keyOf(descriptor))) continue;
      probes.current.set(keyOf(descriptor), { state: "probing" });
      const { instanceId } = descriptor.managedBy;
      const sameDescriptor = (d: ManagedDescriptor) =>
        keyOf(d) === keyOf(descriptor);
      void (async () => {
        let instance: Instance;
        try {
          instance = await client.get(instanceId);
        } catch (error) {
          if (!mounted.current) return;
          if (isNotFound(error)) {
            drop(sameDescriptor, "the controller no longer runs it");
            return;
          }
          const reason = error instanceof Error ? error.message : String(error);
          settle(descriptor, { state: "withheld", reason });
          reprobe(descriptor);
          return;
        }
        if (!mounted.current) return;
        if (instance.status === "starting") {
          settle(descriptor, { state: "withheld", reason: "still starting" });
          reprobe(descriptor);
        } else if (instance.status !== "running") {
          drop(sameDescriptor, `its switchboard is ${instance.status}`);
        } else if (instance.outputs?.graphql !== descriptor.remote.url) {
          drop(sameDescriptor, "its switchboard now serves another URL");
        } else {
          settle(descriptor, { state: "released" });
        }
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
      if (current.some((d) => managedByOf(d)?.instanceId === instance.id)) {
        return;
      }
      const descriptor = managedDescriptor(
        instance,
        current.map((d) => d.name),
      );
      if (!descriptor) return;
      probes.current.set(keyOf(descriptor), { state: "released" });
      latest.current = [...current, descriptor];
      update((previous) => [...previous, descriptor]);
      bump();
      onAttached?.(descriptor.name);
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
      client.stop(descriptor.managedBy.instanceId).catch((error: unknown) => {
        notify(
          `${name}: could not stop its switchboard: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    },
    [client, notify],
  );

  const stopInstance = useCallback(
    async (id: string) => {
      if (!client) return;
      await client.stop(id);
      drop((d) => d.managedBy.instanceId === id);
    },
    [client, drop],
  );

  const stopAll = useCallback(async () => {
    if (!client) return;
    const stopped = new Set((await client.stopAll()).map((i) => i.id));
    drop((d) => stopped.has(d.managedBy.instanceId));
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
