import fs from "node:fs";
import path from "node:path";
import {
  clearRunRecord,
  getVerb,
  loadHost,
  probeRun,
  readRunRecord,
  resolveRunnerModule,
  toStartedHandle,
  validateHost,
  writeRunRecord,
  type HostSchemaLike,
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
 * A reactor runner that exports `outputsSchema` has its handle's outputs
 * published in a v2 `.ph/run/<name>.json` record once ready. Runners without
 * one (mastra) and compounds keep writing their own records; one-shot verbs
 * (`build`) return nothing and write none.
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
  const outputsSchema: unknown = runner.outputsSchema;
  if (
    runner.kind === "reactor" &&
    isSchemaLike(outputsSchema) &&
    result !== undefined &&
    result !== null
  ) {
    await publishOutputs(outputsSchema, result, {
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
  outputsSchema: HostSchemaLike,
  result: unknown,
  target: PublishTarget,
): Promise<void> {
  const where = `${target.specifier} ${target.verb}`;
  const handle = toStartedHandle(result, where);
  const name = projectName(target.projectRoot);
  let outputs: unknown;
  try {
    // A second instance of this host would take over the first one's record
    // (and clear it on exit): refuse, as the compound's lock does.
    const probe = probeRun(target.projectRoot, target.hostName, name);
    if (probe.status === "live" && probe.record.pid !== process.pid) {
      throw new Error(
        `${target.hostName} is already running for this project (pid ${probe.record.pid}). Stop it before starting another.`,
      );
    }
    if (probe.status === "foreign") {
      throw new Error(
        `.ph/run/${target.hostName}.json describes a live "${probe.record.projectName}", but this project is "${name}". Refusing to start a second instance.`,
      );
    }
    if (handle.ready) await handle.ready;
    const parsed = outputsSchema.safeParse(handle.outputs);
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
  } catch (error) {
    await handle.shutdown?.();
    throw error;
  }

  writeRunRecord(target.projectRoot, {
    version: 2,
    host: target.hostName,
    projectName: name,
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
