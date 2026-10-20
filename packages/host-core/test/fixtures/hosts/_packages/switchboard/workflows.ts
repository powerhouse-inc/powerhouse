// Fixture mirror of apps/switchboard/src/plugins/workflows.mts: its config
// schema and the drive it contributes (the plugin-contributed drive cell).
import { z } from "zod";
import type { HostPlugin } from "../../../../../src/plugins.js";

const workflowsPluginConfigSchema = z.strictObject({
  drive: z
    .union([
      z.strictObject({
        slug: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        id: z.string().min(1).optional(),
        projectHash: z.union([z.boolean(), z.literal("id")]).optional(),
        icon: z.string().optional(),
      }),
      z.literal(false),
    ])
    .optional(),
});

export default function createWorkflowsPlugin(
  rawConfig: unknown = {},
): HostPlugin {
  const config = workflowsPluginConfigSchema.parse(rawConfig ?? {});
  const drive =
    config.drive === false
      ? undefined
      : {
          slug: config.drive?.slug ?? "workflows",
          name: config.drive?.name ?? "Workflows",
          preferredEditor: "workflow-studio",
          ...(config.drive?.id !== undefined
            ? { id: config.drive.id }
            : { projectHash: config.drive?.projectHash ?? "id" }),
        };
  return {
    name: "switchboard-workflows",
    appliesTo: "switchboard",
    configSchema: workflowsPluginConfigSchema,
    contributions: { drives: drive ? [drive] : [] },
  };
}
