import type { HostPlugin } from "@powerhousedao/host-core";
import type { ILogger } from "document-model";
import { z } from "zod";
import {
  isWorkflowSingletonConflict,
  retryWorkflowSingleton,
  type ComposedWorkflowRuntime,
  type WorkflowSingletonRetry,
} from "../workflow-runtime.mjs";
import type { SwitchboardHostContext } from "../plugin-host.mjs";

/**
 * R2.5 — the workflows subsystem as a built-in plugin. Presence is activation
 * (an explicit options.workflows.enabled === false still wins, mirroring the
 * mcp carve); the PH_WORKFLOWS_ENABLED env/config resolution governs the
 * classic path only.
 *
 * The plugin also DECLARES the drive the runtime serves — the Workflows drive
 * that opens in Workflow Studio — as a drive contribution (workflow-plugins
 * plan). The switchboard runner merges it into the host's drive plan (a host
 * declaration with the same slug wins), seeds it, reports it on the handle so
 * a compound can hand it to its connect member, and `--explain drives` lists
 * it with this plugin as provenance. Before, the runner seeded that drive as
 * an implicit side effect of the workflows flag; now the entry's `config.drive`
 * names it (`drive: false` serves the runtime without seeding a drive).
 *
 * The orchestration (compose, singleton-conflict retry, subgraph
 * registration, start, inspection fact) moves here VERBATIM from the inline
 * block; the dependency-heavy wiring closures (composeWorkflows,
 * registerWorkflowSubgraph) stay in server.mts and travel via ctx — same
 * realm, code moved not redesigned. Carve-map constraints preserved: the
 * retry path's onComposed registers + updates the router ITSELF (it may fire
 * after the readiness drain); teardown stops retry then runtime, and runs
 * AFTER privacy's (sequential onShutdown, registration order).
 */

export interface WorkflowsOrchestration {
  enabled: boolean;
  composeWorkflows: () => Promise<ComposedWorkflowRuntime>;
  registerWorkflowSubgraph: (
    composed: ComposedWorkflowRuntime,
  ) => Promise<void>;
  updateRouter: () => Promise<void>;
  reportMountFailure: (error: unknown) => void;
  setWorkflowsFact: () => void;
}

type WorkflowsOptions = Record<string, unknown> & {
  workflows?: { enabled?: boolean };
};

/** The drive app Workflow Studio registers under (packages/workflow). */
export const WORKFLOW_STUDIO_EDITOR_ID = "workflow-studio";

/** The drive the plugin seeds unless the entry says otherwise. */
export const DEFAULT_WORKFLOWS_DRIVE = {
  slug: "workflows",
  name: "Workflows",
} as const;

const workflowsDriveSchema = z.strictObject({
  /** The seeding key and the served `/d/<slug>` path (default "workflows"). */
  slug: z.string().min(1).optional(),
  /** Display name (default "Workflows"). */
  name: z.string().min(1).optional(),
  /** Fixed id; without one the id is project-hashed like classic `ph vetra`
   * (`workflows-<sha256(projectPath)[0:8]>`, slug unchanged), so existing
   * stores keep theirs. `projectHash: true` hashes the served slug as well. */
  id: z.string().min(1).optional(),
  projectHash: z.union([z.boolean(), z.literal("id")]).optional(),
  icon: z.string().optional(),
});

export const workflowsPluginConfigSchema = z.strictObject({
  /** The Workflows drive to seed; `false` runs the runtime without one. */
  drive: z.union([workflowsDriveSchema, z.literal(false)]).optional(),
});

export type WorkflowsPluginConfig = z.infer<typeof workflowsPluginConfigSchema>;

export type WorkflowsPlugin = HostPlugin<
  {
    transformServerOptions: (
      options: Record<string, unknown>,
      ctx: SwitchboardHostContext,
    ) => Record<string, unknown>;
    onSubgraphsRegistering: (ctx: SwitchboardHostContext) => Promise<void>;
    onShutdown: (ctx: SwitchboardHostContext) => Promise<void>;
  },
  WorkflowsPluginConfig
>;

/** The drive declaration the entry config amounts to (host-core's
 * DriveDeclaration shape; kept structural here to avoid the import cycle the
 * Contributions type documents). `undefined` when `drive: false`. */
export function workflowsDriveDeclaration(
  config: WorkflowsPluginConfig,
): Record<string, unknown> | undefined {
  if (config.drive === false) return undefined;
  const drive = config.drive ?? {};
  return {
    slug: drive.slug ?? DEFAULT_WORKFLOWS_DRIVE.slug,
    name: drive.name ?? DEFAULT_WORKFLOWS_DRIVE.name,
    preferredEditor: WORKFLOW_STUDIO_EDITOR_ID,
    ...(drive.id !== undefined
      ? { id: drive.id }
      : { projectHash: drive.projectHash ?? "id" }),
    ...(drive.icon !== undefined ? { icon: drive.icon } : {}),
  };
}

export function createWorkflowsPlugin(
  rawConfig: unknown = {},
): WorkflowsPlugin {
  const config = workflowsPluginConfigSchema.parse(rawConfig ?? {});
  const drive = workflowsDriveDeclaration(config);
  return {
    name: "switchboard-workflows",
    appliesTo: "switchboard",
    configSchema: workflowsPluginConfigSchema,
    contributions: { drives: drive ? [drive] : [] },
    hooks: {
      transformServerOptions: (options) => {
        const current = (options as WorkflowsOptions).workflows;
        if (current?.enabled === false) return options;
        return { ...options, workflows: { ...current, enabled: true } };
      },
      onSubgraphsRegistering: async (ctx) => {
        const orchestration = ctx.workflowsOrchestration as
          | WorkflowsOrchestration
          | undefined;
        if (!orchestration?.enabled) return;
        const logger = ctx.logger as ILogger;
        const lateSubgraphs = ctx.lateSubgraphs!;

        let workflows: ComposedWorkflowRuntime | undefined;
        let workflowsRetry: WorkflowSingletonRetry | undefined;
        try {
          workflows = await orchestration.composeWorkflows();
        } catch (error) {
          // Without the claim this host must not run workflows, but everything
          // else it serves still works, so it boots without the runtime.
          if (!isWorkflowSingletonConflict(error)) throw error;
          logger.warn(
            `Workflows are enabled but another live process ("${error.owner ?? "unknown"}") ` +
              `holds the workflow singleton until ${error.expiresAt ?? "unknown"}. ` +
              "This Switchboard has booted WITHOUT the workflow runtime: no " +
              "trigger of any kind fires here, and the workflow GraphQL face is " +
              "absent. Everything else serves normally. Stop the other owner, or " +
              "set PH_WORKFLOWS_SINGLETON_OWNER to the same stable name on the " +
              "slot that owns workflows. This Switchboard retries the claim and " +
              "starts workflows once the lease comes free.",
          );
          workflowsRetry = retryWorkflowSingleton({
            compose: orchestration.composeWorkflows,
            onComposed: async (composed) => {
              try {
                await composed.start();
              } catch (error) {
                // Hands the lease back so a retry or another replica can claim it.
                try {
                  await composed.stop();
                } catch (stopError) {
                  logger.error(
                    "Stopping the late workflow runtime failed: @error",
                    stopError,
                  );
                }
                throw error;
              }
              logger.info("Workflow runtime started");
              ctx.workflows = composed;
              await orchestration.registerWorkflowSubgraph(composed);
              // Past boot nothing else rebuilds the router, so a subgraph
              // registered now is not served until this runs.
              try {
                await orchestration.updateRouter();
              } catch (error) {
                orchestration.reportMountFailure(error);
              }
            },
            logger,
          });
        }
        ctx.workflowsRetry = workflowsRetry;
        if (workflows) {
          ctx.workflows = workflows;
          lateSubgraphs.push(orchestration.registerWorkflowSubgraph(workflows));
          await workflows.start();
          logger.info("Workflow runtime started");
          orchestration.setWorkflowsFact();
        }
      },
      onShutdown: async (ctx) => {
        await (
          ctx.workflowsRetry as WorkflowSingletonRetry | undefined
        )?.stop();
        await (ctx.workflows as ComposedWorkflowRuntime | undefined)?.stop();
      },
    },
  };
}

/** The default-config instance: the built-in composition's entry. */
export const workflowsPlugin: WorkflowsPlugin = createWorkflowsPlugin({});

// resolveHostPlugins consumes the DEFAULT export (plugin object or factory);
// a factory lets the entry carry `config: { drive }`.
export default createWorkflowsPlugin;
