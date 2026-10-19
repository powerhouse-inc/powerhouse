import fs from "node:fs";
import path from "node:path";
import {
  clearRunRecord,
  getVerb,
  loadHost,
  readRunRecord,
  resolveRunnerModule,
  toStartedHandle,
  validateHost,
  writeRunRecord,
  type HostSchemaLike,
  type RunnerModule,
} from "@powerhousedao/host-core";

export interface StartRunArgs {
  host: string;
  verb?: string;
  projectRoot?: string;
  debug?: boolean;
}

/**
 * `ph run <host> [verb]`: dispatch the verb (default `run`) of the host's
 * declared runner with the PARSED host. There is deliberately no
 * type→runner registry — what a host does is written in its own file.
 *
 * A reactor runner's handle has its outputs published in a v2
 * `.ph/run/<name>.json` record once ready. Compounds write their own record;
 * one-shot verbs (`build`) return nothing and write none.
 */
export async function startRun(args: StartRunArgs): Promise<unknown> {
  const projectRoot = args.projectRoot ?? process.cwd();
  const loaded = await loadHost(projectRoot, args.host);
  const { warnSupersededConfigKeys } = await import("./superseded-config.js");
  warnSupersededConfigKeys(projectRoot);
  const specifier = loaded.host.runner.module;
  const runner = await resolveRunnerModule(projectRoot, specifier);
  const host = validateHost(runner, specifier, loaded.host, loaded.file);
  const verb = args.verb ?? "run";
  const fn = getVerb(runner, specifier, verb);
  if (args.debug) {
    console.log({ host: loaded.host.name, runner: specifier, verb });
  }
  const result = await fn(host, { projectRoot, verb, env: process.env });
  if (runner.kind === "reactor" && result !== undefined && result !== null) {
    await publishOutputs(runner, result, {
      projectRoot,
      hostName: loaded.host.name,
      specifier,
      verb,
    });
  }
  return result;
}

interface PublishTarget {
  projectRoot: string;
  hostName: string;
  specifier: string;
  verb: string;
}

function isSchemaLike(value: unknown): value is HostSchemaLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "safeParse" in value &&
    typeof value.safeParse === "function"
  );
}

/** Await `ready`, validate the outputs, write the v2 record and clear it on
 * exit. A handle that never gets ready or reports invalid outputs is shut
 * down before the error propagates. */
async function publishOutputs(
  runner: RunnerModule,
  result: unknown,
  target: PublishTarget,
): Promise<void> {
  const where = `${target.specifier} ${target.verb}`;
  const handle = toStartedHandle(result, where);
  let outputs: unknown = handle.outputs;
  try {
    if (handle.ready) await handle.ready;
    const schema: unknown = runner.outputsSchema;
    if (isSchemaLike(schema)) {
      const parsed = schema.safeParse(handle.outputs);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map(
            (issue) =>
              `  - ${issue.path.map(String).join(".") || "<root>"}: ${issue.message}`,
          )
          .join("\n");
        throw new Error(
          `${where} reported outputs that fail its outputsSchema:\n${issues}`,
        );
      }
      outputs = parsed.data;
    }
  } catch (error) {
    await handle.shutdown?.();
    throw error;
  }

  writeRunRecord(target.projectRoot, {
    version: 2,
    host: target.hostName,
    projectName: projectName(target.projectRoot),
    kind: "reactor",
    verb: target.verb,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    outputs: outputs as Record<string, unknown>,
  });
  // No SIGINT/SIGTERM handler: the switchboard reactor's own handler kills
  // the reactor before draining the api, and a parallel shutdown() would
  // break that order. Without an exit event the record keeps a dead pid,
  // which probeRun reports as stale.
  process.on("exit", () => {
    if (readRunRecord(target.projectRoot, target.hostName)?.pid === process.pid)
      clearRunRecord(target.projectRoot, target.hostName);
  });
}

/** The project identity the run record's live/foreign probe compares
 * (package.json name, else the folder name), as the compound uses. */
function projectName(projectRoot: string): string {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
    ) as { name?: string };
    if (pkg.name) return pkg.name;
  } catch {
    // fall through
  }
  return path.basename(projectRoot);
}
