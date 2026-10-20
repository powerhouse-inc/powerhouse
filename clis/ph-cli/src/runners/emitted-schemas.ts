import { emitHostJsonSchema } from "@powerhousedao/host-core";
import * as connect from "./connect.js";
import * as switchboard from "./switchboard.js";

/**
 * The editor JSON Schemas of ph-cli's runners (typed-host-configs 1.3): each
 * runner's host schema and outputs schema, keyed by the file name under
 * clis/ph-cli/schemas/. Not a runner module: it only feeds
 * scripts/emit-runner-schemas.ts and the drift test.
 */
export function emittedRunnerSchemas(): Record<string, unknown> {
  return {
    "runner-connect.schema.json": emitHostJsonSchema(
      "ph-cli/runner-connect",
      connect.declaredHostSchema,
    ),
    "runner-connect.outputs.schema.json": emitHostJsonSchema(
      "ph-cli/runner-connect.outputs",
      connect.outputsSchema,
    ),
    "runner-switchboard.schema.json": emitHostJsonSchema(
      "ph-cli/runner-switchboard",
      switchboard.declaredHostSchema,
    ),
    "runner-switchboard.outputs.schema.json": emitHostJsonSchema(
      "ph-cli/runner-switchboard.outputs",
      switchboard.outputsSchema,
    ),
  };
}
