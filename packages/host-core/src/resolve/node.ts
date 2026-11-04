import path from "node:path";
import { loadHost } from "../host-loader.js";
import { defaultUserDataDir } from "../placeholders.js";
import { isPidAlive, listRunRecords, probeRun } from "../run-record.js";
import { resolveRunnerModule, type RunnerModule } from "../runner-resolver.js";
import type { OutputRef, OutputsSchemaLookup } from "./declared.js";
import type { OutputSource, ResolveSources } from "./resolve.js";

/**
 * Node adapters for the resolver: producer discovery (a token names a host
 * by FOLDER; run records are keyed by the host's `name`, so the producer's
 * host.js is loaded to map one to the other), the standalone run-record
 * output source, and the process environment.
 */

export interface ProducerInfo {
  /** The folder a token names (`hosts/<folder>/`). */
  folder: string;
  /** The producer host's `name` (its run-record key). */
  name: string;
  specifier: string;
  runner: RunnerModule;
}

/** Producers by folder; a folder that fails to load carries its error. */
export type ProducerMap = ReadonlyMap<string, ProducerInfo | { error: string }>;

/** Load every producer host a set of refs names (each once). */
export async function loadProducers(
  projectRoot: string,
  refs: readonly OutputRef[],
): Promise<ProducerMap> {
  const producers = new Map<string, ProducerInfo | { error: string }>();
  for (const { host: folder } of refs) {
    if (producers.has(folder)) continue;
    try {
      const loaded = await loadHost(projectRoot, folder);
      const specifier = loaded.host.runner.module;
      producers.set(folder, {
        folder,
        name: loaded.host.name,
        specifier,
        runner: await resolveRunnerModule(projectRoot, specifier),
      });
    } catch (error) {
      producers.set(folder, {
        error: `names host "${folder}", which cannot be loaded: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  return producers;
}

/** The outputs schema of a runner module, or why it has none. */
export function runnerOutputsSchema(
  runner: RunnerModule,
  specifier: string,
  label: string,
): OutputsSchemaLookup {
  const schema = runner.outputsSchema;
  if (schema === undefined || schema === null) {
    return {
      error: `${label} runs "${specifier}", which exports no outputsSchema, so it produces no outputs a token can read.`,
    };
  }
  return { schema, label: `"${specifier}" (${label})` };
}

/** Declared-validation lookup for a standalone host's producers. */
export function producerOutputsSchemas(
  producers: ProducerMap,
): (ref: OutputRef) => OutputsSchemaLookup {
  return (ref) => {
    const info = producers.get(ref.host);
    if (!info)
      return { error: `names host "${ref.host}", which was not loaded.` };
    if ("error" in info) return { error: info.error };
    return runnerOutputsSchema(
      info.runner,
      info.specifier,
      `host "${ref.host}"`,
    );
  };
}

/** Further `.ph` roots whose live run records a standalone `$output` reads
 * (`path.delimiter`-separated): a launcher that gives each child its own
 * PH_USER_DATA_DIR names its siblings' here. Locks never read them. */
export const OUTPUT_DATA_DIRS_ENV = "PH_OUTPUT_DATA_DIRS";

type Env = Readonly<Record<string, string | undefined>>;

/** The other roots, each once, never the process's own. */
function siblingEnvs(env: Env): Env[] {
  const own = env.PH_USER_DATA_DIR && path.resolve(env.PH_USER_DATA_DIR);
  const dirs = new Set(
    (env[OUTPUT_DATA_DIRS_ENV] ?? "")
      .split(path.delimiter)
      .filter((dir) => dir !== "")
      .map((dir) => path.resolve(dir)),
  );
  return [...dirs]
    .filter((dir) => dir !== own)
    .map((dir) => ({ PH_USER_DATA_DIR: dir }));
}

/**
 * Standalone `$output` source: the producer's live v2 run record. Its own
 * standalone record under the process's `.ph` root first (keyed by the
 * producer's `name`); else exactly one of: a standalone record under a
 * PH_OUTPUT_DATA_DIRS root, or a member running that host in a live compound
 * of this project under any root. A missing, stale, foreign or output-less
 * record means "not running", and the lookup fails naming the producer and
 * how to start it (no fallback to the producer's declared config, no
 * waiting).
 */
export function runRecordOutputSource(
  projectRoot: string,
  options: {
    consumer: string;
    producers: ProducerMap;
    projectName: string;
    env?: Env;
  },
): OutputSource {
  const { consumer, producers, projectName } = options;
  const env = options.env ?? process.env;
  const siblings = siblingEnvs(env);
  return {
    lookup(ref) {
      const notRunning = `${consumer} needs outputs from host "${ref.host}", which is not running. Start it first: ph run ${ref.host} (or run a compound that includes it).`;
      const info = producers.get(ref.host);
      // The producer's outputsSchema: an absent optional field omits the
      // consuming property instead of failing.
      const schema =
        info && !("error" in info) ? info.runner.outputsSchema : undefined;
      const withSchema =
        schema !== undefined && schema !== null ? { schema } : {};
      const standalone: { label: string; outputs: Record<string, unknown> }[] =
        [];
      if (ref.member === undefined && info && !("error" in info)) {
        const probe = probeRun(projectRoot, info.name, projectName, env);
        if (probe.status === "live" && probe.record.outputs) {
          return {
            status: "available",
            outputs: probe.record.outputs,
            ...withSchema,
          };
        }
        for (const sibling of siblings) {
          const other = probeRun(projectRoot, info.name, projectName, sibling);
          if (other.status === "live" && other.record.outputs) {
            standalone.push({
              label: `"${info.name}" (pid ${other.record.pid})`,
              outputs: other.record.outputs,
            });
          }
        }
      }
      const members = [env, ...siblings]
        .flatMap((root) => listRunRecords(projectRoot, root))
        .filter(
          (record) =>
            record.members !== undefined &&
            record.projectName === projectName &&
            isPidAlive(record.pid),
        )
        .flatMap((record) =>
          Object.entries(record.members ?? {})
            .filter(
              ([key, member]) =>
                member.host === ref.host &&
                (ref.member === undefined || key === ref.member),
            )
            .map(([key, member]) => ({
              label: `member "${key}" of "${record.host}"`,
              outputs: member.outputs,
            })),
        );
      const found = [...standalone, ...members];
      if (found.length === 1) {
        return {
          status: "available",
          outputs: found[0].outputs,
          ...withSchema,
        };
      }
      if (found.length > 1) {
        return {
          status: "unavailable",
          message: `${consumer} needs outputs from host "${ref.host}", which runs as ${found.map((m) => m.label).join(" and ")}; stop all but one, or run ${ref.host} on its own.`,
        };
      }
      return { status: "unavailable", message: notRunning };
    },
  };
}

/** The resolving process's `$env` inputs: its environment plus the
 * always-resolvable built-ins (`userData` honours PH_USER_DATA_DIR). */
export function processResolveEnv(
  projectRoot: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Pick<ResolveSources, "env" | "builtins"> {
  return {
    env,
    builtins: {
      userData: defaultUserDataDir(projectRoot, env),
      projectRoot: path.resolve(projectRoot),
    },
  };
}
