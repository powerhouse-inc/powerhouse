import {
  explainDrivePlan,
  findDeadConnectConfig,
  loadHost,
  mergeDrivePlan,
  resolvePluginContributions,
  drivesSchema,
  isDriveReference,
  type DriveDeclaration,
  type PluginEntry,
} from "@powerhousedao/host-core";

/**
 * `ph run <host> --explain drives` (R1): print the merged drive plan with
 * provenance instead of running — the host's own declarations plus what the
 * composition's plugins contribute (e.g. the workflows plugin's Workflows
 * drive), each labelled with its source. Plugins that only exist in the
 * browser (Connect's built-ins) have no Node-resolvable module; their entries
 * are listed as such, with a `drive` config value shown when they carry one.
 */

interface ExplainOptions {
  host: string;
  topic: string;
}

interface ReactorSection {
  drives?: DriveDeclaration[];
}

interface RunnerSection {
  module?: string;
  plugins?: PluginEntry[];
  defaultVerb?: string;
}

interface ChildWrapper {
  host: string;
  config?: Record<string, unknown>;
  reactor?: ReactorSection;
  runner?: RunnerSection;
}

async function explainOne(
  projectRoot: string,
  label: string,
  reactor: ReactorSection,
  runner: RunnerSection | undefined,
  verb: string,
  where: string,
  config?: Record<string, unknown>,
): Promise<void> {
  const entries = runner?.plugins ?? [];
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
  console.log(`[${label}]`);
  console.log(
    explainDrivePlan(
      mergeDrivePlan(projectRoot, reactor.drives ?? [], contributed),
    ),
  );
  for (const module of contributions.unresolved) {
    const entry = entries
      .map((e) => (typeof e === "string" ? { module: e } : e))
      .find((e) => e.module === module);
    const drive = (entry as { config?: Record<string, unknown> } | undefined)
      ?.config?.drive;
    const attached =
      typeof drive === "string"
        ? `  attaches ${drive}`
        : isDriveReference(drive)
          ? `  attaches drive "${drive.slug}" of member "${drive.from}"`
          : "";
    console.log(
      `  (browser plugin ${module}: not resolvable from the project tree)${attached}`,
    );
  }
  // The same dead-config warnings the connect runner prints at boot.
  if (runner?.module === CONNECT_RUNNER) {
    for (const warning of findDeadConnectConfig(
      config,
      runner.plugins,
      verb,
      where,
    )) {
      console.warn(warning.message);
    }
  }
}

const CONNECT_RUNNER = "@powerhousedao/ph-cli/runners/connect";

export async function explainHost(options: ExplainOptions): Promise<void> {
  if (options.topic !== "drives") {
    throw new Error(
      `Unknown --explain topic "${options.topic}" (supported: drives).`,
    );
  }
  const projectRoot = process.cwd();
  const loaded = await loadHost(projectRoot, options.host);
  const host = loaded.host;
  const hostRunner = host.runner as RunnerSection;

  if (host.children !== undefined) {
    // Compound: one plan per member, with the wrapper's full-statement
    // semantics (wrapper reactor replaces the member's when present; wrapper
    // runner keys override the member's).
    const children = host.children as Record<string, ChildWrapper>;
    const verb = hostRunner.defaultVerb ?? "run";
    for (const [name, wrapper] of Object.entries(children)) {
      const member = await loadHost(projectRoot, wrapper.host);
      const reactor = (wrapper.reactor ??
        member.host.reactor ??
        {}) as ReactorSection;
      const runner = {
        ...(member.host.runner as RunnerSection),
        ...(wrapper.runner ?? {}),
      };
      await explainOne(
        projectRoot,
        `${options.host} › ${name} (${wrapper.host})`,
        reactor,
        runner,
        verb,
        `hosts/${wrapper.host}/host.js`,
        wrapper.config ?? member.host.config,
      );
    }
    return;
  }

  const reactor = (host.reactor ?? {}) as ReactorSection;
  await explainOne(
    projectRoot,
    options.host,
    reactor,
    hostRunner,
    "run",
    `hosts/${options.host}/host.js`,
    host.config,
  );
}
