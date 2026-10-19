import { z } from "zod";
import {
  childrenSchema,
  loadHost,
  profileSchema,
  type HostDefinition,
  type ReactorConfig,
  type RunnerContext,
} from "@powerhousedao/host-core";
import type { VetraArgs } from "../types.js";

/**
 * BRIDGE compound runner (uniform-runners phase 0): args derivation, not
 * supervision. It reads the compound's member wrappers plus the member host
 * files they reference, derives exactly the args today's `startVetra` takes,
 * and calls it — so `ph run vetra` and classic `ph vetra` share one code
 * path. Real supervision (members started via their own runners, instance-
 * fact projection, .ph/run records) is the phase-1 generic compound in
 * @powerhousedao/host-core; this file is deleted when that lands.
 */

export const kind = "compound";

/** Phase-2 schema (D2.d): children member shapes + profile come from
 * host-core — member reactor overrides now validate strictly. */
export const hostSchema = z.looseObject({
  name: z.string().min(1),
  runner: z.looseObject({
    module: z.string(),
    defaultVerb: z.string().optional(),
  }),
  children: childrenSchema,
  config: z.looseObject({}).optional(),
  profile: profileSchema.optional(),
});

interface MemberRef {
  name: string;
  host: string;
  runnerPort?: number;
}

function members(host: HostDefinition): MemberRef[] {
  return Object.entries(host.children ?? {}).map(([name, wrapper]) => ({
    name,
    host: wrapper.host,
    runnerPort: wrapper.runner?.port,
  }));
}

async function memberPort(
  projectRoot: string,
  ref: MemberRef,
): Promise<number | undefined> {
  // wrapper override wins; otherwise the member host's own runner.port
  if (ref.runnerPort !== undefined) return ref.runnerPort;
  const member = await loadHost(projectRoot, ref.host);
  const port = member.host.runner.port;
  return typeof port === "number" ? port : undefined;
}

export async function run(
  host: HostDefinition,
  ctx: RunnerContext,
): Promise<void> {
  const defaultVerb = host.runner.defaultVerb ?? "run";
  if (defaultVerb !== "dev") {
    throw new Error(
      `The phase-0 compound bridge only supports defaultVerb "dev" (vetra semantics); ` +
        `got "${defaultVerb}". Other member verbs arrive with the host-core compound.`,
    );
  }

  const refs = members(host);
  const connectRef = refs.find((r) => r.host === "connect");
  const switchboardRef = refs.find((r) => r.host === "switchboard");
  if (!connectRef || !switchboardRef) {
    throw new Error(
      `The phase-0 compound bridge expects children wrapping the "connect" and ` +
        `"switchboard" hosts (vetra shape); found members for: ${
          refs.map((r) => r.host).join(", ") || "<none>"
        }.`,
    );
  }

  const connectPort = await memberPort(ctx.projectRoot, connectRef);
  const switchboardPort = await memberPort(ctx.projectRoot, switchboardRef);
  if (connectPort === undefined || switchboardPort === undefined) {
    throw new Error(
      `Cannot derive member ports: connect=${connectPort}, switchboard=${switchboardPort}. ` +
        `Set runner.port in the member host files or override it in the compound's wrappers.`,
    );
  }

  // The switchboard member's reactor block applies on this path too: startVetra
  // boots the switchboard in-process without going through the switchboard
  // runner's verbs, so project the block onto env HERE (P2.4 via the vetra
  // path). Wrapper override wins over the member host file, as everywhere.
  const sbMember = await loadHost(ctx.projectRoot, switchboardRef.host);
  const sbWrapper = host.children?.[switchboardRef.name];
  const sbReactor: ReactorConfig = {
    ...sbMember.host.reactor,
    ...sbWrapper?.reactor,
  };
  const { applyReactorEnvProjection } = await import("./reactor-env.js");
  applyReactorEnvProjection(sbReactor, `hosts/${switchboardRef.host}/host.js`);

  // Classic `ph vetra` resolves these through flag>env>.env>config>constant;
  // a hosts project carries the values in its host files (the projection
  // already resolved powerhouse.config.json references), so the derived args
  // land on the same numbers. The equivalence suite pins this.
  const args: Partial<VetraArgs> = {
    connectPort,
    switchboardPort,
  };
  const { startVetra } = await import("../services/vetra.js");
  await startVetra(args as VetraArgs);
}
