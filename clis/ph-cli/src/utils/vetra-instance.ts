import { probeRun } from "@powerhousedao/host-core";
import { probeVetraRuntime } from "./vetra-runtime.js";

/**
 * One Vetra per project, whichever command started it. `ph vetra` records
 * itself in `.ph/vetra-runtime.json`; `ph run vetra` records its stack in
 * `.ph/run/vetra.json` and, once ready, in `.ph/vetra-runtime.json` too.
 * Each start asks here whether the other kind holds the project.
 */

/** The host folder `ph vetra` routes to, and the name its host file carries. */
export const VETRA_HOST = "vetra";

/** Why `ph vetra` must not start: a live `ph run vetra` holds the project. */
export function runVetraRefusal(
  projectDir: string,
  projectName: string,
): string | undefined {
  const probe = probeRun(projectDir, VETRA_HOST, projectName);
  if (probe.status === "live" && probe.record.pid !== process.pid) {
    return (
      `Vetra is already running for this project through \`ph run ${VETRA_HOST}\` ` +
      `(pid ${probe.record.pid}). Stop it before starting another.`
    );
  }
  if (probe.status === "foreign") {
    return (
      `.ph/run/${VETRA_HOST}.json describes a live "${probe.record.projectName}", ` +
      `but this project is "${projectName}". Refusing to start a second instance.`
    );
  }
  return undefined;
}

/** Why `ph run vetra` must not start: a live Vetra holds the project. */
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
