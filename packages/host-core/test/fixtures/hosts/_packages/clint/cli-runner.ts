// Fixture mirror of packages/clint/src/runners/cli-runner.ts (contract only).
import { z } from "zod";
import { defineHostSchemas } from "../../../../../src/host-schemas.js";
import { neverLaunched } from "../ph-cli/never-launched.js";

export const kind = "reactor";

export const foreground = true;

export const verbs = ["run"] as const;

export const argsSchema = { options: [], flags: [], passthrough: true };

const schemas = defineHostSchemas((s) =>
  s.reactorHostSchema.extend({
    runner: s.runnerBaseSchema.strict(),
    config: z
      .strictObject({ package: z.string().min(1).optional() })
      .optional(),
  }),
);
export const declaredHostSchema = schemas.declaredHostSchema;
export const hostSchema = schemas.hostSchema;

export const run = neverLaunched("@powerhousedao/clint/cli-runner");
