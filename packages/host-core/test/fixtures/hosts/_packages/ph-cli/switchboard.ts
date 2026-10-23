// Fixture mirror of clis/ph-cli/src/runners/switchboard.ts (contract only).
import { z } from "zod";
import { defineHostSchemas } from "../../../../../src/host-schemas.js";
import { neverLaunched } from "./never-launched.js";

export const kind = "reactor";

const schemas = defineHostSchemas((s) =>
  s.reactorHostSchema.extend({
    runner: s.runnerBaseSchema
      .extend({
        dev: z.boolean().optional(),
        outDir: z.string().min(1).optional(),
      })
      .strict(),
    config: z.strictObject({}).optional(),
  }),
);
export const declaredHostSchema = schemas.declaredHostSchema;
export const hostSchema = schemas.hostSchema;

export const outputsSchema = z.strictObject({
  origin: z.url(),
  endpoints: z.strictObject({
    graphql: z.url(),
    mcp: z.url().optional(),
  }),
  drives: z.record(
    z.string(),
    z.strictObject({ id: z.string().min(1), url: z.url() }),
  ),
});

export const run = neverLaunched("@powerhousedao/ph-cli/runners/switchboard");
export const serve = run;
export const dev = run;
export const build = run;

// Test-only: FIXTURE_BOOT_ISSUE stands in for the real boot predicates.
export function checkBoot(
  _host: unknown,
  ctx: { env: Readonly<Record<string, string | undefined>> },
) {
  const message = ctx.env.FIXTURE_BOOT_ISSUE;
  return message ? [{ path: "reactor", message }] : [];
}
