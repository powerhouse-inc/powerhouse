import {
  driveReferenceSchema,
  isDriveReference,
} from "@powerhousedao/host-core/plugins";
import type {
  PHConnectDefaultDrive,
  PHConnectRuntimeConfig,
} from "@powerhousedao/shared/clis";
import { z } from "zod";
import type { ConnectPlugin, ConnectPluginFactory } from "./types.js";

/**
 * The workflows plugin, browser side (`@powerhousedao/connect/plugins/
 * workflows`) — the Connect half of the link whose server half is
 * `@powerhousedao/switchboard/plugins/workflows` (workflow-plugins plan).
 *
 * Presence is activation: listed, Connect loads the workflow package (so
 * Workflow Studio, the drive app the Workflows drive names as its preferred
 * editor, exists) and attaches the configured drive as a remote default
 * drive. Absent from a declared composition, `app.workflowsEnabled` is zeroed
 * (plugin-host's zeroAbsentSlices) — the classic `workflows.enabled` /
 * `connect.app.workflowsEnabled` values stop being the switch.
 *
 * `drive` is the switchboard's drive URL (`http://host:port/d/<slug>`). The
 * drive has to be a REMOTE of the switchboard that runs the workflow runtime:
 * Workflow Studio reaches that runtime through the selected drive's
 * switchboard, so a local copy would render the studio against the wrong
 * endpoint. Inside a compound the entry may say `{ from: "<member>", slug }`
 * instead; the compound runner substitutes the member's URL before this
 * config reaches the browser, and the connect runner rejects a reference
 * that was never substituted.
 */

export const workflowsConnectConfigSchema = z
  .object({
    drive: z.union([z.string().min(1), driveReferenceSchema]).optional(),
    /** Display name for the attached drive entry (the drive's own name wins
     * once it syncs). */
    name: z.string().min(1).optional(),
  })
  .partial();

export type WorkflowsConnectConfig = z.infer<
  typeof workflowsConnectConfigSchema
>;

const LOG = "[connect:plugins:workflows]";

function withDrive(
  drives: PHConnectDefaultDrive[] | undefined,
  url: string,
  name: string | undefined,
): PHConnectDefaultDrive[] {
  const existing = drives ?? [];
  if (existing.some((drive) => "url" in drive && drive.url === url)) {
    return existing;
  }
  return [...existing, { url, name: name ?? null, icon: null }];
}

export const createWorkflowsPlugin: ConnectPluginFactory = (rawConfig) => {
  const config = workflowsConnectConfigSchema.parse(
    rawConfig ?? {},
  ) as WorkflowsConnectConfig;
  const plugin: ConnectPlugin = {
    name: "connect-workflows",
    appliesTo: "connect",
    configSchema: workflowsConnectConfigSchema,
    hooks: {
      transformConnectConfig(served: PHConnectRuntimeConfig) {
        const out: PHConnectRuntimeConfig = {
          ...served,
          app: { ...served.app, workflowsEnabled: true } as never,
        };
        const drive = config.drive;
        if (typeof drive === "string") {
          out.drives = {
            ...served.drives,
            defaultDrives: withDrive(
              served.drives?.defaultDrives,
              drive,
              config.name,
            ),
          } as never;
        } else if (isDriveReference(drive)) {
          console.warn(
            `${LOG} drive reference { from: "${drive.from}", slug: "${drive.slug}" } was not resolved by a compound; no Workflows drive attached.`,
          );
        }
        return out;
      },
    },
  };
  return plugin;
};

export default createWorkflowsPlugin;
