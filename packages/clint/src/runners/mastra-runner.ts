import { reactorHostSchema } from "@powerhousedao/host-core";
import type { HostDefinition, RunnerContext } from "@powerhousedao/host-core";

/**
 * mastra-runner (P5.6, porting): the headless agent host — a Mastra agent
 * whose reactor is a REMOTE attach (a lone `remote` backend pointing at a
 * running switchboard), serving an OpenAI-compatible chat-completions
 * endpoint; `build` compiles skills and agent profiles. Until the port lands,
 * every verb refuses honestly.
 */

export const kind = "reactor";

export const hostSchema = reactorHostSchema;

function notPorted(verb: string): never {
  throw new Error(
    `@powerhousedao/clint/mastra-runner: "${verb}" is not available yet — ` +
      `the agent-host port (phase 5, P5.6) is in progress.`,
  );
}

export function run(_host: HostDefinition, _ctx: RunnerContext): never {
  notPorted("run");
}
