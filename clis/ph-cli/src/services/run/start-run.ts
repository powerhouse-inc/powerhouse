import {
  clearRunRecord,
  getVerb,
  loadHost,
  loadProducers,
  ONE_SHOT_VERBS,
  outputRefsOf,
  probeRun,
  processResolveEnv,
  producerOutputsSchemas,
  readProjectName,
  readRunRecord,
  resolveHostOutputs,
  resolveRunnerModule,
  runRecordOutputSource,
  toStartedHandle,
  validateDeclaredHost,
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
 * declared runner. There is deliberately no type→runner registry — what a
 * host does is written in its own file.
 *
 * The pipeline (typed-host-configs 3.5): declared validation (token shapes,
 * `$output` paths against the producers' outputsSchemas, the runner's
 * declaredHostSchema), the live-instance lock, resolution (`$output` from
 * the producers' live run records, `$env` from this process, the
 * `${userData}` sugar), resolved validation, then the verb with the parsed
 * host. A compound runner gets its declared host: its members resolve their
 * own tokens as they start.
 *
 * A reactor runner that exports `outputsSchema` has its handle's outputs
 * published in a v2 `.ph/run/<name>.json` record once ready; this is the only
 * standalone writer (mastra included). Compounds write their own record with
 * the members in it; one-shot verbs (`build`) return nothing and write none.
 */
export async function startRun(args: StartRunArgs): Promise<unknown> {
  const projectRoot = args.projectRoot ?? process.cwd();
  const loaded = await loadHost(projectRoot, args.host);
  const { warnSupersededConfigKeys } = await import("./superseded-config.js");
  warnSupersededConfigKeys(projectRoot);
  const specifier = loaded.host.runner.module;
  const runner = await resolveRunnerModule(projectRoot, specifier);
  const verb = args.verb ?? "run";
  const fn = getVerb(runner, specifier, verb);
  const file = loaded.file;
  if (args.debug) {
    console.log({ host: loaded.host.name, runner: specifier, verb });
  }

  if (runner.kind === "compound") {
    validateDeclaredHost(runner, specifier, loaded.host, file);
    const host = validateHost(runner, specifier, loaded.host, file, {
      tokens: "allow",
    });
    return fn(host, { projectRoot, verb, env: process.env });
  }

  const projectName = readProjectName(projectRoot);
  const producers = await loadProducers(projectRoot, outputRefsOf(loaded.host));
  validateDeclaredHost(runner, specifier, loaded.host, file, {
    outputsSchemaOf: producerOutputsSchemas(producers),
  });
  const oneShot = ONE_SHOT_VERBS.has(verb);
  if (oneShot) {
    // `build` reads no other host's outputs: no producer needs to run.
    const host = validateHost(runner, specifier, loaded.host, file, {
      tokens: "allow",
    });
    return fn(host, { projectRoot, verb, env: process.env });
  }
  const publishes = isSchemaLike(runner.outputsSchema);
  // Before the verb starts anything: a second live instance would take
  // over the first one's record (and clear it on exit).
  if (publishes) assertNotRunning(projectRoot, loaded.host.name, projectName);
  const resolved = resolveHostOutputs(loaded.host, {
    outputs: runRecordOutputSource(projectRoot, {
      consumer: args.host,
      producers,
      projectName,
    }),
    ...processResolveEnv(projectRoot),
    where: `hosts/${args.host}/host.js`,
  });
  const host = validateHost(runner, specifier, resolved, file);
  const result = await fn(host, { projectRoot, verb, env: process.env });
  if (publishes && result !== undefined && result !== null) {
    await publishOutputs(runner, result, {
      projectRoot,
      projectName,
      hostName: loaded.host.name,
      specifier,
      verb,
    });
  }
  return result;
}

function assertNotRunning(
  projectRoot: string,
  hostName: string,
  projectName: string,
): void {
  const probe = probeRun(projectRoot, hostName, projectName);
  if (probe.status === "live" && probe.record.pid !== process.pid) {
    throw new Error(
      `${hostName} is already running for this project (pid ${probe.record.pid}). Stop it before starting another.`,
    );
  }
  if (probe.status === "foreign") {
    throw new Error(
      `.ph/run/${hostName}.json describes a live "${probe.record.projectName}", but this project is "${projectName}". Refusing to start a second instance.`,
    );
  }
}

interface PublishTarget {
  projectRoot: string;
  projectName: string;
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
  const name = target.projectName;
  let outputs: unknown;
  try {
    if (!isSchemaLike(runner.outputsSchema)) return;
    // Checked again after the start: an instance that started meanwhile.
    assertNotRunning(target.projectRoot, target.hostName, name);
    if (handle.ready) await handle.ready;
    const parsed = runner.outputsSchema.safeParse(handle.outputs);
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
