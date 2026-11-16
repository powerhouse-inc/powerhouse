import {
  checkRunnerArgv,
  clearRunRecord,
  emptyMaps,
  getVerb,
  installStopChannel,
  isSchemaLike,
  loadHost,
  loadHostFresh,
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
  RunnerError,
  stopRun,
  STORE_VERBS,
  toStartedHandle,
  validateDeclaredHost,
  validateHost,
  writeRunRecord,
  type RunnerModule,
} from "@powerhousedao/host-core";

export interface StartRunArgs {
  host: string;
  verb?: string;
  projectRoot?: string;
  debug?: boolean;
  /** What follows `ph run <host> [verb]`: the runner's own arguments. */
  argv?: string[];
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
 * own tokens as they start. Ahead of all of it, observability loads when the
 * env configures it (services/observability.ts).
 *
 * A reactor runner that exports `outputsSchema` has its handle's outputs
 * published in a v2 `.ph/run/<name>.json` record once ready; this is the only
 * standalone writer (mastra included). Compounds write their own record with
 * the members in it; one-shot verbs (`build`) return nothing and write none.
 *
 * Store verbs (`migrate`, `migrate-status`, `reset`) resolve like `run`, so
 * they address the stores `run` opens, but take no lock and write no record.
 */
export async function startRun(args: StartRunArgs): Promise<unknown> {
  // Before the host loads: loading it can import its runner and plugins, and
  // OpenTelemetry only patches http/express/pg/graphql that load after it.
  // Decided on the env, since reading the host is what must come second.
  if (!ONE_SHOT_VERBS.has(args.verb ?? "run")) {
    const { loadObservability } = await import("../observability.js");
    await loadObservability();
  }
  // Loading a host loads its plugins, and React settles on its development or
  // production build the first time it's loaded. `vite build` sets NODE_ENV only
  // after that, so a build would run one half of React with the other half's
  // renderer (TypeError: dispatcher.getOwner is not a function).
  if (ONE_SHOT_VERBS.has(args.verb ?? "run")) {
    process.env.NODE_ENV ??= "production";
  }
  const projectRoot = args.projectRoot ?? process.cwd();
  const loaded = await loadHost(projectRoot, args.host);
  const { warnSupersededConfigKeys } = await import("./superseded-config.js");
  warnSupersededConfigKeys(projectRoot);
  const specifier = loaded.host.runner.module;
  const runner = await resolveRunnerModule(projectRoot, specifier);
  const verb = args.verb ?? "run";
  const storeVerb = STORE_VERBS.has(verb);
  if (storeVerb && runner.kind === "compound") {
    throw new RunnerError(
      `${loaded.host.name} is a compound host, and "${verb}" works on the stores of one reactor host.`,
      `Run it on the member that has them, e.g. \`ph run switchboard ${verb}\`.`,
    );
  }
  const fn = getVerb(runner, specifier, verb);
  // Before the verb starts anything: `ph run <host> --stop` reaches it from
  // here on, on Windows too.
  if (!ONE_SHOT_VERBS.has(verb) && !storeVerb) installStopChannel();
  const file = loaded.file;
  if (args.debug) {
    console.log({ host: loaded.host.name, runner: specifier, verb });
  }

  if (runner.kind === "compound") {
    validateDeclaredHost(runner, specifier, loaded.host, file);
    const host = validateHost(runner, specifier, loaded.host, file, {
      tokens: "allow",
    });
    // Unchecked here: the compound hands each member the ones it accepts.
    const argv = args.argv ?? [];
    return fn(host, {
      projectRoot,
      verb,
      env: process.env,
      ...(argv.length > 0 ? { argv } : {}),
    });
  }

  // Before anything starts: an argument the runner does not accept fails.
  const argv = checkRunnerArgv(args.argv ?? [], {
    host: args.host,
    runner: specifier,
    schema: runner.argsSchema,
  });
  const ctx = {
    projectRoot,
    verb,
    env: process.env,
    ...(argv.length > 0 ? { argv } : {}),
  };
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
    return fn(emptyMaps(host, loaded.host), ctx);
  }
  const publishes = isSchemaLike(runner.outputsSchema);
  // Before the verb starts anything: a second live instance would take
  // over the first one's record (and clear it on exit).
  // A store verb starts no instance: it neither takes nor trips the lock.
  // Except `reset`, which would delete the stores under a live one.
  if (publishes && (!storeVerb || verb === "reset")) {
    assertNotRunning(projectRoot, loaded.host.name, projectName);
  }
  const resolveAndValidate = (definition: typeof loaded.host) =>
    validateHost(
      runner,
      specifier,
      resolveHostOutputs(definition, {
        outputs: runRecordOutputSource(projectRoot, {
          consumer: args.host,
          producers,
          projectName,
        }),
        ...processResolveEnv(projectRoot),
        where: `hosts/${args.host}/host.js`,
      }),
      file,
    );
  const host = resolveAndValidate(loaded.host);
  const result = await fn(host, {
    ...ctx,
    reloadHost: async () =>
      resolveAndValidate((await loadHostFresh(projectRoot, args.host)).host),
  });
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

/**
 * `ph run <host> --stop`: asks the project's running host to stop the way
 * Ctrl-C in its terminal does, and waits until it has. It never kills.
 */
export async function stopRunningHost(args: {
  host: string;
  projectRoot?: string;
}): Promise<void> {
  const projectRoot = args.projectRoot ?? process.cwd();
  const result = await stopRun(projectRoot, args.host);
  switch (result.status) {
    case "none":
      console.log(`${args.host} is not running for this project.`);
      return;
    case "stopped":
      console.log(`Stopped ${args.host} (pid ${result.pid}).`);
      return;
    case "foreign":
      throw new RunnerError(
        `.ph/run/${args.host}.json describes a live "${result.projectName}" (pid ${result.pid}), not this project.`,
        "Stop it from its own project.",
      );
    case "unreachable":
      throw new RunnerError(
        `${args.host} (pid ${result.pid}) takes no stop request: it was started by a version without one.`,
        "Press Ctrl-C in its terminal. Ending the process any other way leaves its stores as a crash does.",
      );
    case "timeout":
      throw new RunnerError(
        `${args.host} (pid ${result.pid}) was asked to stop and is still running.`,
        "It may still be shutting down: run the command again to keep waiting.",
      );
  }
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
