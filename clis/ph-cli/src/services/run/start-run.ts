import { loadHost } from "@powerhousedao/host-core";
import {
  getVerb,
  resolveRunnerModule,
  validateHost,
} from "@powerhousedao/host-core";

export interface StartRunArgs {
  host: string;
  verb?: string;
  projectRoot?: string;
  debug?: boolean;
}

/**
 * `ph run <host> [verb]`: load hosts/<host>/host.js, resolve its declared
 * runner from the project's dependency tree, validate, dispatch the verb
 * (default `run`). There is deliberately no type→runner registry — what a
 * host does is written in its own file.
 */
export async function startRun(args: StartRunArgs): Promise<unknown> {
  const projectRoot = args.projectRoot ?? process.cwd();
  const loaded = await loadHost(projectRoot, args.host);
  const { warnSupersededConfigKeys } = await import("./superseded-config.js");
  warnSupersededConfigKeys(projectRoot);
  const specifier = loaded.host.runner.module;
  const runner = await resolveRunnerModule(projectRoot, specifier);
  validateHost(runner, specifier, loaded.host, loaded.file);
  const verb = args.verb ?? "run";
  const fn = getVerb(runner, specifier, verb);
  if (args.debug) {
    console.log({ host: loaded.host.name, runner: specifier, verb });
  }
  return fn(loaded.host, { projectRoot, verb, env: process.env });
}
