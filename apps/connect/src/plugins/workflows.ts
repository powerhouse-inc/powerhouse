import { findToken } from "@powerhousedao/host-core/schema";
import type {
  PHConnectDefaultDrive,
  PHConnectRuntimeConfig,
} from "@powerhousedao/shared/clis";
import type {
  ConnectPlugin,
  ConnectPluginFactory,
} from "@powerhousedao/connect-core/plugins";
import { parseEntryConfig } from "./entry-config.js";
import {
  workflowsConnectConfigSchema,
  type WorkflowsConnectConfig,
  type WorkflowsConnectConfigInput,
} from "../plugin-configs/workflows.js";

/**
 * The workflows plugin, browser side (`@powerhousedao/connect/plugins/
 * workflows`) — the Connect half of the link whose server half is
 * `@powerhousedao/switchboard/plugins/workflows` (workflow-plugins plan).
 *
 * Presence is activation: listed, Connect loads the workflow package (so
 * Workflow Studio, the drive app the Workflows drive names as its preferred
 * editor, exists) and attaches the configured drive as a remote default
 * drive. Absent from a declared composition, `app.workflowsEnabled` is zeroed
 * (its whenAbsent in ./index.ts) — the classic `workflows.enabled` /
 * `connect.app.workflowsEnabled` values stop being the switch.
 *
 * `drive` is the switchboard's drive URL (`http://host:port/d/<slug>`). The
 * drive has to be a REMOTE of the switchboard that runs the workflow runtime:
 * Workflow Studio reaches that runtime through the selected drive's
 * switchboard, so a local copy would render the studio against the wrong
 * endpoint. Host files write it as the output token
 * `switchboard.drives.workflows.url`; `ph run` resolves it (from the
 * compound's live member or the switchboard's run record) before this
 * config reaches the browser.
 */

// Schema and PHPluginConfigs augmentation: ../plugin-configs (zod-only).
export {
  workflowsConnectConfigSchema,
  type WorkflowsConnectConfig,
  type WorkflowsConnectConfigInput,
};

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
  const config: WorkflowsConnectConfig = parseEntryConfig(
    "@powerhousedao/connect/plugins/workflows",
    workflowsConnectConfigSchema,
    rawConfig,
  );
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
        } else if (drive !== undefined) {
          console.warn(
            `${LOG} drive is an unresolved output token (${findToken(drive)?.key ?? "unknown"}); no Workflows drive attached.`,
          );
        }
        return out;
      },
    },
  };
  return plugin;
};

export default createWorkflowsPlugin;
