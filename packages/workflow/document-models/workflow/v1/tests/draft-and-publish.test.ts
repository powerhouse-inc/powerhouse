import {
  addEdge,
  addStep,
  clearTrigger,
  publishWorkflow,
  reducer,
  revertToPublished,
  setLastRun,
  setLastTest,
  setPolicy,
  setStepConfig,
  setTrigger,
  setVariable,
  updateStep,
  utils,
  type WorkflowDocument,
  type WorkflowGlobalState,
} from "document-models/workflow/v1";
import { describe, expect, it } from "vitest";

const TRIGGER = "trigger-tttttt";
const STEP_A = "step-aaaaaaaa";
const STEP_B = "step-bbbbbbbb";
const PUBLISHED_AT = "2026-09-28T10:00:00.000Z";

function buildGraph(): WorkflowDocument {
  let document = utils.createDocument();
  document = reducer(
    document,
    setTrigger({
      id: TRIGGER,
      pieceName: "@powerhousedao/piece-core",
      pieceVersion: "1.0.0",
      triggerName: "schedule",
      config: {},
    }),
  );
  document = reducer(
    document,
    addStep({
      id: STEP_A,
      key: "fetch",
      name: "Fetch",
      pieceName: "@acme/http",
      pieceVersion: "1.2.0",
      actionName: "http.sendRequest",
      config: { url: "https://example.com" },
    }),
  );
  document = reducer(
    document,
    addStep({
      id: STEP_B,
      key: "notify",
      name: "Notify",
      pieceName: "@acme/slack",
      pieceVersion: "1.0.0",
      actionName: "slack.postMessage",
      config: {},
    }),
  );
  document = reducer(
    document,
    addEdge({ id: "edge-entry", from: TRIGGER, to: STEP_A, port: "next" }),
  );
  return reducer(
    document,
    addEdge({ id: "edge-a-b", from: STEP_A, to: STEP_B, port: "next" }),
  );
}

function lastError(document: WorkflowDocument) {
  return document.operations.global.at(-1)?.error;
}

describe("skip", () => {
  it("accepts skip on ADD_STEP", () => {
    let document = buildGraph();
    document = reducer(
      document,
      addStep({
        id: "step-c",
        key: "later",
        name: "Later",
        pieceName: "@powerhousedao/piece-core",
        pieceVersion: "1.0.0",
        actionName: "delay",
        config: {},
        skip: true,
      }),
    );
    expect(document.state.global.steps[2].skip).toBe(true);
  });
});

describe("property settings", () => {
  const settings = [
    { prop: "url", mode: "EXPRESSION" as const },
    { prop: "body", mode: "MANUAL" as const, schema: { type: "object" } },
  ];

  it("are written through ADD_STEP", () => {
    const document = reducer(
      buildGraph(),
      addStep({
        id: "step-c",
        key: "copy",
        name: "Copy",
        pieceName: "@acme/http",
        pieceVersion: "1.2.0",
        actionName: "http.sendRequest",
        config: {},
        propertySettings: settings,
      }),
    );
    expect(document.state.global.steps[2].propertySettings).toEqual([
      { prop: "url", mode: "EXPRESSION", schema: null },
      { prop: "body", mode: "MANUAL", schema: { type: "object" } },
    ]);
  });

  it("are written through SET_STEP_CONFIG and kept when omitted", () => {
    let document = buildGraph();
    document = reducer(
      document,
      setStepConfig({ id: STEP_A, config: {}, propertySettings: settings }),
    );
    document = reducer(
      document,
      setStepConfig({ id: STEP_A, config: { a: 1 } }),
    );
    expect(document.state.global.steps[0].propertySettings).toHaveLength(2);

    document = reducer(
      document,
      setStepConfig({ id: STEP_A, config: {}, propertySettings: null }),
    );
    expect(document.state.global.steps[0].propertySettings).toBeNull();
  });

  it("carry over on SET_TRIGGER for the same binding only", () => {
    let document = buildGraph();
    document = reducer(
      document,
      setTrigger({
        id: TRIGGER,
        pieceName: "@powerhousedao/piece-core",
        pieceVersion: "1.0.0",
        triggerName: "schedule",
        config: {},
        propertySettings: settings,
      }),
    );
    document = reducer(
      document,
      setLastTest({ id: TRIGGER, runId: "run-1", testedAt: PUBLISHED_AT }),
    );
    document = reducer(
      document,
      setTrigger({
        id: TRIGGER,
        pieceName: "@powerhousedao/piece-core",
        pieceVersion: "1.0.0",
        triggerName: "schedule",
        config: { a: 1 },
      }),
    );
    expect(document.state.global.trigger?.propertySettings).toHaveLength(2);
    expect(document.state.global.trigger?.lastTest?.runId).toBe("run-1");

    document = reducer(
      document,
      setTrigger({
        id: TRIGGER,
        pieceName: "@powerhousedao/piece-core",
        pieceVersion: "1.0.0",
        triggerName: "webhook",
        config: {},
      }),
    );
    expect(document.state.global.trigger?.propertySettings).toBeNull();
    expect(document.state.global.trigger?.lastTest).toBeNull();
  });
});

describe("last test", () => {
  it("records the latest test on a step and the trigger without a version bump", () => {
    let document = buildGraph();
    const version = document.state.global.version;
    document = reducer(
      document,
      setLastTest({ id: STEP_B, runId: "run-1", testedAt: PUBLISHED_AT }),
    );
    document = reducer(
      document,
      setLastTest({ id: STEP_B, runId: "run-2", testedAt: PUBLISHED_AT }),
    );
    document = reducer(
      document,
      setLastTest({ id: TRIGGER, runId: "run-3", testedAt: PUBLISHED_AT }),
    );
    const state = document.state.global;
    expect(state.steps[1].lastTest).toEqual({
      runId: "run-2",
      testedAt: PUBLISHED_AT,
    });
    expect(state.trigger?.lastTest?.runId).toBe("run-3");
    expect(state.version).toBe(version);
  });

  it("rejects unknown ids", () => {
    const document = reducer(
      buildGraph(),
      setLastTest({ id: "nope", runId: "run-1", testedAt: PUBLISHED_AT }),
    );
    expect(lastError(document)).toBe("Step or trigger not found");
  });
});

describe("version", () => {
  it("bumps on every draft edit", () => {
    let document = buildGraph();
    const edits = [
      setStepConfig({ id: STEP_A, config: { url: "https://x.io" } }),
      setTrigger({
        id: TRIGGER,
        pieceName: "@powerhousedao/piece-core",
        pieceVersion: "1.0.0",
        triggerName: "schedule",
        config: { a: 1 },
      }),
      setVariable({ id: "var-1", key: "limit", value: 10 }),
      setPolicy({ retainRunsDays: 7 }),
      updateStep({ id: STEP_B, skip: true }),
    ];
    for (const edit of edits) {
      const before = document.state.global.version;
      document = reducer(document, edit);
      expect(lastError(document)).toBeUndefined();
      expect(document.state.global.version).toBe(before + 1);
    }
  });

  it("does not bump on test or run records", () => {
    let document = buildGraph();
    const version = document.state.global.version;
    document = reducer(
      document,
      setLastTest({ id: STEP_A, runId: "run-1", testedAt: PUBLISHED_AT }),
    );
    document = reducer(
      document,
      setLastRun({ lastRunAt: PUBLISHED_AT, lastRunStatus: "SUCCEEDED" }),
    );
    expect(document.state.global.version).toBe(version);
  });
});

describe("publishing", () => {
  it("snapshots the draft at the current version", () => {
    let document = buildGraph();
    document = reducer(document, setVariable({ id: "v1", key: "k", value: 1 }));
    document = reducer(
      document,
      publishWorkflow({ publishedAt: PUBLISHED_AT }),
    );
    const state = document.state.global;
    expect(lastError(document)).toBeUndefined();
    expect(state.published).toEqual({
      version: state.version,
      publishedAt: PUBLISHED_AT,
      trigger: state.trigger,
      steps: state.steps,
      edges: state.edges,
      variables: state.variables,
      policy: state.policy,
    });

    document = reducer(document, setStepConfig({ id: STEP_A, config: {} }));
    const next = document.state.global;
    expect(next.version).not.toBe(next.published?.version);
    expect(next.published?.steps[0].config).toEqual({
      url: "https://example.com",
    });
  });

  it("publishes whatever the draft holds; the editor gates Publish", () => {
    let document = reducer(
      utils.createDocument(),
      publishWorkflow({ publishedAt: PUBLISHED_AT }),
    );
    expect(lastError(document)).toBeUndefined();
    expect(document.state.global.published?.trigger).toBeNull();

    document = reducer(buildGraph(), updateStep({ id: STEP_B, skip: true }));
    document = reducer(
      document,
      publishWorkflow({ publishedAt: PUBLISHED_AT }),
    );
    expect(lastError(document)).toBeUndefined();
    expect(document.state.global.published?.steps[1].skip).toBe(true);
  });

  it("reverts the draft to the published snapshot", () => {
    let document = buildGraph();
    document = reducer(
      document,
      publishWorkflow({ publishedAt: PUBLISHED_AT }),
    );
    const published = document.state.global.published!;

    document = reducer(document, setStepConfig({ id: STEP_A, config: {} }));
    document = reducer(document, clearTrigger({}));
    document = reducer(document, setPolicy({ retainRunsDays: 1 }));

    document = reducer(document, revertToPublished({}));
    const state = document.state.global;
    expect(lastError(document)).toBeUndefined();
    expect(state.trigger).toEqual(published.trigger);
    expect(state.steps).toEqual(published.steps);
    expect(state.edges).toEqual(published.edges);
    expect(state.variables).toEqual(published.variables);
    expect(state.policy).toEqual(published.policy);
    expect(state.version).toBe(published.version);
  });

  it("rejects reverting when nothing is published", () => {
    const document = reducer(buildGraph(), revertToPublished({}));
    expect(lastError(document)).toBe("Workflow has never been published");
  });
});

describe("variable type", () => {
  it("stores the type, keeps it when omitted and clears it with null", () => {
    let document = utils.createDocument();
    document = reducer(
      document,
      setVariable({ id: "v1", key: "limit", value: 10, type: "NUMBER" }),
    );
    expect(document.state.global.variables[0].type).toBe("NUMBER");

    document = reducer(
      document,
      setVariable({ id: "v1", key: "limit", value: 5 }),
    );
    expect(document.state.global.variables[0].type).toBe("NUMBER");

    document = reducer(
      document,
      setVariable({ id: "v1", key: "limit", value: 5, type: null }),
    );
    expect(document.state.global.variables[0].type).toBeNull();
  });

  it("bumps version when only the type changes", () => {
    let document = reducer(
      utils.createDocument(),
      setVariable({ id: "v1", key: "k", value: "x" }),
    );
    const version = document.state.global.version;
    document = reducer(
      document,
      setVariable({ id: "v1", key: "k", value: "x", type: "TEXT" }),
    );
    expect(document.state.global.version).toBe(version + 1);
  });

  it("accepts a secret reference string or null for SECRET", () => {
    let document = utils.createDocument();
    document = reducer(
      document,
      setVariable({
        id: "v1",
        key: "token",
        value: "secret:abc",
        type: "SECRET",
      }),
    );
    document = reducer(
      document,
      setVariable({ id: "v2", key: "unset", type: "SECRET" }),
    );
    expect(document.operations.global.every((op) => !op.error)).toBe(true);
    expect(document.state.global.variables.map((v) => v.value)).toEqual([
      "secret:abc",
      null,
    ]);
  });

  it("rejects a non-string SECRET value, including on an existing SECRET", () => {
    let document = utils.createDocument();
    document = reducer(
      document,
      setVariable({
        id: "v1",
        key: "token",
        value: { raw: 1 },
        type: "SECRET",
      }),
    );
    expect(lastError(document)).toBe(
      "A SECRET variable's value must be a secret reference string",
    );
    expect(document.state.global.variables).toHaveLength(0);

    document = reducer(
      document,
      setVariable({ id: "v1", key: "token", value: "ref", type: "SECRET" }),
    );
    document = reducer(
      document,
      setVariable({ id: "v1", key: "token", value: 42 }),
    );
    expect(lastError(document)).toBe(
      "A SECRET variable's value must be a secret reference string",
    );
    expect(document.state.global.variables[0].value).toBe("ref");
  });

  it("is part of the published snapshot", () => {
    let document = buildGraph();
    document = reducer(
      document,
      setVariable({ id: "v1", key: "token", value: "ref", type: "SECRET" }),
    );
    document = reducer(
      document,
      publishWorkflow({ publishedAt: PUBLISHED_AT }),
    );
    expect(document.state.global.published?.variables[0].type).toBe("SECRET");
  });
});

describe("documents saved before these fields existed", () => {
  function legacyDocument(): WorkflowDocument {
    const document = utils.createDocument();
    const legacy = {
      name: "Old",
      description: null,
      status: "ENABLED",
      version: 4,
      trigger: {
        id: TRIGGER,
        pieceName: "@powerhousedao/piece-core",
        pieceVersion: "1.0.0",
        triggerName: "schedule",
        connectionId: null,
        config: {},
      },
      steps: [
        {
          id: STEP_A,
          key: "fetch",
          name: "Fetch",
          pieceName: "@acme/http",
          pieceVersion: "1.0.0",
          actionName: "http.sendRequest",
          connectionId: null,
          config: {},
          retry: null,
          timeoutSeconds: null,
          idempotencyKeyExpression: null,
          position: null,
        },
      ],
      edges: [],
      variables: [{ id: "v1", key: "k", value: 1, description: null }],
      policy: document.state.global.policy,
      lastRunAt: null,
      lastRunStatus: null,
    };
    document.state.global = legacy as unknown as WorkflowGlobalState;
    return document;
  }

  it("apply new operations and publish", () => {
    let document = legacyDocument();
    document = reducer(
      document,
      setStepConfig({
        id: STEP_A,
        config: {},
        propertySettings: [{ prop: "url", mode: "EXPRESSION" }],
      }),
    );
    document = reducer(
      document,
      setLastTest({ id: STEP_A, runId: "run-1", testedAt: PUBLISHED_AT }),
    );
    document = reducer(
      document,
      publishWorkflow({ publishedAt: PUBLISHED_AT }),
    );
    expect(document.operations.global.every((op) => !op.error)).toBe(true);
    const state = document.state.global;
    expect(state.published?.version).toBe(5);
    expect(state.published?.variables[0].type).toBeUndefined();
  });

  it("apply existing edits", () => {
    let document = legacyDocument();
    document = reducer(document, updateStep({ id: STEP_A, name: "Get" }));
    document = reducer(document, setVariable({ id: "v1", key: "k", value: 2 }));
    expect(document.operations.global.every((op) => !op.error)).toBe(true);
    expect(document.state.global.version).toBe(6);
    expect(document.state.global.variables[0].type).toBeNull();
  });

  it("reject revert when nothing is published", () => {
    const document = reducer(legacyDocument(), revertToPublished({}));
    expect(lastError(document)).toBe("Workflow has never been published");
  });
});
