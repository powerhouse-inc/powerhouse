// Fixture mirror of clis/ph-cli/src/runners/connect.ts (contract only).
import { connectConfigSchemaWith } from "@powerhousedao/shared/connect/connect-config-schema";
import { z } from "zod";
import {
  defineHostSchemas,
  refineConnectReactor,
} from "../../../../../src/host-schemas.js";
import { neverLaunched } from "./never-launched.js";

export const kind = "reactor";

const schemas = defineHostSchemas((s) =>
  s.reactorHostSchema
    .extend({
      runner: s.runnerBaseSchema
        .extend({
          openBrowser: z.boolean().optional(),
          strictPort: z.boolean().optional(),
          outDir: z.string().min(1).optional(),
          cspRegistrySync: z.boolean().optional(),
        })
        .strict(),
      config: connectConfigSchemaWith(s.tokenable).optional(),
    })
    .superRefine(refineConnectReactor),
);
export const declaredHostSchema = schemas.declaredHostSchema;
export const hostSchema = schemas.hostSchema;

export const outputsSchema = z.strictObject({
  origin: z.url(),
  endpoints: z.strictObject({ connect: z.url() }),
});

export const dev = neverLaunched("@powerhousedao/ph-cli/runners/connect");
export const run = dev;
export const build = dev;
export const serve = dev;
