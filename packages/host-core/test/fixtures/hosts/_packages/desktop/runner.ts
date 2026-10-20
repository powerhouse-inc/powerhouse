// Fixture mirror of packages/desktop/src/runner.ts (contract only).
import { z } from "zod";
import {
  compoundWiringSchema,
  defineHostSchemas,
  refineStartOrder,
} from "../../../../../src/host-schemas.js";
import { neverLaunched } from "../ph-cli/never-launched.js";

export const kind = "compound";

export const verbs = ["run", "serve", "dev", "build"] as const;

const shellOptionsSchema = z.strictObject({
  project: z.string().min(1).optional(),
  window: z
    .strictObject({
      title: z.string().optional(),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
    })
    .optional(),
  tray: z.boolean().optional(),
  fileAssociations: z.array(z.string().min(1)).optional(),
});

const schemas = defineHostSchemas((base) =>
  base.compoundHostSchema
    .extend({
      runner: base.runnerBaseSchema
        .extend({
          shell: shellOptionsSchema.optional(),
          vendorStack: z.boolean().optional(),
          phCliVersion: z.string().min(1).optional(),
          phCliSpec: z.string().min(1).optional(),
        })
        .strict(),
      config: compoundWiringSchema.optional(),
    })
    .superRefine(refineStartOrder),
);
export const declaredHostSchema = schemas.declaredHostSchema;
export const hostSchema = schemas.hostSchema;

export const outputsSchema = z.strictObject({});

export const run = neverLaunched("@powerhousedao/desktop/runner");
export const serve = run;
export const dev = run;
export const build = run;
/** A helper export that is not a verb. */
export function shellMode(): string {
  return "headless";
}
