import { randomUUID } from "node:crypto";
import {
  callControl,
  ControlError,
  type CallControlOptions,
  type ControlRecord,
} from "./control-channel.js";
import { isPidAlive } from "./run-record.js";
import type { RunRecord } from "./run-record-schema.js";
import type { HostExit, SpawnedHost } from "./spawn-host.js";
import type {
  InstanceLifetime,
  SupervisedInstance,
  SupervisorStartParams,
} from "./supervisor.js";

/**
 * A tool's side of the supervisor: the requests of supervisor.ts as calls.
 * It opens a connection per request and loads nothing of the supervisor.
 */

/** A lease: the supervisor stops what was started with the caller under it
 * when its connection ends, which it does with this process. */
export interface SupervisorLease {
  id: string;
  /** Ends it now: what lives with this caller is stopped. */
  release(): Promise<void>;
  /** Resolves when the supervisor no longer holds it (released, or the
   * supervisor went away). */
  readonly ended: Promise<void>;
}

/** Takes a lease. The connection does not keep this process running. */
export function holdSupervisorLease(
  control: ControlRecord,
): Promise<SupervisorLease> {
  const id = randomUUID();
  const abort = new AbortController();
  return new Promise<SupervisorLease>((resolve, reject) => {
    let held = false;
    // The connection does not keep the process running; until the lease is
    // held, this does.
    const waiting = setInterval(() => undefined, 1_000);
    const ended = callControl(
      control,
      "lease",
      { id },
      {
        unref: true,
        signal: abort.signal,
        onOutput: () => {
          if (held) return;
          held = true;
          clearInterval(waiting);
          resolve({
            id,
            ended,
            release: () => {
              abort.abort();
              return ended;
            },
          });
        },
      },
    ).then(
      () => {
        clearInterval(waiting);
        if (!held) reject(new Error("The supervisor did not hold the lease."));
      },
      (error: unknown) => {
        clearInterval(waiting);
        if (!held)
          reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

export interface SupervisedList {
  supervisor: { pid: number; mode: string; version: string; home: string };
  instances: SupervisedInstance[];
}

/** What the supervisor holds, and what else runs on `dataDir`. */
export async function listSupervised(
  control: ControlRecord,
  dataDir?: string,
  options: CallControlOptions = {},
): Promise<SupervisedList> {
  return (await callControl(
    control,
    "list",
    dataDir === undefined ? {} : { dataDir },
    options,
  )) as SupervisedList;
}

export async function startSupervised(
  control: ControlRecord,
  params: SupervisorStartParams,
  options: CallControlOptions = {},
): Promise<{ instance: SupervisedInstance; started: boolean }> {
  return (await callControl(control, "start", params, options)) as {
    instance: SupervisedInstance;
    started: boolean;
  };
}

export async function stopSupervised(
  control: ControlRecord,
  handle: string,
): Promise<SupervisedInstance> {
  const result = (await callControl(control, "stop", { handle })) as {
    instance: SupervisedInstance;
  };
  return result.instance;
}

export async function restartSupervised(
  control: ControlRecord,
  handle: string,
  options: CallControlOptions = {},
): Promise<SupervisedInstance> {
  const result = (await callControl(
    control,
    "restart",
    { handle },
    options,
  )) as { instance: SupervisedInstance };
  return result.instance;
}

export async function supervisedLogs(
  control: ControlRecord,
  handle: string,
  lines?: number,
): Promise<{ text: string; logFile: string }> {
  return (await callControl(control, "logs", {
    handle,
    ...(lines === undefined ? {} : { lines }),
  })) as { text: string; logFile: string };
}

/** Stops the supervisor, and with it what it holds. */
export async function shutdownSupervisor(
  control: ControlRecord,
): Promise<{ pid: number; held: number }> {
  return (await callControl(control, "shutdown")) as {
    pid: number;
    held: number;
  };
}

/** A host the supervisor holds, in the shape `spawnHost` returns. */
export interface SupervisedHost extends SpawnedHost {
  handle: string;
  lifetime: InstanceLifetime | undefined;
  /** What the supervisor said of it when it was started. */
  instance: SupervisedInstance;
}

const EXITED_POLL_MS = 500;

/**
 * `spawnHost` through the supervisor: the instance is the supervisor's
 * child, not this process's. `existing` is set when the key ran already;
 * its `stop()` then leaves it running, as `spawnHost`'s does. Aborting
 * `signal` while it starts stops it.
 */
export async function startSupervisedHost(
  control: ControlRecord,
  params: SupervisorStartParams,
  options: { signal?: AbortSignal } = {},
): Promise<SupervisedHost> {
  const { instance, started } = await startSupervised(control, params, {
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!instance.record) {
    throw new Error(
      `${params.host} runs under the supervisor (pid ${instance.pid}) without a run record this version reads: ${instance.missing.join("; ")}.`,
    );
  }
  const record: RunRecord = instance.record;
  const exit: HostExit = { code: null, signal: null, forced: false };
  const exited = new Promise<HostExit>((resolve) => {
    const timer = setInterval(() => {
      if (isPidAlive(instance.pid)) return;
      clearInterval(timer);
      resolve(exit);
    }, EXITED_POLL_MS);
    timer.unref();
  });
  const mine = started && instance.mine;
  return {
    handle: instance.handle,
    lifetime: instance.lifetime,
    instance,
    pid: instance.pid,
    dataDir: instance.dataDir,
    record,
    outputs: record.outputs,
    members: record.members,
    ...(mine ? {} : { existing: true as const }),
    exited,
    stop: async () => {
      if (!mine) return exit;
      try {
        const stopped = await stopSupervised(control, instance.handle);
        if (stopped.exit) {
          exit.code = stopped.exit.code;
          exit.signal = stopped.exit.signal as NodeJS.Signals | null;
          exit.forced = stopped.exit.forced;
        }
      } catch (error) {
        // The supervisor is gone, and what it held with it.
        if (!(error instanceof ControlError && error.code === "unreachable")) {
          throw error;
        }
      }
      return exit;
    },
  };
}
