#!/usr/bin/env node
import { splitRunArgv } from "@powerhousedao/host-core";
import { assertNodeVersion } from "@powerhousedao/shared/clis/utils";
import { startRun, stopRunningHost } from "./services/run/start-run.js";

/**
 * `ph-run run <host> [verb] [runner arguments]`: what `ph run` does and nothing else `ph` does, so
 * a packaged app can run a host with none of the tools that build one. It takes
 * `run` as its first word so a supervisor can start either of the two the same
 * way.
 */
async function main(args: string[]) {
  assertNodeVersion();
  const { host, verb, own, argv } = splitRunArgv(args.slice(1));
  if (args[0] !== "run" || !host) {
    throw new Error(
      "Usage: ph-run run <host> [verb] [--debug] [--stop] [runner arguments]",
    );
  }
  // The user's supervisor is no host of the project: nothing of it is loaded.
  if (host === "supervisor") {
    const { runSupervisorCommand } = await import("./services/supervisor.js");
    process.exitCode = await runSupervisorCommand({
      verb,
      argv,
      stop: own.includes("--stop"),
    });
    return;
  }
  if (own.includes("--stop")) {
    await stopRunningHost({ host });
    return;
  }
  await startRun({ host, verb, debug: own.includes("--debug"), argv });
}

await main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
