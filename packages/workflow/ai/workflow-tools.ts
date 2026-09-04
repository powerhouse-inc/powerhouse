// AI tool descriptors for authoring and running workflows: the exact block
// types a piece offers, a block's config props, the built-in core blocks with
// the expression syntax, run history and manual firing. Complements the
// connector/connection tools in tools.ts, which cover the catalog and auth.
import type { PhAiToolDescriptor } from "@powerhousedao/shared/document-model";
import { z } from "zod";
import {
  fetchPieceActions,
  fetchPieceTriggers,
  fetchRuns,
  fireWorkflow,
  getBlockForm,
} from "../editors/workflow-editor/runtime-api.js";
import {
  CORE_FORMS,
  type BlockFormProp,
} from "../editors/workflow-editor/ui/forms.js";
import { syncRuntimeUrl } from "./runtime-url.js";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const CORE_TRIGGERS = new Set([
  "core#manual",
  "core#document-event",
  "core#document-created",
  "core#document-deleted",
]);

function kindOf(blockType: string): "trigger" | "step" {
  return CORE_TRIGGERS.has(blockType) || blockType.includes("#trigger:")
    ? "trigger"
    : "step";
}

function portsFor(blockType: string): string[] {
  return blockType === "core#branch" ? ["true", "false"] : ["next"];
}

function describeProp(prop: BlockFormProp) {
  return {
    name: prop.name,
    label: prop.displayName,
    type: prop.type,
    required: prop.required,
    ...(prop.description ? { description: prop.description } : {}),
    ...(prop.defaultValue !== undefined ? { default: prop.defaultValue } : {}),
    ...(prop.staticOptions
      ? { options: prop.staticOptions.map((option) => option.value) }
      : {}),
    ...(prop.hasDynamicResolver ? { dynamicOptions: true } : {}),
  };
}

const EXPRESSIONS = [
  "Step configs and edge conditions may contain expressions in double braces.",
  "{{trigger.payload.<field>}} reads the trigger payload: for core#manual the payload passed to fireWorkflow; for core#document-* it carries documentId, documentType, driveId and name.",
  "{{steps.<key>.output.<path>}} reads an upstream step's output by that step's key, e.g. {{steps.fetch.output.body.title}}.",
  "{{variables.<key>}} reads a workflow variable.",
  "'a' || 'b' picks the first non-empty value, e.g. {{trigger.payload.url || 'https://example.com'}}.",
  "A whole-string expression yields the raw value; text around expressions is interpolated.",
];

const GRAPH_RULES = [
  "A workflow is a powerhouse/workflow document. Build it with SET_TRIGGER once, ADD_STEP per step (each with a unique id and key), and ADD_EDGE from the trigger id to the first step and between steps.",
  "Edges use port 'next' for the trigger and ordinary steps; core#branch emits 'true' and 'false'.",
  "Piece block types are '<package>@<version>#<action>' for actions and '<package>@<version>#trigger:<trigger>' for triggers. Always use the pinned strings returned by getWorkflowPieceBlocks.",
  "Steps whose piece needs a connection must set connectionId to a powerhouse/connection document id (see getConnections).",
  "Only workflows with status ENABLED get trigger instances and can be fired; set it with SET_WORKFLOW_STATUS.",
];

export const getWorkflowPieceBlocksTool: PhAiToolDescriptor = {
  name: "getWorkflowPieceBlocks",
  description:
    "Lists the actions and triggers of one Activepieces piece with the exact, version-pinned blockType to use in ADD_STEP or SET_TRIGGER. Takes the piece package name from getConnectors. Call getWorkflowBlockConfig next for a block's config props.",
  inputSchema: {
    packageName: z
      .string()
      .describe("Piece package name, e.g. @activepieces/piece-http."),
  },
  annotations: { title: "Get Workflow Piece Blocks", ...READ_ONLY },
  callback: async (args: { packageName: string }) => {
    syncRuntimeUrl();
    const [actions, triggers] = await Promise.all([
      fetchPieceActions(args.packageName),
      fetchPieceTriggers(args.packageName),
    ]);
    return {
      packageName: args.packageName,
      actions: actions.map((action) => ({
        blockType: action.blockType,
        displayName: action.displayName,
        description: action.description,
      })),
      triggers: triggers.map((trigger) => ({
        blockType: trigger.blockType,
        displayName: trigger.displayName,
        description: trigger.description,
        strategy: trigger.strategy,
      })),
    };
  },
};

export const getWorkflowBlockConfigTool: PhAiToolDescriptor = {
  name: "getWorkflowBlockConfig",
  description:
    "Describes the config of a block type (core#… or a piece blockType): prop names, types, whether required, allowed options, the output ports, and whether a connection is needed. Use it before writing a step or trigger config.",
  inputSchema: {
    blockType: z
      .string()
      .describe(
        "Block type, e.g. core#branch or @activepieces/piece-http@0.11.19#send_request.",
      ),
  },
  annotations: { title: "Get Workflow Block Config", ...READ_ONLY },
  callback: async (args: { blockType: string }) => {
    const { blockType } = args;
    if (!Object.hasOwn(CORE_FORMS, blockType)) syncRuntimeUrl();
    const form = await getBlockForm(blockType);
    if (!form) {
      return {
        blockType,
        error:
          "Unknown block type. Use getConnectors and getWorkflowPieceBlocks to find valid block types, or listWorkflowCoreBlocks for built-ins.",
      };
    }
    return {
      blockType,
      title: form.title,
      kind: kindOf(blockType),
      requiresConnection: form.auth === "required",
      props: form.props.map(describeProp),
      ports: portsFor(blockType),
    };
  },
};

export const listWorkflowCoreBlocksTool: PhAiToolDescriptor = {
  name: "listWorkflowCoreBlocks",
  description:
    "Lists the built-in core#… blocks (manual and document triggers, branch, document create and dispatch) with their config props, plus the expression syntax and the rules for building a powerhouse/workflow document.",
  inputSchema: {},
  annotations: { title: "List Workflow Core Blocks", ...READ_ONLY },
  callback: () =>
    Promise.resolve({
      blocks: Object.entries(CORE_FORMS).map(([blockType, form]) => ({
        blockType,
        title: form.title,
        kind: kindOf(blockType),
        props: form.props.map(describeProp),
        ports: portsFor(blockType),
      })),
      expressions: EXPRESSIONS,
      rules: GRAPH_RULES,
    }),
};

export const listWorkflowRunsTool: PhAiToolDescriptor = {
  name: "listWorkflowRuns",
  description:
    "Lists recent workflow runs, newest first, with status, error and each step's outcome. Filter by workflowId to inspect one workflow, or by driveId for every workflow in a drive.",
  inputSchema: {
    workflowId: z
      .string()
      .optional()
      .describe("Workflow document id to filter by."),
    driveId: z
      .string()
      .optional()
      .describe("Drive id to filter by (all workflows in that drive)."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Maximum runs to return (default 10)."),
  },
  annotations: { title: "List Workflow Runs", ...READ_ONLY },
  callback: async (args: {
    workflowId?: string;
    driveId?: string;
    limit?: number;
  }) => {
    syncRuntimeUrl();
    const runs = await fetchRuns({
      workflowId: args.workflowId,
      driveId: args.driveId,
      limit: args.limit ?? 10,
    });
    return {
      runs: runs.map((run) => ({
        id: run.id,
        workflowId: run.workflowId,
        workflowName: run.workflowName,
        status: run.status,
        error: run.error,
        triggerKind: run.triggerKind,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        steps: run.steps.map((step) => ({
          key: step.stepKey,
          status: step.status,
          error: step.error,
        })),
      })),
    };
  },
};

export const fireWorkflowTool: PhAiToolDescriptor = {
  name: "fireWorkflow",
  description:
    "Fires an ENABLED workflow that has a core#manual trigger and runs it to completion. The payload becomes {{trigger.payload}}. Returns the run id and final status.",
  inputSchema: {
    workflowId: z.string().describe("Workflow document id."),
    payload: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Trigger payload object."),
  },
  annotations: {
    title: "Fire Workflow",
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  callback: (args: {
    workflowId: string;
    payload?: Record<string, unknown>;
  }) => {
    syncRuntimeUrl();
    return fireWorkflow(args.workflowId, args.payload ?? {});
  },
};

/** Workflow authoring and run tools, merged into `aiTools` in tools.ts. */
export const workflowTools: PhAiToolDescriptor[] = [
  getWorkflowPieceBlocksTool,
  getWorkflowBlockConfigTool,
  listWorkflowCoreBlocksTool,
  listWorkflowRunsTool,
  fireWorkflowTool,
];
