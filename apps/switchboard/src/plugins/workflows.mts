import type { HostPlugin } from "@powerhousedao/host-core";
import type { ILogger } from "document-model";
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

export const workflowsPlugin: HostPlugin<{
  transformServerOptions: (
    options: Record<string, unknown>,
    ctx: SwitchboardHostContext,
  ) => Record<string, unknown>;
  onSubgraphsRegistering: (ctx: SwitchboardHostContext) => Promise<void>;
  onShutdown: (ctx: SwitchboardHostContext) => Promise<void>;
}> = {
  name: "switchboard-workflows",
  appliesTo: "switchboard",
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
      await (ctx.workflowsRetry as WorkflowSingletonRetry | undefined)?.stop();
      await (ctx.workflows as ComposedWorkflowRuntime | undefined)?.stop();
    },
  },
};

// resolveHostPlugins consumes the DEFAULT export (plugin object or factory).
export default workflowsPlugin;
