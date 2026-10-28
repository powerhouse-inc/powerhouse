// Use it, wired: start a draft on the controller, attach what it serves, stop it.
import type { ReactorDescriptor } from "@powerhousedao/reactor-monitor";
import type { HostExport } from "@powerhousedao/host-core/schema";
import { useCallback, useEffect, useRef, useState } from "react";
import type { HostImportRequest } from "../components/HostImportPanel.js";
import type { Instance } from "../controller/api.js";
import type { ControllerClient } from "../controller/client.js";
import type { ManagedDescriptors } from "../controller/use-managed-descriptors.js";
import type { Member } from "../host-rules/index.js";
import { planImport } from "../lib/host-import.js";
import { NO_ADDRESS_YET } from "./copy.js";
import { requestOf, type BuilderDraft } from "./draft.js";
import type { BuilderEngine } from "./engine.js";

const POLL_MS = 1000;

export type RunReactor = { name: string; url?: string };

/** The copy Start launched; `id` is absent until the controller answers. */
export type BuilderRun = {
  id?: string;
  status: "starting" | "running" | "stopping";
  reactors: RunReactor[];
  /** Descriptors provisioned in this browser, by name. */
  browser: string[];
};

/** The host's browser reactors; a switchboard's own store is not one. */
export function browserDescriptors(
  envelope: HostExport,
  members: readonly Member[],
): ReactorDescriptor[] {
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
    .map((row) => ({ ...row.descriptor }) as ReactorDescriptor);
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
      left.push({ name, reason: NO_ADDRESS_YET });
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

function reactorsOf(instance: Instance): RunReactor[] {
  return [
    ...(instance.outputs
      ? [{ name: instance.host, url: instance.outputs.graphql }]
      : []),
    ...Object.entries(instance.members ?? {}).map(([name, member]) => ({
      name,
      url: member.outputs?.graphql,
    })),
  ];
}

export type BuilderRunOptions = {
  client: Pick<ControllerClient, "startDraft" | "get"> | undefined;
  managed: Pick<ManagedDescriptors, "attach" | "stopInstance" | "attachedIds">;
  /** Adds browser descriptors to the active set; returns the names used. */
  onAddDescriptors: (descriptors: ReactorDescriptor[]) => string[];
  onKill: (name: string) => void;
  pollMs?: number;
};

export type BuilderRunControls = {
  run: BuilderRun | undefined;
  /** Rejects with the controller's error, so `base_changed` reaches the builder. */
  start: (draft: BuilderDraft, engine: BuilderEngine) => Promise<void>;
  stop: () => Promise<void>;
};

export function useBuilderRun({
  client,
  managed,
  onAddDescriptors,
  onKill,
  pollMs = POLL_MS,
}: BuilderRunOptions): BuilderRunControls {
  const [run, setRun] = useState<BuilderRun>();
  // The run this hook follows; a poll for any other one stops quietly.
  const current = useRef<symbol | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      current.current = undefined;
    };
  }, []);

  const { attach, stopInstance, attachedIds } = managed;

  // Stopped elsewhere: its switchboards were attached and now none are.
  const seen = useRef(false);
  useEffect(() => {
    if (run?.status !== "running" || !run.id) {
      seen.current = false;
      return;
    }
    if (attachedIds.has(run.id)) seen.current = true;
    else if (seen.current) {
      seen.current = false;
      current.current = undefined;
      setRun(undefined);
    }
  }, [run, attachedIds]);

  const start = useCallback(
    async (draft: BuilderDraft, engine: BuilderEngine) => {
      if (!client) return;
      const token = Symbol("run");
      current.current = token;
      const live = () => mounted.current && current.current === token;
      setRun({ status: "starting", reactors: [], browser: [] });
      let instance: Instance;
      try {
        instance = await client.startDraft(requestOf(draft));
        if (!live()) return;
        setRun({
          id: instance.id,
          status: "starting",
          reactors: [],
          browser: [],
        });
        while (instance.status === "starting") {
          await new Promise((resolve) => setTimeout(resolve, pollMs));
          if (!live()) return;
          instance = await client.get(instance.id);
          if (!live()) return;
        }
      } catch (error) {
        if (live()) {
          current.current = undefined;
          setRun(undefined);
        }
        throw error;
      }
      if (instance.status !== "running") {
        current.current = undefined;
        setRun(undefined);
        throw new Error(
          instance.error?.message ??
            `The copy ${instance.status} while starting.`,
        );
      }
      attach(instance);
      const browser = onAddDescriptors(
        browserDescriptors(engine.envelope, engine.members),
      );
      seen.current = false;
      setRun({
        id: instance.id,
        status: "running",
        reactors: reactorsOf(instance),
        browser,
      });
    },
    [client, pollMs, attach, onAddDescriptors],
  );

  const stop = useCallback(async () => {
    if (!run?.id) return;
    const { id, browser } = run;
    setRun({ ...run, status: "stopping" });
    try {
      await stopInstance(id);
    } catch (error) {
      if (mounted.current) setRun({ ...run });
      throw error;
    }
    for (const name of browser) onKill(name);
    current.current = undefined;
    if (mounted.current) setRun(undefined);
  }, [run, stopInstance, onKill]);

  return { run, start, stop };
}
