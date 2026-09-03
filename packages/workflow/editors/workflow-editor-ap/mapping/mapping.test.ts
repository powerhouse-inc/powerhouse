import { describe, expect, it, vi } from "vitest";
import type {
  WorkflowEditorCallbacks,
  WorkflowModel,
} from "../../workflow-editor/ui/model.js";
import {
  POWERHOUSE_PIECE_NAME,
  POWERHOUSE_PIECE_VERSION,
} from "../shims/ap-runtime.js";
import {
  FlowActionType,
  FlowOperationType,
  FlowTriggerType,
  StepLocationRelativeToParent,
  type FlowAction,
  type PieceAction,
  type RouterAction,
} from "../vendor/shared/index.js";
import {
  blockTypeFromPiece,
  pieceFromBlockType,
  triggerBlockTypeFromPiece,
} from "./block-type.js";
import { deriveFlowVersion } from "./derive-flow-version.js";
import { flowVersionsEquivalent } from "./flow-compare.js";
import {
  translateOperation,
  type ApDocumentBridge,
} from "./translate-operation.js";

function baseModel(partial: Partial<WorkflowModel> = {}): WorkflowModel {
  return {
    name: "My flow",
    status: "DRAFT",
    version: 3,
    trigger: {
      id: "t1",
      blockType: "core#manual",
      config: { note: "go" },
      connectionId: null,
    },
    steps: [],
    edges: [],
    ...partial,
  };
}

function step(
  id: string,
  key: string,
  blockType: string,
  config: unknown = {},
) {
  return {
    id,
    key,
    name: key,
    blockType,
    connectionId: null,
    config,
    timeoutSeconds: null,
    position: null,
  };
}

function edge(id: string, from: string, to: string, port = "next") {
  return { id, from, to, port, condition: null };
}

describe("block-type mapping", () => {
  it("round-trips piece block types", () => {
    const coordinates = pieceFromBlockType(
      "@activepieces/piece-http@0.11.19#send_request",
    );
    expect(coordinates).toEqual({
      pieceName: "@activepieces/piece-http",
      pieceVersion: "0.11.19",
      kind: "action",
      name: "send_request",
    });
    expect(
      blockTypeFromPiece(
        coordinates!.pieceName,
        coordinates!.pieceVersion,
        coordinates!.name,
      ),
    ).toBe("@activepieces/piece-http@0.11.19#send_request");
  });

  it("round-trips piece trigger block types", () => {
    const coordinates = pieceFromBlockType(
      "@activepieces/piece-rss@0.5.0#trigger:new_item",
    );
    expect(coordinates).toEqual({
      pieceName: "@activepieces/piece-rss",
      pieceVersion: "0.5.0",
      kind: "trigger",
      name: "new_item",
    });
    expect(
      triggerBlockTypeFromPiece(
        coordinates!.pieceName,
        coordinates!.pieceVersion,
        coordinates!.name,
      ),
    ).toBe("@activepieces/piece-rss@0.5.0#trigger:new_item");
  });

  it("maps core blocks onto the synthetic Powerhouse piece and back", () => {
    const coordinates = pieceFromBlockType("core#document-create");
    expect(coordinates).toEqual({
      pieceName: POWERHOUSE_PIECE_NAME,
      pieceVersion: POWERHOUSE_PIECE_VERSION,
      kind: "action",
      name: "document-create",
    });
    expect(
      blockTypeFromPiece(
        POWERHOUSE_PIECE_NAME,
        POWERHOUSE_PIECE_VERSION,
        "document-create",
      ),
    ).toBe("core#document-create");
  });

  it("maps core triggers with plain core# names in both directions", () => {
    const coordinates = pieceFromBlockType("core#document-created");
    expect(coordinates).toEqual({
      pieceName: POWERHOUSE_PIECE_NAME,
      pieceVersion: POWERHOUSE_PIECE_VERSION,
      kind: "trigger",
      name: "document-created",
    });
    expect(
      triggerBlockTypeFromPiece(
        POWERHOUSE_PIECE_NAME,
        POWERHOUSE_PIECE_VERSION,
        "document-created",
      ),
    ).toBe("core#document-created");
  });
});

describe("deriveFlowVersion", () => {
  it("maps an empty workflow to an EMPTY trigger", () => {
    const { version, unsupported } = deriveFlowVersion(
      baseModel({ trigger: null }),
    );
    expect(unsupported).toEqual([]);
    expect(version.trigger.type).toBe(FlowTriggerType.EMPTY);
    expect(version.displayName).toBe("My flow");
  });

  it("maps a linear chain to nested nextActions", () => {
    const model = baseModel({
      steps: [
        step("s1", "fetch", "@activepieces/piece-http@0.11.19#send_request", {
          url: "https://x",
        }),
        step("s2", "create", "core#document-create", { name: "doc" }),
      ],
      edges: [edge("e1", "t1", "s1"), edge("e2", "s1", "s2")],
    });
    const { version, unsupported } = deriveFlowVersion(model);
    expect(unsupported).toEqual([]);
    expect(version.trigger.type).toBe(FlowTriggerType.PIECE);
    const first = version.trigger.nextAction as PieceAction;
    expect(first.name).toBe("fetch");
    expect(first.type).toBe(FlowActionType.PIECE);
    expect(first.settings.pieceName).toBe("@activepieces/piece-http");
    expect(first.settings.actionName).toBe("send_request");
    expect(first.settings.input).toEqual({ url: "https://x" });
    const second = first.nextAction as PieceAction;
    expect(second.name).toBe("create");
    expect(second.settings.pieceName).toBe(POWERHOUSE_PIECE_NAME);
    expect(second.nextAction).toBeUndefined();
  });

  it("maps core#branch to a two-branch router", () => {
    const model = baseModel({
      steps: [
        step("b1", "gate", "core#branch", { condition: "{{ok}}" }),
        step("s1", "yes", "core#document-create"),
        step("s2", "no", "core#document-dispatch"),
      ],
      edges: [
        edge("e1", "t1", "b1"),
        edge("e2", "b1", "s1", "true"),
        edge("e3", "b1", "s2", "false"),
      ],
    });
    const { version, unsupported } = deriveFlowVersion(model);
    expect(unsupported).toEqual([]);
    const router = version.trigger.nextAction as RouterAction;
    expect(router.type).toBe(FlowActionType.ROUTER);
    expect(router.settings.branches).toHaveLength(2);
    const conditioned = router.settings.branches[0];
    expect(
      "conditions" in conditioned && conditioned.conditions[0][0].firstValue,
    ).toBe("{{ok}}");
    expect(router.children).toHaveLength(2);
    expect((router.children[0] as FlowAction).name).toBe("yes");
    expect((router.children[1] as FlowAction).name).toBe("no");
  });

  it("renders unknown core blocks as CODE stand-ins", () => {
    const model = baseModel({
      steps: [step("s1", "weird", "core#mystery", { a: 1 })],
      edges: [edge("e1", "t1", "s1")],
    });
    const { version, unsupported } = deriveFlowVersion(model);
    expect(unsupported).toEqual([]);
    const action = version.trigger.nextAction as FlowAction;
    expect(action.type).toBe(FlowActionType.CODE);
    expect(
      action.type === FlowActionType.CODE && action.settings.input,
    ).toEqual({ a: 1 });
  });

  it("flags unsupported topologies without crashing", () => {
    const model = baseModel({
      steps: [
        step("s1", "a", "core#document-create"),
        step("s2", "b", "core#document-dispatch"),
        step("s3", "orphan", "core#document-create"),
      ],
      edges: [
        edge("e1", "t1", "s1"),
        edge("e2", "s1", "s2"),
        edge("e3", "t1", "s2", "next2"),
        edge("e4", "s1", "s3", "error"),
      ],
    });
    const { unsupported } = deriveFlowVersion(model);
    expect(unsupported.join("\n")).toContain('"error" edges');
    expect(unsupported.join("\n")).toContain("multiple parents");
    expect(unsupported.join("\n")).toContain("orphan");
  });

  it("flags cycles", () => {
    const model = baseModel({
      steps: [
        step("s1", "a", "core#document-create"),
        step("s2", "b", "core#document-dispatch"),
      ],
      edges: [
        edge("e1", "t1", "s1"),
        edge("e2", "s1", "s2"),
        edge("e3", "s2", "s1"),
      ],
    });
    const { unsupported } = deriveFlowVersion(model);
    expect(
      unsupported.some(
        (reason) =>
          reason.includes("cycle") || reason.includes("multiple parents"),
      ),
    ).toBe(true);
  });
});

function mockBridge(model: WorkflowModel) {
  const callbacks: WorkflowEditorCallbacks = {
    setName: vi.fn(),
    setStatus: vi.fn(),
    setTrigger: vi.fn(),
    clearTrigger: vi.fn(),
    addStep: vi.fn(),
    updateStep: vi.fn(),
    removeStep: vi.fn(),
    addEdge: vi.fn(),
    removeEdge: vi.fn(),
    insertStepOnEdge: vi.fn(),
    appendStep: vi.fn(),
  };
  const bridge: ApDocumentBridge = {
    model,
    callbacks,
    setName: vi.fn(),
    replaceTrigger: vi.fn(),
  };
  return { bridge, callbacks };
}

const pieceAction = (name: string): PieceAction => ({
  name,
  displayName: "Send request",
  valid: true,
  lastUpdatedDate: "",
  type: FlowActionType.PIECE,
  settings: {
    pieceName: "@activepieces/piece-http",
    pieceVersion: "0.11.19",
    actionName: "send_request",
    input: { url: "https://x" },
    propertySettings: {},
    errorHandlingOptions: {},
  },
});

describe("translateOperation", () => {
  it("appends after the trigger when no step exists", () => {
    const { bridge, callbacks } = mockBridge(baseModel());
    const result = translateOperation(bridge, {
      type: FlowOperationType.ADD_ACTION,
      request: { parentStep: "trigger", action: pieceAction("fetch") },
    });
    expect(result).toBe("applied");
    expect(callbacks.appendStep).toHaveBeenCalledWith("t1", "next", {
      key: "fetch",
      name: "Send request",
      blockType: "@activepieces/piece-http@0.11.19#send_request",
      config: { url: "https://x" },
    });
  });

  it("inserts on the existing edge when adding between steps", () => {
    const model = baseModel({
      steps: [step("s1", "a", "core#document-create")],
      edges: [edge("e1", "t1", "s1")],
    });
    const { bridge, callbacks } = mockBridge(model);
    translateOperation(bridge, {
      type: FlowOperationType.ADD_ACTION,
      request: { parentStep: "trigger", action: pieceAction("fetch") },
    });
    expect(callbacks.insertStepOnEdge).toHaveBeenCalledWith(
      "e1",
      expect.objectContaining({ key: "fetch" }),
    );
  });

  it("adds inside a branch with the right port", () => {
    const model = baseModel({
      steps: [step("b1", "gate", "core#branch")],
      edges: [edge("e1", "t1", "b1")],
    });
    const { bridge, callbacks } = mockBridge(model);
    translateOperation(bridge, {
      type: FlowOperationType.ADD_ACTION,
      request: {
        parentStep: "gate",
        stepLocationRelativeToParent:
          StepLocationRelativeToParent.INSIDE_BRANCH,
        branchIndex: 1,
        action: pieceAction("fetch"),
      },
    });
    expect(callbacks.appendStep).toHaveBeenCalledWith(
      "b1",
      "false",
      expect.objectContaining({ key: "fetch" }),
    );
  });

  it("maps a router add to a core#branch step", () => {
    const { bridge, callbacks } = mockBridge(baseModel());
    const router: RouterAction = {
      name: "gate",
      displayName: "Router",
      valid: false,
      lastUpdatedDate: "",
      type: FlowActionType.ROUTER,
      settings: {
        executionType: "EXECUTE_FIRST_MATCH" as never,
        branches: [
          {
            branchType: "CONDITION" as never,
            branchName: "Branch 1",
            conditions: [[{ firstValue: "{{ok}}", operator: undefined }]],
          } as never,
          { branchType: "FALLBACK" as never, branchName: "Otherwise" },
        ],
      },
      children: [null, null],
    };
    translateOperation(bridge, {
      type: FlowOperationType.ADD_ACTION,
      request: { parentStep: "trigger", action: router },
    });
    expect(callbacks.appendStep).toHaveBeenCalledWith(
      "t1",
      "next",
      expect.objectContaining({
        blockType: "core#branch",
        config: { condition: "{{ok}}" },
      }),
    );
  });

  it("rejects CODE additions (no document mapping)", () => {
    const { bridge, callbacks } = mockBridge(baseModel());
    const result = translateOperation(bridge, {
      type: FlowOperationType.ADD_ACTION,
      request: {
        parentStep: "trigger",
        action: {
          name: "code",
          displayName: "Code",
          valid: true,
          type: FlowActionType.CODE,
          settings: {
            sourceCode: { code: "", packageJson: "{}" },
            input: {},
          },
        } as never,
      },
    });
    expect(result).toBe("unsupported");
    expect(callbacks.appendStep).not.toHaveBeenCalled();
  });

  it("deletes a step and re-links the chain", () => {
    const model = baseModel({
      steps: [
        step("s1", "a", "core#document-create"),
        step("s2", "b", "core#document-dispatch"),
        step("s3", "c", "core#document-create"),
      ],
      edges: [
        edge("e1", "t1", "s1"),
        edge("e2", "s1", "s2"),
        edge("e3", "s2", "s3"),
      ],
    });
    const { bridge, callbacks } = mockBridge(model);
    const result = translateOperation(bridge, {
      type: FlowOperationType.DELETE_ACTION,
      request: { names: ["b"] },
    });
    expect(result).toBe("applied");
    expect(callbacks.removeStep).toHaveBeenCalledWith("s2");
    expect(callbacks.addEdge).toHaveBeenCalledWith({
      from: "s1",
      to: "s3",
      port: "next",
      condition: undefined,
    });
  });

  it("does not re-link into steps deleted in the same batch", () => {
    const model = baseModel({
      steps: [
        step("s1", "a", "core#document-create"),
        step("s2", "b", "core#document-dispatch"),
      ],
      edges: [edge("e1", "t1", "s1"), edge("e2", "s1", "s2")],
    });
    const { bridge, callbacks } = mockBridge(model);
    translateOperation(bridge, {
      type: FlowOperationType.DELETE_ACTION,
      request: { names: ["a", "b"] },
    });
    expect(callbacks.removeStep).toHaveBeenCalledTimes(2);
    expect(callbacks.addEdge).not.toHaveBeenCalled();
  });

  it("updates a step from an UPDATE_ACTION", () => {
    const model = baseModel({
      steps: [
        step("s1", "fetch", "@activepieces/piece-http@0.11.19#send_request"),
      ],
      edges: [edge("e1", "t1", "s1")],
    });
    const { bridge, callbacks } = mockBridge(model);
    translateOperation(bridge, {
      type: FlowOperationType.UPDATE_ACTION,
      request: pieceAction("fetch"),
    });
    expect(callbacks.updateStep).toHaveBeenCalledWith({
      id: "s1",
      name: "Send request",
      blockType: "@activepieces/piece-http@0.11.19#send_request",
      config: { url: "https://x" },
    });
  });

  it("replaces the trigger through the chain-preserving bridge", () => {
    const { bridge } = mockBridge(baseModel());
    translateOperation(bridge, {
      type: FlowOperationType.UPDATE_TRIGGER,
      request: {
        name: "trigger",
        displayName: "Document event",
        valid: true,
        type: FlowTriggerType.PIECE,
        settings: {
          pieceName: POWERHOUSE_PIECE_NAME,
          pieceVersion: POWERHOUSE_PIECE_VERSION,
          triggerName: "document-event",
          input: { documentType: "powerhouse/x" },
          propertySettings: {},
        },
      },
    });
    expect(bridge.replaceTrigger).toHaveBeenCalledWith({
      blockType: "core#document-event",
      config: { documentType: "powerhouse/x" },
    });
  });

  it("renames the flow", () => {
    const { bridge } = mockBridge(baseModel());
    translateOperation(bridge, {
      type: FlowOperationType.CHANGE_NAME,
      request: { displayName: "Renamed" },
    });
    expect(bridge.setName).toHaveBeenCalledWith("Renamed");
  });

  it("ignores sample-data bookkeeping operations", () => {
    const { bridge } = mockBridge(baseModel());
    const result = translateOperation(bridge, {
      type: FlowOperationType.UPDATE_SAMPLE_DATA_INFO,
      request: { stepName: "fetch", sampleDataSettings: null },
    });
    expect(result).toBe("ignored");
  });
});

describe("flowVersionsEquivalent", () => {
  it("treats a derived version and its normalized twin as equal", () => {
    const model = baseModel({
      steps: [step("s1", "a", "core#document-create", { name: "x" })],
      edges: [edge("e1", "t1", "s1")],
    });
    const first = deriveFlowVersion(model).version;
    const second = deriveFlowVersion(model).version;
    second.id = "different";
    expect(flowVersionsEquivalent(first, second)).toBe(true);
  });

  it("detects config changes", () => {
    const model = baseModel({
      steps: [step("s1", "a", "core#document-create", { name: "x" })],
      edges: [edge("e1", "t1", "s1")],
    });
    const first = deriveFlowVersion(model).version;
    const changed = deriveFlowVersion(
      baseModel({
        steps: [step("s1", "a", "core#document-create", { name: "y" })],
        edges: [edge("e1", "t1", "s1")],
      }),
    ).version;
    expect(flowVersionsEquivalent(first, changed)).toBe(false);
  });
});
