// Use it, wired: start a draft on the controller, attach what it serves, stop it.
import type { ReactorDescriptor } from "@powerhousedao/reactor-monitor";
import type { HostExport } from "@powerhousedao/host-core/schema";
import { useCallback, useEffect, useRef, useState } from "react";
import type { HostImportRequest } from "../components/HostImportPanel.js";
import type { Instance, InstanceOutputs } from "../controller/api.js";
import {
  backoffMs,
  errorMessage,
  isNotFound,
  type ControllerClient,
} from "../controller/client.js";
import {
  driveAddressOf,
  withOwner,
  type InstanceReactors,
} from "../controller/managed.js";
import type { ManagedDescriptors } from "../controller/use-managed-descriptors.js";
import type { Member } from "../host-rules/index.js";
import { planImport } from "../lib/host-import.js";
import { NO_ADDRESS_YET, START_GONE } from "./copy.js";
import { requestOf, type BuilderDraft } from "./draft.js";
import type { BuilderEngine } from "./engine.js";

const POLL_MS = 1000;
const WATCH_MS = 3000;

/** `url`: a switchboard's first drive address; `app`: a Connect's page. */
export type RunReactor = {
  name: string;
  url?: string;
  app?: string;
  /** A switchboard's drives by declared slug. */
  drives?: InstanceOutputs["drives"];
};

/** The copy Start launched; `id` is absent until the controller answers. */
export type BuilderRun = {
  id?: string;
  status: "starting" | "running" | "stopping";
  reactors: RunReactor[];
  /** Descriptors provisioned in this browser, by name. */
  browser: string[];
  /** The copy's reactors in the active set, by the member each one is. */
  attached: InstanceReactors;
  /** The project host the copy was started from. */
  source?: Instance["source"];
  /** The last failed status check; the copy is still followed. */
  problem?: string;
};

/** The host's browser reactors, with the member and backend each one is. */
export function browserReactors(
  envelope: HostExport,
  members: readonly Member[],
): { descriptor: ReactorDescriptor; member: string; backend: string }[] {
  const browser = new Set(
    members.flatMap((member) =>
      member.backends
        .filter((backend) => backend.mode === "browser")
        .map((backend) => `${member.key}\0${backend.name}`),
    ),
  );
  return planImport(envelope)
    .rows.filter(
      (row) =>
        row.include &&
        row.descriptor.kind !== "remote" &&
        browser.has(`${row.member}\0${row.backend}`),
    )
    .map((row) => ({
      descriptor: { ...row.descriptor } as ReactorDescriptor,
      member: row.member,
      backend: row.backend,
    }));
}

/** The host's browser reactors; a switchboard's own store is not one. */
export function browserDescriptors(
  envelope: HostExport,
  members: readonly Member[],
): ReactorDescriptor[] {
  return browserReactors(envelope, members).map((entry) => entry.descriptor);
}

export type LeftOut = { name: string; reason: string };

/** What Save as a monitoring set imports, and the rows it can't. */
export function monitoringSetOf(
  envelope: HostExport,
  setName: string,
): { request: HostImportRequest; left: LeftOut[] } {
  const descriptors: ReactorDescriptor[] = [];
  const left: LeftOut[] = [];
  for (const row of planImport(envelope).rows) {
    const { name } = row.descriptor;
    if (!row.include) {
      left.push({ name, reason: row.excluded ?? NO_ADDRESS_YET });
    } else if (row.descriptor.kind !== "remote") {
      descriptors.push({ ...row.descriptor } as ReactorDescriptor);
    } else if (row.url?.value) {
      descriptors.push({
        ...row.descriptor,
        remote: { url: row.url.value },
      } as ReactorDescriptor);
    } else {
      left.push({ name, reason: row.url?.reason ?? NO_ADDRESS_YET });
    }
  }
  return {
    request: {
      setName,
      descriptors,
      source: { project: { ...envelope.project }, host: envelope.name },
      activate: false,
    },
    left,
  };
}

export function reactorsOf(instance: Instance): RunReactor[] {
  return [
    ...(instance.outputs || instance.app
      ? [
          {
            name: instance.host,
            url: instance.outputs && driveAddressOf(instance.outputs),
            app: instance.app,
          },
        ]
      : []),
    ...Object.entries(instance.members ?? {}).map(([name, member]) => ({
      name,
      url: member.outputs && driveAddressOf(member.outputs),
      app: member.app,
      ...(member.outputs ? { drives: member.outputs.drives } : {}),
    })),
  ];
}

export type BuilderRunOptions = {
  client: Pick<ControllerClient, "startDraft" | "get" | "list"> | undefined;
  managed: Pick<
    ManagedDescriptors,
    "attach" | "stopInstance" | "dropInstance" | "owned"
  > &
    Partial<Pick<ManagedDescriptors, "reactors">>;
  /** Adds browser descriptors to the active set. */
  onAddDescriptors: (descriptors: ReactorDescriptor[]) => void;
  /** While starting; a running copy is checked every `watchMs`. */
  pollMs?: number;
  watchMs?: number;
};

export type BuilderRunControls = {
  run: BuilderRun | undefined;
  /** Rejects with the controller's error, so `base_changed` reaches the builder. */
  start: (draft: BuilderDraft, engine: BuilderEngine) => Promise<void>;
  stop: () => Promise<void>;
};

type RunState = Omit<BuilderRun, "browser" | "attached">;

const GONE = new Set(["exited", "failed"]);
const BUSY = new Set(["starting", "stopping"]);

/** Builder-started copies the controller still runs, newest first. */
function liveDrafts(instances: readonly Instance[]): Instance[] {
  return instances
    .filter(
      (i) => i.source && (i.status === "starting" || i.status === "running"),
    )
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function useBuilderRun({
  client,
  managed,
  onAddDescriptors,
  pollMs = POLL_MS,
  watchMs = WATCH_MS,
}: BuilderRunOptions): BuilderRunControls {
  const [state, setState] = useState<RunState>();
  // The run this hook follows; a loop for any other one stops quietly.
  const current = useRef<symbol | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      current.current = undefined;
    };
  }, []);

  const { attach, stopInstance, dropInstance, owned, reactors } = managed;

  /** The instance once it leaves `starting`, or undefined if this run was let go. */
  const settle = useCallback(
    async (id: string, live: () => boolean): Promise<Instance | undefined> => {
      if (!client) return undefined;
      let failures = 0;
      for (;;) {
        await new Promise((resolve) =>
          setTimeout(resolve, backoffMs(pollMs, failures)),
        );
        if (!live()) return undefined;
        try {
          const instance = await client.get(id);
          if (!live()) return undefined;
          failures = 0;
          setState(
            (previous) => previous && { ...previous, problem: undefined },
          );
          // A stop in flight passes through `stopping` on its way out.
          if (!BUSY.has(instance.status)) return instance;
        } catch (error) {
          if (!live()) return undefined;
          if (isNotFound(error)) throw new Error(START_GONE, { cause: error });
          failures++;
          const problem = errorMessage(error);
          setState((previous) => previous && { ...previous, problem });
        }
      }
    },
    [client, pollMs],
  );

  // A running copy is followed by its status, wherever its descriptors are.
  const watch = useCallback(
    async (id: string, live: () => boolean) => {
      if (!client) return;
      let failures = 0;
      while (live()) {
        await new Promise((resolve) =>
          setTimeout(resolve, backoffMs(watchMs, failures)),
        );
        if (!live()) return;
        let gone: boolean;
        try {
          const instance = await client.get(id);
          gone = GONE.has(instance.status);
          failures = 0;
        } catch (error) {
          gone = isNotFound(error);
          if (!gone) failures++;
        }
        if (!live()) return;
        if (gone) {
          current.current = undefined;
          dropInstance(id);
          setState(undefined);
          return;
        }
      }
    },
    [client, watchMs, dropInstance],
  );

  const running = useCallback(
    (instance: Instance, token: symbol) => {
      setState({
        id: instance.id,
        status: "running",
        reactors: reactorsOf(instance),
        ...(instance.source ? { source: { ...instance.source } } : {}),
      });
      void watch(
        instance.id,
        () => mounted.current && current.current === token,
      );
    },
    [watch],
  );

  /** Follows a starting copy it didn't just start; a failed one goes quietly. */
  const followStarting = useCallback(
    async (id: string) => {
      const token = Symbol("run");
      current.current = token;
      const live = () => mounted.current && current.current === token;
      setState({ id, status: "starting", reactors: [] });
      let settled: Instance | undefined;
      try {
        settled = await settle(id, live);
      } catch {
        settled = undefined;
      }
      if (!live()) return;
      if (settled?.status === "running") {
        attach(settled);
        running(settled, token);
      } else {
        current.current = undefined;
        dropInstance(id);
        setState(undefined);
      }
    },
    [settle, running, attach, dropInstance],
  );

  // After a reload, pick up the copy the controller still runs.
  useEffect(() => {
    if (!client) return;
    const abort = new AbortController();
    void (async () => {
      let found: Instance | undefined;
      try {
        found = liveDrafts(await client.list()).at(0);
      } catch {
        return;
      }
      if (abort.signal.aborted || !found || current.current) return;
      if (found.status === "running") {
        const token = Symbol("run");
        current.current = token;
        running(found, token);
      } else {
        await followStarting(found.id);
      }
    })();
    return () => abort.abort();
  }, [client, running, followStarting]);

  const start = useCallback(
    async (draft: BuilderDraft, engine: BuilderEngine) => {
      if (!client) return;
      const token = Symbol("run");
      current.current = token;
      const live = () => mounted.current && current.current === token;
      setState({ status: "starting", reactors: [] });
      let instance: Instance;
      try {
        instance = await client.startDraft(requestOf(draft));
      } catch (error) {
        if (live()) {
          current.current = undefined;
          setState(undefined);
        }
        throw error;
      }
      if (!live()) return;
      const { id } = instance;
      setState({ id, status: "starting", reactors: [] });
      onAddDescriptors(
        browserReactors(engine.envelope, engine.members).map(
          ({ descriptor, member, backend }) =>
            withOwner(descriptor, id, { member, backend }),
        ),
      );
      let settled: Instance | undefined;
      try {
        settled =
          instance.status === "starting" ? await settle(id, live) : instance;
      } catch (error) {
        settled = undefined;
        if (live()) {
          current.current = undefined;
          dropInstance(id);
          setState(undefined);
          throw error;
        }
      }
      if (!settled || !live()) return;
      if (settled.status !== "running") {
        current.current = undefined;
        dropInstance(id);
        setState(undefined);
        throw new Error(
          settled.error?.message ??
            `The copy ${settled.status} while starting.`,
        );
      }
      attach(settled);
      running(settled, token);
    },
    [client, settle, running, attach, dropInstance, onAddDescriptors],
  );

  const stop = useCallback(async () => {
    if (!state?.id || state.status === "stopping") return;
    const before = state;
    const id = state.id;
    // Let go first, so the loops following this run end quietly.
    current.current = undefined;
    setState({ ...before, status: "stopping" });
    try {
      await stopInstance(id);
    } catch (error) {
      // Still there: follow it afresh, since the old loops have ended.
      if (mounted.current && before.status === "running") {
        const token = Symbol("run");
        current.current = token;
        setState(before);
        void watch(id, () => mounted.current && current.current === token);
      } else if (mounted.current) {
        void followStarting(id);
      }
      throw error;
    }
    if (mounted.current) setState(undefined);
  }, [state, stopInstance, watch, followStarting]);

  const run: BuilderRun | undefined = state && {
    ...state,
    browser: state.id ? [...(owned.get(state.id) ?? [])] : [],
    attached: (state.id ? reactors?.get(state.id) : undefined) ?? {
      browser: [],
      remote: [],
    },
  };
  return { run, start, stop };
}
