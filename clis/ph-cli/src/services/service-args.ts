import type { ParsedCmdResult } from "@powerhousedao/shared/clis";
import {
  buildArgs,
  connectBuildArgs,
  connectStudioArgs,
} from "@powerhousedao/shared/clis/args";
import { command, runSafely } from "cmd-ts";
import type { BuildArgs } from "../types.js";

/**
 * The argument shapes the Connect studio, Connect build and package build
 * services take, produced by the cmd-ts definitions of
 * `@powerhousedao/shared/clis/args` (see
 * `@powerhousedao/ph-run/service-args`, which does this for the switchboard
 * and for the Connect preview). A runner starts from one of these and
 * overlays only the keys its host file and its invocation own, so a service
 * is handed every key of the shape, with its default.
 */
const connectStudio = command({
  name: "studio",
  args: connectStudioArgs,
  handler: (args) => args,
});

const connectBuild = command({
  name: "build",
  args: connectBuildArgs,
  handler: (args) => args,
});

const build = command({
  name: "build",
  args: buildArgs,
  handler: (args) => args,
});

export type ConnectStudioArgs = ParsedCmdResult<typeof connectStudio>;
export type ConnectBuildArgs = ParsedCmdResult<typeof connectBuild>;

export async function connectStudioServiceArgs(
  argv: string[] = [],
): Promise<ConnectStudioArgs> {
  const result = await runSafely(connectStudio, argv);
  if (result._tag === "error") {
    throw new Error(
      `connect studio args did not parse: ${result.error.config.message}`,
    );
  }
  return result.value;
}

export async function connectBuildServiceArgs(
  argv: string[] = [],
): Promise<ConnectBuildArgs> {
  const result = await runSafely(connectBuild, argv);
  if (result._tag === "error") {
    throw new Error(
      `connect build args did not parse: ${result.error.config.message}`,
    );
  }
  return result.value;
}

export async function buildServiceArgs(
  argv: string[] = [],
): Promise<BuildArgs> {
  const result = await runSafely(build, argv);
  if (result._tag === "error") {
    throw new Error(`build args did not parse: ${result.error.config.message}`);
  }
  return result.value;
}
