// Use it, wired: start a draft on the controller, attach what it serves, stop it.
import type { ReactorDescriptor } from "@powerhousedao/reactor-monitor";
import type { HostExport } from "@powerhousedao/host-core/schema";
import { useCallback, useEffect, useRef, useState } from "react";
import type { HostImportRequest } from "../components/HostImportPanel.js";
import type { Instance, InstanceOutputs } from "../controller/api.js";
import {
  backoffMs,
  ControllerRequestError,
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
import { requestOf, type BuilderDraft, type DraftStorage } from "./draft.js";
import type { BuilderEngine } from "./engine.js";

const POLL_MS = 1000;
const WATCH_MS = 3000;
/** Until then a start may not have reached the controller's check yet. */
const ARRIVE_MS = 5000;
/** Listing failures in a row after which a reloaded page stops waiting, unless it saw its start in the check. */
const LIST_FAILURES = 3;
export const PENDING_START_KEY = "ph:reactor-monitor:builder-start";

type BrowserReactor = ReturnType<typeof browserReactors>[number];

/** A start sent from this tab whose answer it hasn't read yet. */
type PendingStart = {
  /** The `startId` sent; the copy echoes it in `source`. */
  id: string;
  at: number;
  browser: BrowserReactor[];
};

const isText = (value: unknown): value is string => typeof value === "string";

function isBrowserReactor(value: unknown): value is BrowserReactor {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.descriptor === "object" &&
    entry.descriptor !== null &&
    isText(entry.member) &&
    isText(entry.backend)
  );
}

function sessionStore(): DraftStorage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

function readPending(
  storage: DraftStorage | undefined,
): PendingStart | undefined {
  let raw: string | null;
  try {
    raw = storage?.getItem(PENDING_START_KEY) ?? null;
  } catch {
    return undefined;
  }
  if (raw === null) return undefined;
  try {
    const json = JSON.parse(raw) as Partial<PendingStart>;
    const { id, at, browser } = json;
    return isText(id) &&
      typeof at === "number" &&
      Array.isArray(browser) &&
      browser.every(isBrowserReactor)
      ? { id, at, browser }
      : undefined;
  } catch {
    return undefined;
  }
}

function writePending(
  storage: DraftStorage | undefined,
  pending: PendingStart | undefined,
): void {
  try {
    if (pending) storage?.setItem(PENDING_START_KEY, JSON.stringify(pending));
    else storage?.removeItem(PENDING_START_KEY);
  } catch {
    // A start this tab can't remember is only lost to a reload.
  }
}

/** `url`: a switchboard's first drive address; `app`: a Connect's page. */
/** A copy that began and then failed; its message already says so. */
export class StartFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StartFailedError";
  }
}

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
  client: Pick<ControllerClient, "startDraft" | "get" | "listing"> | undefined;
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
  /** Where a start in flight is kept across a reload; defaults to sessionStorage. */
  pending?: DraftStorage;
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

/** A random id; `crypto.randomUUID` is missing outside secure contexts. */
function startIdOf(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

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
  pending: injected,
}: BuilderRunOptions): BuilderRunControls {
  const [state, setState] = useState<RunState>();
  const [pending] = useState(() => injected ?? sessionStore());
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
  const latest = useRef({ owned, onAddDescriptors });
  useEffect(() => {
    latest.current = { owned, onAddDescriptors };
  });

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

  // After a reload, pick up the copy the controller still runs, or wait for
  // the one a start sent before the reload while the controller checks it.
  useEffect(() => {
    if (!client) return;
    const abort = new AbortController();
    const waiting = Symbol("waiting");
    const mine = () =>
      !abort.signal.aborted &&
      (current.current === undefined || current.current === waiting);
    const sent = readPending(pending);
    if (sent && current.current === undefined) {
      current.current = waiting;
      setState({ status: "starting", reactors: [] });
    }
    /** Whether to stop looking for the copy `sent` started. */
    let seen = false;
    const gaveUp = (checking: string[] | undefined, failures: number) => {
      if (!sent) return true;
      if (checking === undefined) return !seen && failures >= LIST_FAILURES;
      if (checking.includes(sent.id)) {
        seen = true;
        return false;
      }
      // Refused, failed or never arrived: not in the check, and not listed.
      return seen || Date.now() >= sent.at + ARRIVE_MS;
    };
    void (async () => {
      let failures = 0;
      let drafts: Instance[] = [];
      let ours: Instance | undefined;
      for (let first = true; ; first = false) {
        if (!first) {
          await new Promise((resolve) =>
            setTimeout(resolve, backoffMs(pollMs, failures)),
          );
          if (!mine()) return;
        }
        let checking: string[] | undefined;
        try {
          const listing = await client.listing();
          drafts = liveDrafts(listing.instances);
          checking = listing.checking;
          failures = 0;
        } catch {
          if (!sent) return;
          drafts = [];
          failures++;
        }
        if (!mine()) return;
        ours = sent && drafts.find((i) => i.source?.startId === sent.id);
        if (ours || gaveUp(checking, failures)) break;
      }
      if (sent) writePending(pending, undefined);
      // A tab whose own start ended takes on no other copy as its run.
      const found = sent ? ours : drafts.at(0);
      if (!found) {
        if (current.current === waiting) {
          current.current = undefined;
          setState(undefined);
        }
        return;
      }
      // The reload lost Start's answer, so nothing of this copy is set up yet.
      if (sent && ours && !latest.current.owned.get(ours.id)?.length) {
        const { id } = ours;
        latest.current.onAddDescriptors(
          sent.browser.map(({ descriptor, member, backend }) =>
            withOwner(descriptor, id, { member, backend }),
          ),
        );
      }
      if (found.status === "running") {
        const token = Symbol("run");
        current.current = token;
        if (ours) attach(found);
        running(found, token);
      } else {
        await followStarting(found.id);
      }
    })();
    return () => {
      abort.abort();
      if (current.current !== waiting) return;
      current.current = undefined;
      setState(undefined);
    };
  }, [client, pending, pollMs, running, followStarting, attach]);

  const start = useCallback(
    async (draft: BuilderDraft, engine: BuilderEngine) => {
      if (!client) return;
      const request = { ...requestOf(draft), startId: startIdOf() };
      const browser = browserReactors(engine.envelope, engine.members);
      const token = Symbol("run");
      current.current = token;
      const live = () => mounted.current && current.current === token;
      setState({ status: "starting", reactors: [] });
      writePending(pending, { id: request.startId, at: Date.now(), browser });
      let instance: Instance;
      try {
        instance = await client.startDraft(request);
      } catch (error) {
        // Unanswered, as when a reload aborts it: the controller may still start it.
        const unanswered =
          error instanceof ControllerRequestError && error.code === "network";
        if (!unanswered) writePending(pending, undefined);
        if (live()) {
          current.current = undefined;
          setState(undefined);
        }
        throw error;
      }
      writePending(pending, undefined);
      if (!live()) return;
      const { id } = instance;
      setState({ id, status: "starting", reactors: [] });
      onAddDescriptors(
        browser.map(({ descriptor, member, backend }) =>
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
        throw settled.error
          ? new StartFailedError(settled.error.message)
          : new Error(`The copy ${settled.status} while starting.`);
      }
      attach(settled);
      running(settled, token);
    },
    [client, pending, settle, running, attach, dropInstance, onAddDescriptors],
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
