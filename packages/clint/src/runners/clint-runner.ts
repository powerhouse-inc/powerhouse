import { compoundHostSchema } from "@powerhousedao/host-core";
import type { HostDefinition, RunnerContext } from "@powerhousedao/host-core";

/**
 * clint-runner (P5.4, porting): the clint framework shell as a compound-style
 * runner — children declared in hosts/cli/host.js, SCHEDULED by the services
 * manager (start/stop/ps/logs, preflight, restart policies), with the
 * embedded proxy and the agents manager. Until the port lands, every verb
 * refuses honestly.
 */

export const kind = "compound";

export const hostSchema = compoundHostSchema;

function notPorted(verb: string): never {
  throw new Error(
    `@powerhousedao/clint/clint-runner: "${verb}" is not available yet — ` +
      `the clint framework port (phase 5, P5.4) is in progress. ` +
      `Use the published @powerhousedao/ph-clint for a standalone CLI meanwhile.`,
  );
}

export function run(_host: HostDefinition, _ctx: RunnerContext): never {
  notPorted("run");
}
