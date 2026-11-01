#!/usr/bin/env node
import { assertNodeVersion } from "@powerhousedao/shared/clis/utils";
import { startRun } from "./services/run/start-run.js";

/**
 * `ph-run run <host> [verb]`: what `ph run` does and nothing else `ph` does, so
 * a packaged app can run a host with none of the tools that build one. It takes
 * `run` as its first word so a supervisor can start either of the two the same
 * way.
 */
async function main(args: string[]) {
  assertNodeVersion();
  const debug = args.includes("--debug");
  const [command, host, verb] = args.filter((arg) => arg !== "--debug");
  if (command !== "run" || !host) {
    throw new Error("Usage: ph-run run <host> [verb] [--debug]");
  }
  await startRun({ host, verb, debug });
}

await main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
