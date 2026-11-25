import { probeVetraRuntime } from "./vetra-runtime.js";

/**
 * One dev stack per project. `ph run dev` (hosts/vetra in a project that has
 * only that one) records its stack in `.ph/run/<host>.json` and, once ready,
 * in `.ph/vetra-runtime.json`, which is what a start asks here: whether a
 * stack already holds the project.
 */

/** Why the dev host must not start: a live one holds the project. */
export async function vetraRuntimeRefusal(
  projectDir: string,
  projectName: string,
): Promise<string | undefined> {
  const probe = await probeVetraRuntime(projectDir, projectName);
  if (probe.status === "live" || probe.status === "starting") {
    if (probe.record.pid === process.pid) return undefined;
    return `Vetra is already running for this project (pid ${probe.record.pid}). Stop it before starting another.`;
  }
  if (probe.status === "foreign") {
    return (
      `.ph/vetra-runtime.json describes a live Vetra for "${probe.record.projectName}", ` +
      `but this project is "${projectName}". Refusing to start a second instance. ` +
      `Delete .ph/vetra-runtime.json if that record is wrong.`
    );
  }
  return undefined;
}
