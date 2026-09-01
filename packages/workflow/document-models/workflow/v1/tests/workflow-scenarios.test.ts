import {
  addEdge,
  addStep,
  clearTrigger,
  reducer,
  removeEdge,
  removeStep,
  removeVariable,
  setLastRun,
  setPolicy,
  setStepConfig,
  setTrigger,
  setVariable,
  setWorkflowDescription,
  setWorkflowName,
  setWorkflowStatus,
  updateStep,
  utils,
  type WorkflowDocument,
} from "document-models/workflow/v1";
import { describe, expect, it } from "vitest";

const STEP_A = "step-aaaaaaaa";
const STEP_B = "step-bbbbbbbb";
const TRIGGER = "trigger-tttttt";

function buildGraph(): WorkflowDocument {
  let document = utils.createDocument();
  document = reducer(
    document,
    setTrigger({
      id: TRIGGER,
      blockType: "core#schedule",
      config: { cron: "0 * * * *" },
    }),
  );
  document = reducer(
    document,
    addStep({
      id: STEP_A,
      key: "fetch",
      name: "Fetch",
      blockType: "@acme/connector-http#http.sendRequest",
      config: { url: "https://example.com" },
    }),
  );
  document = reducer(
    document,
    addStep({
      id: STEP_B,
      key: "notify",
      name: "Notify",
      blockType: "@acme/connector-slack#slack.postMessage",
      connectionId: "phd:connection-1",
      config: { channel: "#ops" },
      retry: {
        maxAttempts: 3,
        backoff: "EXPONENTIAL",
        initialDelaySeconds: 2,
        maxDelaySeconds: 60,
        retryOn: ["TRANSIENT"],
      },
      timeoutSeconds: 30,
      idempotencyKeyExpression: "{{trigger.id}}",
      position: { x: 100, y: 200 },
    }),
  );
  document = reducer(
    document,
    addEdge({ id: "edge-entry", from: TRIGGER, to: STEP_A, port: "next" }),
  );
  document = reducer(
    document,
    addEdge({
      id: "edge-a-b",
      from: STEP_A,
      to: STEP_B,
      port: "true",
      condition: "{{fetch.status}} == 200",
    }),
  );
  return document;
}

describe("workflow scenarios", () => {
  it("builds a full graph and bumps version per structural edit", () => {
    const document = buildGraph();
    const state = document.state.global;

    expect(state.trigger?.blockType).toBe("core#schedule");
    expect(state.trigger?.connectionId).toBeNull();
    expect(state.trigger?.filter).toBeNull();
    expect(state.steps).toHaveLength(2);
    expect(state.steps[0].retry).toBeNull();
    expect(state.steps[0].timeoutSeconds).toBeNull();
    expect(state.steps[0].position).toBeNull();
    expect(state.steps[1].retry?.backoff).toBe("EXPONENTIAL");
    expect(state.steps[1].position).toEqual({ x: 100, y: 200 });
    expect(state.edges).toHaveLength(2);
    expect(state.edges[0].condition).toBeNull();
    expect(state.edges[1].condition).toBe("{{fetch.status}} == 200");
    expect(state.version).toBe(5);
    expect(document.operations.global.every((op) => !op.error)).toBe(true);
  });

  it("handles name, description, status and lastRun without version bumps", () => {
    let document = utils.createDocument();
    document = reducer(document, setWorkflowName({ name: "Nightly sync" }));
    document = reducer(
      document,
      setWorkflowDescription({ description: "Syncs things" }),
    );
    document = reducer(document, setWorkflowStatus({ status: "ENABLED" }));
    document = reducer(
      document,
      setLastRun({
        lastRunAt: "2026-09-01T00:00:00.000Z",
        lastRunStatus: "SUCCEEDED",
      }),
    );

    const state = document.state.global;
    expect(state.name).toBe("Nightly sync");
    expect(state.description).toBe("Syncs things");
    expect(state.status).toBe("ENABLED");
    expect(state.lastRunAt).toBe("2026-09-01T00:00:00.000Z");
    expect(state.lastRunStatus).toBe("SUCCEEDED");
    expect(state.version).toBe(0);

    document = reducer(document, setWorkflowDescription({}));
    expect(document.state.global.description).toBeNull();
  });

  it("replaces and clears the trigger", () => {
    let document = buildGraph();
    document = reducer(
      document,
      setTrigger({
        id: "trigger-2",
        blockType: "@acme/connector-imap#imap.newMessage",
        connectionId: "phd:connection-2",
        config: { folder: "INBOX" },
        filter: { subjectContains: "invoice" },
      }),
    );
    let state = document.state.global;
    expect(state.trigger?.connectionId).toBe("phd:connection-2");
    expect(state.trigger?.filter).toEqual({ subjectContains: "invoice" });

    document = reducer(document, clearTrigger({}));
    state = document.state.global;
    expect(state.trigger).toBeNull();
    expect(state.version).toBe(7);
  });

  it("rejects clearing an unset trigger and keeps state unchanged", () => {
    const document = utils.createDocument();
    const updated = reducer(document, clearTrigger({}));
    expect(updated.operations.global[0].error).toBe(
      "Workflow has no trigger to clear",
    );
    expect(updated.state.global.trigger).toBeNull();
    expect(updated.state.global.version).toBe(0);
  });

  it("rejects duplicate step ids and keys", () => {
    let document = buildGraph();
    document = reducer(
      document,
      addStep({
        id: STEP_A,
        key: "other",
        name: "Other",
        blockType: "core#branch",
        config: {},
      }),
    );
    expect(document.operations.global[5].error).toBe(
      "A step with this id already exists",
    );
    document = reducer(
      document,
      addStep({
        id: "step-c",
        key: "fetch",
        name: "Other",
        blockType: "core#branch",
        config: {},
      }),
    );
    expect(document.operations.global[6].error).toBe(
      "A step with this key already exists",
    );
    expect(document.state.global.steps).toHaveLength(2);
    expect(document.state.global.version).toBe(5);
  });

  it("updates every step field and honors partial updates", () => {
    let document = buildGraph();
    document = reducer(
      document,
      updateStep({
        id: STEP_A,
        key: "fetch2",
        name: "Fetch v2",
        blockType: "@acme/connector-http#http.sendRequestV2",
        connectionId: "phd:connection-3",
        config: { url: "https://example.org" },
        retry: {
          maxAttempts: 2,
          backoff: "FIXED",
          initialDelaySeconds: 1,
          maxDelaySeconds: 10,
          retryOn: [],
        },
        timeoutSeconds: 15,
        idempotencyKeyExpression: "{{trigger.dedupe}}",
        position: { x: 1, y: 2 },
      }),
    );
    const full = document.state.global.steps[0];
    expect(full.key).toBe("fetch2");
    expect(full.name).toBe("Fetch v2");
    expect(full.connectionId).toBe("phd:connection-3");
    expect(full.config).toEqual({ url: "https://example.org" });
    expect(full.retry?.maxAttempts).toBe(2);
    expect(full.timeoutSeconds).toBe(15);
    expect(full.idempotencyKeyExpression).toBe("{{trigger.dedupe}}");
    expect(full.position).toEqual({ x: 1, y: 2 });

    document = reducer(document, updateStep({ id: STEP_A }));
    expect(document.state.global.steps[0].key).toBe("fetch2");
    expect(document.state.global.version).toBe(7);

    document = reducer(document, updateStep({ id: STEP_A, key: "fetch2" }));
    expect(document.operations.global[7].error).toBeUndefined();
  });

  it("rejects updates to missing steps and conflicting keys", () => {
    let document = buildGraph();
    document = reducer(document, updateStep({ id: "step-x", name: "Nope" }));
    expect(document.operations.global[5].error).toBe("Step not found");

    document = reducer(document, updateStep({ id: STEP_A, key: "notify" }));
    expect(document.operations.global[6].error).toBe(
      "Another step already uses this key",
    );
    expect(document.state.global.steps[0].key).toBe("fetch");
  });

  it("removes a step and prunes its edges", () => {
    let document = buildGraph();
    document = reducer(document, removeStep({ id: STEP_A }));
    const state = document.state.global;
    expect(state.steps.map((step) => step.id)).toEqual([STEP_B]);
    expect(state.edges).toHaveLength(0);
    expect(state.version).toBe(6);

    document = reducer(document, removeStep({ id: STEP_A }));
    expect(document.operations.global[6].error).toBe("Step not found");
  });

  it("sets step config and rejects unknown steps", () => {
    let document = buildGraph();
    document = reducer(
      document,
      setStepConfig({ id: STEP_A, config: { url: "https://new.example" } }),
    );
    expect(document.state.global.steps[0].config).toEqual({
      url: "https://new.example",
    });
    expect(document.state.global.version).toBe(6);

    document = reducer(document, setStepConfig({ id: "step-x", config: {} }));
    expect(document.operations.global[6].error).toBe("Step not found");
  });

  it("validates edge endpoints and ids", () => {
    let document = buildGraph();
    document = reducer(
      document,
      addEdge({ id: "edge-entry", from: STEP_A, to: STEP_B, port: "next" }),
    );
    expect(document.operations.global[5].error).toBe(
      "An edge with this id already exists",
    );
    document = reducer(
      document,
      addEdge({ id: "edge-x", from: "step-x", to: STEP_B, port: "next" }),
    );
    expect(document.operations.global[6].error).toBe(
      "Edge source step or trigger not found",
    );
    document = reducer(
      document,
      addEdge({ id: "edge-y", from: STEP_A, to: "step-x", port: "next" }),
    );
    expect(document.operations.global[7].error).toBe(
      "Edge target step not found",
    );
    expect(document.state.global.edges).toHaveLength(2);
  });

  it("removes edges and rejects unknown edge ids", () => {
    let document = buildGraph();
    document = reducer(document, removeEdge({ id: "edge-a-b" }));
    expect(document.state.global.edges.map((edge) => edge.id)).toEqual([
      "edge-entry",
    ]);
    expect(document.state.global.version).toBe(6);

    document = reducer(document, removeEdge({ id: "edge-a-b" }));
    expect(document.operations.global[6].error).toBe("Edge not found");
  });

  it("upserts variables by key and removes them by id", () => {
    let document = utils.createDocument();
    document = reducer(
      document,
      setVariable({
        id: "var-1",
        key: "region",
        value: "eu-west-1",
        description: "Deployment region",
      }),
    );
    document = reducer(document, setVariable({ id: "var-2", key: "dryRun" }));
    let state = document.state.global;
    expect(state.variables).toHaveLength(2);
    expect(state.variables[1].value).toBeNull();
    expect(state.variables[1].description).toBeNull();

    document = reducer(
      document,
      setVariable({ id: "var-3", key: "region", value: "us-east-1" }),
    );
    state = document.state.global;
    expect(state.variables).toHaveLength(2);
    expect(state.variables[0].id).toBe("var-1");
    expect(state.variables[0].value).toBe("us-east-1");
    expect(state.variables[0].description).toBe("Deployment region");

    document = reducer(
      document,
      setVariable({ id: "var-4", key: "region", description: "Primary" }),
    );
    expect(document.state.global.variables[0].description).toBe("Primary");

    document = reducer(document, removeVariable({ id: "var-1" }));
    expect(document.state.global.variables.map((v) => v.key)).toEqual([
      "dryRun",
    ]);
    expect(document.state.global.version).toBe(5);

    document = reducer(document, removeVariable({ id: "var-1" }));
    expect(document.operations.global[5].error).toBe("Variable not found");
  });

  it("updates policy fields individually and together", () => {
    let document = utils.createDocument();
    document = reducer(
      document,
      setPolicy({
        concurrency: "PARALLEL",
        maxParallelRuns: 4,
        runTimeoutSeconds: 600,
        maxSuspensionDays: 7,
        defaultRetry: {
          maxAttempts: 5,
          backoff: "EXPONENTIAL",
          initialDelaySeconds: 1,
          maxDelaySeconds: 120,
          retryOn: ["TRANSIENT", "RATE_LIMIT"],
        },
        onFailure: "NOTIFY",
        retainRunsDays: 90,
        journalAsDocument: true,
      }),
    );
    let policy = document.state.global.policy;
    expect(policy.concurrency).toBe("PARALLEL");
    expect(policy.maxParallelRuns).toBe(4);
    expect(policy.runTimeoutSeconds).toBe(600);
    expect(policy.maxSuspensionDays).toBe(7);
    expect(policy.defaultRetry.retryOn).toEqual(["TRANSIENT", "RATE_LIMIT"]);
    expect(policy.onFailure).toBe("NOTIFY");
    expect(policy.retainRunsDays).toBe(90);
    expect(policy.journalAsDocument).toBe(true);
    expect(document.state.global.version).toBe(1);

    document = reducer(document, setPolicy({ journalAsDocument: false }));
    policy = document.state.global.policy;
    expect(policy.journalAsDocument).toBe(false);
    expect(policy.concurrency).toBe("PARALLEL");
    expect(document.state.global.version).toBe(2);

    document = reducer(document, setPolicy({ retainRunsDays: null }));
    expect(document.state.global.policy.retainRunsDays).toBe(90);
  });
});
