import type { SwitchboardHostParsed } from "@powerhousedao/ph-run/runners/switchboard";
import type { RunnerContext } from "@powerhousedao/host-core";
import type { BuildArgs } from "../types.js";

export * from "@powerhousedao/ph-run/runners/switchboard";

export const verbs = ["run", "serve", "dev", "build"];

/** Build the project's reactor package (the SAME service as `ph build`) — what
 * this switchboard serves. Starts no server; orthogonal to run/serve/dev. */
export async function build(
  host: SwitchboardHostParsed,
  _ctx: RunnerContext,
): Promise<void> {
  const { runBuild } = await import("../services/build.js");
  const args: Partial<BuildArgs> = {
    outDir: host.runner.outDir ?? "dist",
  };
  await runBuild(args as BuildArgs);
}
