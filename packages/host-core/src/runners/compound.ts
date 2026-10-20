import fs from "node:fs";
import path from "node:path";
import {
  declaredGenericCompoundHostSchema,
  genericCompoundHostSchema,
  type HostDefinition,
} from "../host-schemas.js";
import { runCompound, type RunCompoundResult } from "../compound.js";
import type { RunnerContext } from "../runner-resolver.js";

/**
 * The GENERIC compound runner module (phase 3): supervises the members a
 * compound host declares via the runCompound engine. Verb semantics: `run`
 * starts members at `runner.defaultVerb ?? "run"`; `dev`/`build`/`serve`
 * start members at that same verb — an explicit `ph run <host> <verb>` beats
 * defaultVerb structurally. A member whose runner lacks the forwarded verb
 * fails the compound loudly with that member's verb list (never skipped).
 *
 * Vetra does NOT run through this yet (phase-1 scope decision: its drive
 * provisioning arrives as plugin contributions); the first real consumer is
 * the desktop-shaped host (switchboard `run` + connect `serve`).
 */

export const kind = "compound";

export const hostSchema = genericCompoundHostSchema;
export const declaredHostSchema = declaredGenericCompoundHostSchema;

function projectName(projectRoot: string): string {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
    ) as { name?: string };
    if (pkg.name) return pkg.name;
  } catch {
    // fall through
  }
  return path.basename(projectRoot);
}

async function startAt(
  host: HostDefinition,
  ctx: RunnerContext,
  memberVerb: string,
): Promise<RunCompoundResult> {
  return runCompound(
    host,
    { ...ctx, verb: memberVerb },
    { projectName: projectName(ctx.projectRoot) },
  );
}

export async function run(
  host: HostDefinition,
  ctx: RunnerContext,
): Promise<RunCompoundResult> {
  const defaultVerb = host.runner.defaultVerb ?? "run";
  return startAt(host, ctx, defaultVerb);
}

export async function dev(
  host: HostDefinition,
  ctx: RunnerContext,
): Promise<RunCompoundResult> {
  return startAt(host, ctx, "dev");
}

export async function build(
  host: HostDefinition,
  ctx: RunnerContext,
): Promise<RunCompoundResult> {
  return startAt(host, ctx, "build");
}

export async function serve(
  host: HostDefinition,
  ctx: RunnerContext,
): Promise<RunCompoundResult> {
  return startAt(host, ctx, "serve");
}
