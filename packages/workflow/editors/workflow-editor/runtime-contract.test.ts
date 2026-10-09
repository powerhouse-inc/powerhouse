// Every query the runtime client (and so every AI tool) sends must be one the
// workflow-runtime subgraph accepts, variables included.
import { describe, expect, it } from "vitest";
import { requestErrors, schemaFetch } from "../../test/runtime-schema.js";
import {
  createRuntimeClient,
  type RuntimeClient,
  type Transport,
} from "./runtime-client.js";

type Operation = Exclude<keyof RuntimeClient, keyof Transport>;

const BLOCK = {
  pieceName: "@acme/piece-x",
  pieceVersion: "1.0.0",
  name: "send",
  kind: "action",
} as const;

// Typed per operation, so a new client call fails to compile until listed.
const CALLS: { [K in Operation]: Parameters<RuntimeClient[K]> } = {
  getBlockForm: [BLOCK],
  fetchPieceCatalog: [],
  fetchPieceActions: ["@acme/piece-x"],
  fetchPieceTriggers: ["@acme/piece-x"],
  searchPieces: [
    "send",
    { kind: "action", sources: ["registry"], categories: ["AI"], limit: 5 },
  ],
  fetchBlockOutputTree: [BLOCK, { a: 1 }],
  fetchStepOutputTree: ["wf-1", "s1"],
  fetchConnections: [],
  checkConnection: ["conn-1"],
  fetchOAuthRedirectUri: [],
  startOAuth: [
    "conn-1",
    { redirectUri: "http://a/cb", returnUrl: "http://a/back" },
  ],
  fetchOAuthAttempt: ["state-1"],
  createSecret: ["value", "label"],
  rotateSecret: ["secret://v1:abc", "value"],
  fetchSecretStat: ["secret://v1:abc"],
  fetchWebhookEndpoint: ["wf-1", "drive-1"],
  testTrigger: ["wf-1", "drive-1"],
  testCoreTrigger: [
    "wf-1",
    { payload: { a: 1 }, timeoutSeconds: 5, driveId: "drive-1" },
  ],
  cancelTriggerTest: ["wf-1"],
  testStep: ["wf-1", "s1", "drive-1"],
  blockResolutions: ["wf-1"],
  fetchRuns: [{ driveId: "drive-1", limit: 5, excludeTriggerKinds: ["test"] }],
  fetchRunsPage: [{ workflowId: "wf-1" }, "cursor-1"],
  fetchRun: ["run-1"],
  fireWorkflow: ["wf-1", { a: 1 }],
  rerunRun: ["run-1"],
  loadBlockOptions: [BLOCK, "channel", { a: 1 }, "conn-1", "gen"],
  fetchReactorAccess: [],
  fetchReactorAccessDenial: ["wf-1"],
};

describe("the runtime client against the workflow-runtime schema", () => {
  it.each(Object.keys(CALLS) as Operation[])(
    "%s sends a query the subgraph accepts",
    async (operation) => {
      const server = schemaFetch();
      const client = createRuntimeClient("http://a/rt", {
        fetch: server.fetch,
        token: () => Promise.resolve(null),
      });

      const call = client[operation] as (...args: unknown[]) => unknown;
      // Unanswered fields resolve to null; only the request is under test.
      await Promise.resolve(call(...CALLS[operation])).catch(() => undefined);

      expect(server.sent.length, operation).toBeGreaterThan(0);
      for (const { query, variables } of server.sent) {
        expect(await requestErrors(query, variables)).toEqual([]);
      }
    },
  );

  it("refuses a query the subgraph does not serve", async () => {
    expect(
      await requestErrors(`query { workflowRuntime { noSuchField } }`),
    ).not.toEqual([]);
    expect(
      await requestErrors(
        `mutation C($id: String!) { workflowRuntime { checkConnection(connectionId: $id) } }`,
        { id: "c" },
      ),
    ).not.toEqual([]);
  });
});
