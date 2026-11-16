import {
  ONE_SHOT_VERBS,
  readProjectName,
  STORE_VERBS,
} from "@powerhousedao/host-core";
import { outputsSchema as connectOutputsSchema } from "@powerhousedao/ph-run/runners/connect";
import { outputsSchema as switchboardOutputsSchema } from "@powerhousedao/ph-run/runners/switchboard";
import { startRun, type StartRunArgs } from "@powerhousedao/ph-run/start-run";
import { yellow } from "colorette";
import { z } from "zod";
import { vetraRuntimeRefusal } from "../../utils/vetra-instance.js";
import {
  clearVetraRuntime,
  syncMcpPortNotices,
  vetraRuntimeRecord,
  writeVetraRuntime,
  type VetraRuntimeRecord,
} from "../../utils/vetra-runtime.js";

/**
 * `ph run vetra`: the vetra host is the generic compound runner over a
 * switchboard and a connect member, so nothing below `ph run` knows it is
 * Vetra. What makes the stack the project's Vetra is done here around
 * startRun: refuse while another Vetra holds
 * the project, publish `.ph/vetra-runtime.json` once the stack is ready,
 * clear it on exit, and correct a drifted `.mcp.json`. `--restart` is its own
 * argument, not a runner's: it stops the recorded Vetra first.
 */
export async function runVetraHost(args: StartRunArgs): Promise<unknown> {
  const verb = args.verb ?? "run";
  // `build` starts nothing; a store verb is refused for a compound.
  if (ONE_SHOT_VERBS.has(verb) || STORE_VERBS.has(verb)) {
    return startRun(args);
  }
  const projectDir = args.projectRoot ?? process.cwd();
  const projectName = readProjectName(projectDir);
  const restart = args.argv?.includes(RESTART_FLAG) ?? false;
  if (restart) {
    const { stopVetra } = await import("../../utils/vetra-launcher.js");
    await stopVetra({
      projectDir,
      projectName,
      onProgress: (message) => console.log(message),
    });
  }
  const refusal = await vetraRuntimeRefusal(projectDir, projectName);
  if (refusal) throw new Error(refusal);

  const result = await startRun(
    restart
      ? { ...args, argv: args.argv?.filter((arg) => arg !== RESTART_FLAG) }
      : args,
  );
  publishVetraRuntime(projectDir, projectName, result);
  return result;
}

/** `ph run vetra --restart`, which `ph vetra --restart` is sugar for. */
const RESTART_FLAG = "--restart";

const startedSchema = z.object({
  started: z.array(z.object({ outputs: z.unknown() })),
});

const portOf = (url: string) => Number(new URL(url).port);

function firstMatch<T>(
  schema: z.ZodType<T>,
  candidates: unknown[],
): T | undefined {
  for (const candidate of candidates) {
    const match = schema.safeParse(candidate);
    if (match.success) return match.data;
  }
  return undefined;
}

/**
 * The record of a ready compound: its members are told apart by the outputs
 * their runners publish, since a host file is free to name them.
 */
export function vetraRecordOfRun(
  projectName: string,
  result: unknown,
): VetraRuntimeRecord | undefined {
  const parsed = startedSchema.safeParse(result);
  const outputs = parsed.success
    ? parsed.data.started.map((member) => member.outputs)
    : [];
  const switchboard = firstMatch(switchboardOutputsSchema, outputs);
  if (!switchboard) return undefined;
  const connect = firstMatch(connectOutputsSchema, outputs);
  return vetraRuntimeRecord({
    projectName,
    switchboardPort: portOf(switchboard.origin),
    // Vite may have taken another port, and the base path is Connect's.
    connectPort: connect ? portOf(connect.origin) : 0,
    switchboardUrl: switchboard.endpoints.graphql,
    mcpUrl: switchboard.endpoints.mcp,
    connectUrl: connect?.endpoints.connect,
  });
}

/**
 * Publishes the record of the stack startRun returned and syncs the MCP
 * configs to its port. Returns what clears the record again; it also runs on
 * exit. No SIGINT/SIGTERM handler: the compound owns the exit, and its
 * process.exit reaches the exit event.
 */
export function publishVetraRuntime(
  projectDir: string,
  projectName: string,
  result: unknown,
): () => void {
  const record = vetraRecordOfRun(projectName, result);
  if (!record) {
    console.warn(
      yellow(
        "No switchboard member is running, so .ph/vetra-runtime.json is not written and `ph mcp` will not find this stack.",
      ),
    );
    return () => {};
  }
  // Record what the stack actually bound, so a second Vetra can tell a live
  // instance from a stale file, and so an agent can see the real ports.
  writeVetraRuntime(projectDir, record);
  // A restarted Vetra may already have written its own.
  const release = () => clearVetraRuntime(projectDir, process.pid);
  process.on("exit", release);

  for (const notice of syncMcpPortNotices(projectDir, record.switchboardPort)) {
    console.log(yellow(notice));
  }
  return release;
}
