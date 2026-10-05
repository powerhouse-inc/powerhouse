// AI tool descriptors for authoring and running workflows: the pinned blocks
// a piece offers, a block's config props, the built-in core blocks with
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
import type { BlockFormProp } from "../editors/workflow-editor/ui/forms.js";
import {
  CORE_PIECE,
  type BlockRef,
} from "../editors/workflow-editor/ui/blocks.js";
import { syncRuntimeUrl } from "./runtime-url.js";
import { flowPorts } from "@powerhousedao/pieces-framework/workflow";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

function kindOf(block: BlockRef): "trigger" | "step" {
  return block.kind === "trigger" ? "trigger" : "step";
}

// The fields ADD_STEP or SET_TRIGGER takes for the block.
function blockFields(block: BlockRef) {
  return {
    pieceName: block.pieceName,
    pieceVersion: block.pieceVersion,
    ...(block.kind === "trigger"
      ? { triggerName: block.name }
      : { actionName: block.name }),
  };
}

// The onward ports the block's descriptor declares; "error" is a failure route.
function portsFor(form: { ports?: readonly string[] }): string[] {
  return flowPorts(form.ports ?? []);
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
  "{{trigger.payload.<field>}} reads the trigger payload: for the core manual trigger the payload passed to fireWorkflow; for the reactor piece's document triggers it carries documentId, documentType, driveId and name.",
  "{{steps.<key>.output.<path>}} reads an upstream step's output by that step's key, e.g. {{steps.fetch.output.body.title}}.",
  "{{variables.<key>}} reads a workflow variable.",
  "'a' || 'b' picks the first non-empty value, e.g. {{trigger.payload.url || 'https://example.com'}}.",
  "A whole-string expression yields the raw value; text around expressions is interpolated.",
];

const GRAPH_RULES = [
  "A workflow is a powerhouse/workflow document. Build it with SET_TRIGGER once, ADD_STEP per step (each with a unique id and key), and ADD_EDGE from the trigger id to the first step and between steps.",
  "An edge must leave on a port its source declares (getWorkflowBlockConfig lists them): 'next' for the trigger and ordinary steps, 'true' and 'false' for the core branch action, 'error' to route a failure. An edge on any other port is never taken, and the run is flagged with a warning.",
  "A step names its block with pieceName, pieceVersion and actionName; the trigger with pieceName, pieceVersion and triggerName. pieceVersion is an exact semver: copy the fields getWorkflowPieceBlocks or listWorkflowCoreBlocks return.",
  `The built-in blocks (manual, schedule and webhook triggers, branch and assert) belong to the piece ${CORE_PIECE}.`,
  "Steps whose piece needs a connection must set connectionId to a powerhouse/connection document id (see getConnections).",
  "Runs execute the published snapshot, not the draft. PUBLISH_WORKFLOW only snapshots the draft, so publish again after every edit that should run.",
  "Only ENABLED workflows get trigger instances and can be fired. PUBLISH_WORKFLOW does not enable: to turn a workflow on, dispatch SET_WORKFLOW_STATUS ENABLED after PUBLISH_WORKFLOW (the same batch works). SET_WORKFLOW_STATUS ENABLED is refused until the workflow has been published once.",
];

export const getWorkflowPieceBlocksTool: PhAiToolDescriptor = {
  name: "getWorkflowPieceBlocks",
  description:
    "Lists the actions and triggers of one piece, each with the pieceName, pieceVersion and actionName or triggerName to use in ADD_STEP or SET_TRIGGER. Takes the piece package name from getConnectors. Call getWorkflowBlockConfig next for a block's config props.",
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
        pieceName: action.pieceName,
        pieceVersion: action.pieceVersion,
        actionName: action.name,
        displayName: action.displayName,
        description: action.description,
      })),
      triggers: triggers.map((trigger) => ({
        pieceName: trigger.pieceName,
        pieceVersion: trigger.pieceVersion,
        triggerName: trigger.name,
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
    "Describes the config of one block (a core block or a piece's action or trigger): prop names, types, whether required, allowed options, the output ports, and whether a connection is needed. Use it before writing a step or trigger config.",
  inputSchema: {
    pieceName: z
      .string()
      .describe(
        `Piece package name, e.g. ${CORE_PIECE} or @activepieces/piece-http.`,
      ),
    pieceVersion: z.string().describe("Exact semver of the piece."),
    name: z
      .string()
      .describe("Action or trigger name, e.g. branch or send_request."),
    kind: z.enum(["action", "trigger"]).describe("action or trigger."),
  },
  annotations: { title: "Get Workflow Block Config", ...READ_ONLY },
  callback: async (args: BlockRef) => {
    const block: BlockRef = {
      pieceName: args.pieceName,
      pieceVersion: args.pieceVersion,
      name: args.name,
      kind: args.kind,
    };
    syncRuntimeUrl();
    const form = await getBlockForm(block);
    if (!form) {
      return {
        ...blockFields(block),
        error:
          "Unknown block. Use getConnectors and getWorkflowPieceBlocks to find valid blocks (documents live in @powerhousedao/piece-reactor), or listWorkflowCoreBlocks for built-ins.",
      };
    }
    return {
      ...blockFields(block),
      title: form.title,
      kind: kindOf(block),
      requiresConnection: form.auth === "required",
      props: form.props.map(describeProp),
      ports: portsFor(form),
    };
  },
};

export const listWorkflowCoreBlocksTool: PhAiToolDescriptor = {
  name: "listWorkflowCoreBlocks",
  description: `Lists the built-in blocks of the ${CORE_PIECE} piece (manual, schedule and webhook triggers, branch and assert) with their pinned fields and config props, plus the expression syntax and the rules for building a powerhouse/workflow document. Documents are read and written by the @powerhousedao/piece-reactor blocks; list those with getWorkflowPieceBlocks.`,
  inputSchema: {},
  annotations: { title: "List Workflow Core Blocks", ...READ_ONLY },
  callback: async () => {
    syncRuntimeUrl();
    // The reactor serves the core piece's descriptors, as it does any piece's.
    const [actions, triggers] = await Promise.all([
      fetchPieceActions(CORE_PIECE),
      fetchPieceTriggers(CORE_PIECE),
    ]);
    const blocks: BlockRef[] = [
      ...triggers.map((entry) => ({ ...entry, kind: "trigger" as const })),
      ...actions.map((entry) => ({ ...entry, kind: "action" as const })),
    ].map((entry) => ({
      pieceName: entry.pieceName,
      pieceVersion: entry.pieceVersion,
      name: entry.name,
      kind: entry.kind,
    }));
    const forms = await Promise.all(blocks.map(getBlockForm));
    return {
      blocks: blocks.flatMap((block, index) => {
        const form = forms[index];
        if (!form) return [];
        return [
          {
            ...blockFields(block),
            title: form.title,
            kind: kindOf(block),
            props: form.props.map(describeProp),
            ports: portsFor(form),
          },
        ];
      }),
      expressions: EXPRESSIONS,
      rules: GRAPH_RULES,
    };
  },
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
    "Fires an ENABLED workflow whose trigger is the core manual trigger and runs its published snapshot to completion. The payload becomes {{trigger.payload}}. Returns the run id and final status.",
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
