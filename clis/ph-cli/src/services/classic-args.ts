import {
  buildArgs,
  connectBuildArgs,
  connectStudioArgs,
} from "@powerhousedao/shared/clis/args";
import { command, runSafely } from "cmd-ts";
import type {
  BuildArgs,
  ConnectBuildArgs,
  ConnectStudioArgs,
} from "../types.js";

/**
 * The argument shapes of the classic `ph connect studio`, `ph connect build`
 * and `ph build`, produced by the SAME cmd-ts definitions those commands
 * parse (see `@powerhousedao/ph-run/classic-args`, which does this for the
 * switchboard and for `ph connect preview`). A runner starts from one of
 * these and overlays only the keys its host file and its invocation own, so
 * a service is handed every key the classic command hands it.
 */
const classicConnectStudio = command({
  name: "studio",
  args: connectStudioArgs,
  handler: (args) => args,
});

const classicConnectBuild = command({
  name: "build",
  args: connectBuildArgs,
  handler: (args) => args,
});

const classicBuild = command({
  name: "build",
  args: buildArgs,
  handler: (args) => args,
});

export async function classicConnectStudioArgs(
  argv: string[] = [],
): Promise<ConnectStudioArgs> {
  const result = await runSafely(classicConnectStudio, argv);
  if (result._tag === "error") {
    throw new Error(
      `classic connect studio args did not parse: ${result.error.config.message}`,
    );
  }
  return result.value;
}

export async function classicConnectBuildArgs(
  argv: string[] = [],
): Promise<ConnectBuildArgs> {
  const result = await runSafely(classicConnectBuild, argv);
  if (result._tag === "error") {
    throw new Error(
      `classic connect build args did not parse: ${result.error.config.message}`,
    );
  }
  return result.value;
}

export async function classicBuildArgs(
  argv: string[] = [],
): Promise<BuildArgs> {
  const result = await runSafely(classicBuild, argv);
  if (result._tag === "error") {
    throw new Error(
      `classic build args did not parse: ${result.error.config.message}`,
    );
  }
  return result.value;
}
