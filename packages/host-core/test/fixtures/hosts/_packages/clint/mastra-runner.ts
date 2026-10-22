// Fixture mirror of packages/clint/src/runners/mastra-runner.ts (contract only).
import { z } from "zod";
import { defineHostSchemas } from "../../../../../src/host-schemas.js";
import { neverLaunched } from "../ph-cli/never-launched.js";

export const kind = "reactor";

export const verbs = ["run", "serve", "build"] as const;

const schemas = defineHostSchemas((s) => {
  const agentHostConfigSchema = z.strictObject({
    model: z.string().min(1).optional(),
    apiKey: s.tokenable(z.string().min(1)).optional(),
    instructions: z.string().optional(),
    prompts: z
      .strictObject({
        skillsDir: z.string().min(1).optional(),
        agentsDir: z.string().min(1).optional(),
        outDir: z.string().min(1).optional(),
      })
      .optional(),
  });
  return s.reactorHostSchema.extend({
    runner: s.runnerBaseSchema.strict(),
    config: agentHostConfigSchema.optional(),
  });
});
export const declaredHostSchema = schemas.declaredHostSchema;
export const hostSchema = schemas.hostSchema;

export const outputsSchema = z.strictObject({
  origin: z.url(),
  endpoints: z.strictObject({ openai: z.url(), ready: z.url() }),
});

export const run = neverLaunched("@powerhousedao/clint/mastra-runner");
export const serve = run;
export const build = run;
/** A helper export that is not a verb (`verbs` above is authoritative). */
export function promptFromMessages(): string {
  return "";
}
