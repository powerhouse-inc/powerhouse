import {
  applyChildWrapper,
  collectTokenSites,
  compoundOutputSource,
  CONNECT_RUNNER,
  declaredHostSchemas,
  describeToken,
  drivesSchema,
  envSitesOf,
  explainDrivePlan,
  findDeadConnectConfig,
  formatPath,
  isToken,
  loadHost,
  loadProducers,
  memberForRef,
  mergeDrivePlan,
  outputRefsOf,
  outputSitesOf,
  planCompound,
  probeRun,
  processResolveEnv,
  producerOutputsSchemas,
  readProjectName,
  renderTokens,
  resolveHostOutputs,
  resolvePluginContributions,
  resolveRunnerModule,
  runnerOutputsSchema,
  runRecordOutputSource,
  validateDeclaredHost,
  validateHost,
  type ChildWrapper,
  type DriveDeclaration,
  type HostDefinition,
  type OutputSource,
  type PluginEntryData,
  type ReactorHostInput,
  type RunnerModule,
} from "@powerhousedao/host-core";

/**
 * `ph run <host> --explain <topic>`: print instead of running, after the
 * same declared validation `ph run` does first (so a printed explain is a
 * host that loads). `drives`: the merged drive plan with provenance
 * (browser-only plugins listed as unresolvable). `outputs`: the resolution
 * plan — consumed outputs and their producers, `$env` names, the compound
 * start order the tokens imply, which producers are running and, for a
 * running producer, the value each token resolves to now. A `$map` in
 * `reactor.drives` is shown as the token and, when its producer runs, as the
 * drives it renders.
 */

interface ExplainOptions {
  host: string;
  topic: string;
}

const TOPICS = ["drives", "outputs"];

/** A reactor host as explained: a standalone host, or a compound member
 * with its wrapper applied (declared form). */
interface ReactorView {
  name: string;
  runner: HostDefinition["runner"];
  config?: Record<string, unknown>;
  reactor?: ReactorHostInput["reactor"];
}

interface MemberView {
  key: string;
  wrapper: ChildWrapper;
  host: ReactorView;
  runner: RunnerModule;
  specifier: string;
  file: string;
  /** Where the effective `config` lives (a wrapper `config` is a full
   * statement in the compound's file). */
  configWhere: string;
}

interface LoadedView {
  host: HostDefinition;
  runner: RunnerModule;
  specifier: string;
  file: string;
  /** Set for a compound. */
  members?: MemberView[];
  /** Where tokens resolve NOW (for printing values): a standalone host's
   * producers' live run records; a compound's own live record (its members'
   * outputs), or none when it is not running. */
  source?: OutputSource;
}

async function loadView(
  projectRoot: string,
  name: string,
): Promise<LoadedView> {
  const loaded = await loadHost(projectRoot, name);
  const specifier = loaded.host.runner.module;
  const runner = await resolveRunnerModule(projectRoot, specifier);
  const file = `hosts/${name}/host.js`;
  if (runner.kind !== "compound") {
    const producers = await loadProducers(
      projectRoot,
      outputRefsOf(loaded.host),
    );
    validateDeclaredHost(runner, specifier, loaded.host, file, {
      outputsSchemaOf: producerOutputsSchemas(producers),
    });
    // The same lookup `ph run` resolves through.
    const source = runRecordOutputSource(projectRoot, {
      consumer: name,
      producers,
      projectName: readProjectName(projectRoot),
    });
    return { host: loaded.host, runner, specifier, file, source };
  }
  validateDeclaredHost(runner, specifier, loaded.host, file);
  validateHost(runner, specifier, loaded.host, file, { tokens: "allow" });
  // The compound runner's schema owns `config`; `children` is shared.
  const children = declaredHostSchemas.childrenSchema.parse(
    loaded.host.children,
  );
  const members: MemberView[] = [];
  for (const [key, wrapper] of Object.entries(children)) {
    const host: ReactorView = applyChildWrapper(
      (await loadHost(projectRoot, wrapper.host)).host,
      wrapper,
    );
    const memberSpecifier = host.runner.module;
    members.push({
      key,
      wrapper,
      host,
      runner: await resolveRunnerModule(projectRoot, memberSpecifier),
      specifier: memberSpecifier,
      file: `hosts/${wrapper.host}/host.js`,
      configWhere:
        wrapper.config !== undefined
          ? `hosts/${name}/host.js (children.${key}.config)`
          : `hosts/${wrapper.host}/host.js`,
    });
  }
  const refs = members.map((m) => ({ key: m.key, host: m.wrapper.host }));
  for (const m of members) {
    validateDeclaredHost(m.runner, m.specifier, m.host, m.file, {
      outputsSchemaOf: (ref) => {
        const target = memberForRef(ref, refs);
        if ("error" in target) return { error: target.error };
        const producer = members.find((p) => p.key === target.key);
        return producer
          ? runnerOutputsSchema(
              producer.runner,
              producer.specifier,
              `member "${producer.key}"`,
            )
          : { error: `names member "${target.key}", which is not declared.` };
      },
    });
  }
  // Members read each other's live outputs: shown only while this
  // compound runs (its record carries every member's outputs).
  const probe = probeRun(
    projectRoot,
    loaded.host.name,
    readProjectName(projectRoot),
  );
  const live = new Map<string, unknown>();
  if (probe.status === "live") {
    for (const [key, member] of Object.entries(probe.record.members ?? {})) {
      live.set(key, member.outputs);
    }
  }
  const source =
    probe.status === "live"
      ? compoundOutputSource(refs, live, loaded.host.name)
      : undefined;
  return { host: loaded.host, runner, specifier, file, members, source };
}

/** A token's value from running producers, or undefined (producer not
 * running, or the token reads the environment: `$env` values may be
 * secrets, so explain never prints them). */
function currentValue(token: unknown, source?: OutputSource): unknown {
  if (!source) return undefined;
  if (collectTokenSites(token).some((site) => site.key === "$env")) {
    return undefined;
  }
  try {
    return resolveHostOutputs(token, { outputs: source });
  } catch {
    return undefined;
  }
}

export async function explainHost(options: ExplainOptions): Promise<void> {
  if (!TOPICS.includes(options.topic)) {
    throw new Error(
      `Unknown --explain topic "${options.topic}" (supported: ${TOPICS.join(", ")}).`,
    );
  }
  const projectRoot = process.cwd();
  const view = await loadView(projectRoot, options.host);
  if (options.topic === "outputs") {
    explainOutputs(options.host, view);
    return;
  }

  if (view.members) {
    // One plan per member, with the wrapper's full-statement semantics.
    const verb = view.host.runner.defaultVerb ?? "run";
    for (const m of view.members) {
      await explainDrives(
        projectRoot,
        `${options.host} › ${m.key} (${m.wrapper.host})`,
        m.host,
        verb,
        m.file,
        m.configWhere,
        view.source,
      );
    }
    return;
  }
  await explainDrives(
    projectRoot,
    options.host,
    view.host,
    "run",
    view.file,
    view.file,
    view.source,
  );
}

/* ------------------------------------------------------------------ drives */

async function explainDrives(
  projectRoot: string,
  label: string,
  host: ReactorView,
  verb: string,
  where: string,
  configWhere: string,
  source?: OutputSource,
): Promise<void> {
  const entries: PluginEntryData[] = host.runner.plugins ?? [];
  const contributions =
    entries.length > 0
      ? await resolvePluginContributions(projectRoot, verb, entries, where)
      : { drives: [], unresolved: [] };
  const contributed = contributions.drives.map(({ declaration, source }) => {
    const parsed = drivesSchema.safeParse([declaration]);
    if (!parsed.success) {
      throw new Error(
        `${where}: plugin "${source}" contributes an invalid drive declaration.`,
      );
    }
    return { declaration: parsed.data[0], source };
  });
  // Declared drives may carry output tokens (a remote url): shown as
  // «$output …», resolved only at `ph run`. The whole list may be a token
  // (`$map` over a producer's drives): rendered from the running producer
  // when there is one, otherwise named and left out of the plan.
  const rawDrives: unknown = host.reactor?.drives ?? [];
  let listed: unknown = rawDrives;
  let listNote: string | undefined;
  if (isToken(rawDrives)) {
    const value = currentValue(rawDrives, source);
    listed = Array.isArray(value) ? value : [];
    listNote = `  reactor.drives ← «${describeToken(rawDrives)}»${
      Array.isArray(value)
        ? " (rendered from the running producer's outputs)"
        : " (rendered at ph run from the producer's live outputs; its producer is not running now, so the plan below leaves them out)"
    }`;
  }
  const parsed = drivesSchema.safeParse(renderTokens(listed));
  if (!parsed.success && listNote === undefined) {
    // a literal list: declared validation already ran; keep its error
    throw parsed.error;
  }
  const declared: DriveDeclaration[] = parsed.success ? parsed.data : [];
  console.log(`[${label}]`);
  if (listNote) console.log(listNote);
  if (!parsed.success) {
    console.log(
      `  the rendered drives fail the drive schema (ph run rejects them): ${parsed.error.issues
        .map((i) => `${i.path.map(String).join(".") || "<root>"}: ${i.message}`)
        .join("; ")}`,
    );
  }
  console.log(
    explainDrivePlan(mergeDrivePlan(projectRoot, declared, contributed)),
  );
  for (const module of contributions.unresolved) {
    const entry = entries
      .map((e) => (typeof e === "string" ? { module: e } : e))
      .find((e) => e.module === module);
    const drive: unknown =
      entry && "config" in entry ? entry.config?.drive : undefined;
    const attached =
      typeof drive === "string"
        ? `  attaches ${drive}`
        : isToken(drive)
          ? `  attaches «${describeToken(drive)}»`
          : "";
    console.log(
      `  (browser plugin ${module}: not resolvable from the project tree)${attached}`,
    );
  }
  // The same dead-config warnings the connect runner prints at boot,
  // naming the file the config lives in.
  if (host.runner.module === CONNECT_RUNNER) {
    for (const warning of findDeadConnectConfig(
      host.config,
      host.runner.plugins,
      verb,
      configWhere,
    )) {
      console.warn(warning.message);
    }
  }
}

/* ----------------------------------------------------------------- outputs */

function outputKeys(runner: RunnerModule): string {
  const schema = runner.outputsSchema;
  if (typeof schema !== "object" || schema === null) return "(no outputs)";
  const shape =
    "shape" in schema && typeof schema.shape === "object" && schema.shape
      ? Object.keys(schema.shape)
      : [];
  return shape.length ? shape.join(", ") : "(declared)";
}

function printConsumes(
  host: unknown,
  indent: string,
  producerNote: (folder: string, member?: string) => string,
  source?: OutputSource,
): void {
  const outputs = outputSitesOf(host);
  const env = envSitesOf(host);
  if (outputs.length === 0 && env.length === 0) {
    console.log(`${indent}consumes: nothing (no $output or $env tokens)`);
    return;
  }
  const valueLine = (token: unknown) => {
    const value = currentValue(token, source);
    if (value !== undefined) {
      console.log(`${indent}    = ${JSON.stringify(value)}`);
    }
  };
  for (const site of outputs) {
    const token = { $output: { ...site.ref, path: site.outputPath } };
    console.log(
      `${indent}${site.path} ← ${describeToken(token)}${producerNote(site.ref.host, site.ref.member)}`,
    );
    valueLine(token);
  }
  // Composite tokens (`$concat`, `$map`) outside any template: the value
  // the field gets, once its producers run.
  for (const site of collectTokenSites(host)) {
    const nested =
      site.scopes.length > 0 ||
      site.position === "concat" ||
      site.position === "over";
    if (nested || (site.key !== "$concat" && site.key !== "$map")) continue;
    console.log(
      `${indent}${formatPath(site.path)} ← ${describeToken(site.token)}`,
    );
    valueLine(site.token);
  }
  const { env: processEnv } = processResolveEnv(process.cwd());
  for (const site of env) {
    const builtin = site.name === "userData" || site.name === "projectRoot";
    const state =
      builtin || processEnv?.[site.name] !== undefined
        ? "set"
        : site.optional
          ? "unset: the property is omitted"
          : "UNSET: ph run fails";
    console.log(
      `${indent}${site.path} ← $env ${site.name}${site.optional ? " (optional)" : ""} [${state}]`,
    );
  }
}

function explainOutputs(name: string, view: LoadedView): void {
  if (!view.members) {
    const source = view.source;
    console.log(`[${name}] ${view.specifier}`);
    console.log(`  produces: ${outputKeys(view.runner)}`);
    printConsumes(
      view.host,
      "  ",
      (folder, member) => {
        const ref =
          member === undefined ? { host: folder } : { host: folder, member };
        return source?.lookup(ref).status === "available"
          ? `  (host "${folder}": running)`
          : `  (host "${folder}": not running; start it first: ph run ${folder})`;
      },
      source,
    );
    return;
  }

  const members = view.members;
  const refs = members.map((x) => ({ key: x.key, host: x.wrapper.host }));
  const config: unknown = view.host.config;
  const startOrder =
    typeof config === "object" &&
    config !== null &&
    "startOrder" in config &&
    Array.isArray(config.startOrder)
      ? config.startOrder.filter((k): k is string => typeof k === "string")
      : undefined;
  const plan = planCompound(
    members.map((m) => ({
      key: m.key,
      host: m.wrapper.host,
      refs: outputSitesOf(m.host).map(({ ref, path }) => ({ ref, path })),
    })),
    startOrder,
  );
  console.log(
    `[${name}] start order (${plan.source === "tokens" ? "from the output tokens" : "config.startOrder, checked against the tokens"}):`,
  );
  plan.order.forEach((key, index) => {
    const m = members.find((x) => x.key === key);
    const needs = plan.edges
      .filter((e) => e.consumer === key)
      .map((e) => e.producer);
    console.log(
      `  ${index + 1}. ${key} (${m?.wrapper.host ?? "?"})${needs.length ? `  after ${needs.join(", ")}` : ""}`,
    );
  });
  console.log("  Ctrl-C stops members in reverse order (consumers first).");
  for (const key of plan.order) {
    const m = members.find((x) => x.key === key);
    if (!m) continue;
    console.log(`[${name} › ${key} (${m.wrapper.host})] ${m.specifier}`);
    console.log(`  produces: ${outputKeys(m.runner)}`);
    printConsumes(
      m.host,
      "  ",
      (folder, member) => {
        const ref =
          member === undefined ? { host: folder } : { host: folder, member };
        const target = memberForRef(ref, refs);
        return "key" in target
          ? `  (member "${target.key}", live outputs)`
          : "";
      },
      view.source,
    );
  }
  const own = { ...view.host, children: undefined };
  if (outputSitesOf(own).length > 0 || envSitesOf(own).length > 0) {
    console.log(`[${name}] the compound's own fields:`);
    printConsumes(own, "  ", () => "");
  }
}
