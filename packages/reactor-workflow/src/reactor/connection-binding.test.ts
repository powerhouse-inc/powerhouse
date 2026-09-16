// Server-side connection binding: a step resolves only what the definition
// its run pinned declared, and only from its own connector (doc 08 §10).
import type { WorkflowRuntimeHost } from "./host.js";
import {
  ConnectionNotBoundError,
  declaredConnectionIds,
  InMemorySecretProvider,
} from "../pieces/index.js";
import type { ConnectionDocument } from "@powerhousedao/workflow/document-models/connection";
import type { WorkflowState } from "@powerhousedao/workflow/document-models/workflow";
import { describe, expect, it, vi } from "vitest";
import {
  boundConnections,
  ConnectorMismatchError,
  DocumentConnectionResolver,
  toWorkflowDefinition,
} from "./lib.js";
import { withRunScope } from "./run-scope.js";

const SLACK_PACKAGE = "@activepieces/piece-slack";
const IMAP_PACKAGE = "@activepieces/piece-imap";
const SLACK_STEP = `${SLACK_PACKAGE}@0.9.0#send_message`;
const IMAP_TRIGGER = `${IMAP_PACKAGE}@0.6.0#trigger:new_email`;

const asSlack = { blockType: SLACK_STEP, piecePackage: SLACK_PACKAGE };
const asImap = { blockType: IMAP_TRIGGER, piecePackage: IMAP_PACKAGE };

function connectionDocument(
  id: string,
  connectorId: string,
): ConnectionDocument {
  return {
    header: { documentType: "powerhouse/connection" },
    state: {
      global: {
        name: id,
        connectorId,
        authType: "SECRET_TEXT",
        config: {},
        secretRefs: [{ name: "token", ref: "vault://token" }],
        status: "OK",
      },
    },
  } as unknown as ConnectionDocument;
}

const CONNECTIONS: Record<string, ConnectionDocument> = {
  "conn-slack": connectionDocument("conn-slack", `${SLACK_PACKAGE}#slack`),
  "conn-imap": connectionDocument("conn-imap", `${IMAP_PACKAGE}#imap`),
  "conn-foreign": connectionDocument(
    "conn-foreign",
    "@activepieces/piece-stripe#stripe",
  ),
  "conn-blank": connectionDocument("conn-blank", ""),
};

function fakeSubgraph() {
  const get = vi.fn((documentId: string) => {
    const document = CONNECTIONS[documentId] as ConnectionDocument | undefined;
    if (!document) return Promise.reject(new Error("not found"));
    return Promise.resolve(document);
  });
  return { get, subgraph: { reactorClient: { get } } as unknown as WorkflowRuntimeHost };
}

const secrets = new InMemorySecretProvider({ "vault://token": "s3cret" });

// A fresh state each time, so a test that edits one cannot reach another.
function workflowState(
  steps: { id: string; key: string; connectionId: string }[] = [
    { id: "s1", key: "notify", connectionId: "conn-slack" },
  ],
): WorkflowState {
  return {
    name: "wf",
    trigger: {
      id: "t",
      blockType: IMAP_TRIGGER,
      connectionId: "conn-imap",
      config: {},
      filter: null,
    },
    steps: steps.map((step) => ({
      ...step,
      name: step.key,
      blockType: SLACK_STEP,
      config: {},
      timeoutSeconds: null,
    })),
    edges: [],
    variables: [],
  } as unknown as WorkflowState;
}

const bindingFor = (state: WorkflowState) =>
  declaredConnectionIds(toWorkflowDefinition(state));

function resolverOver(subgraph: WorkflowRuntimeHost) {
  return boundConnections(new DocumentConnectionResolver(subgraph, secrets));
}

describe("run-scoped connection binding", () => {
  const bound = bindingFor(workflowState());

  it("resolves a connection the definition declares", async () => {
    const { subgraph } = fakeSubgraph();
    const resolver = resolverOver(subgraph);

    const auth = await withRunScope(
      { workflowId: "wf-1", connections: bound },
      () => resolver.resolve("conn-slack", asSlack),
    );
    expect(auth).toEqual({ type: "SECRET_TEXT", secret_text: "s3cret" });
  });

  it("still resolves the trigger's own connection", async () => {
    const { subgraph } = fakeSubgraph();
    const resolver = resolverOver(subgraph);

    await expect(
      withRunScope({ workflowId: "wf-1", connections: bound }, () =>
        resolver.resolve("conn-imap", asImap),
      ),
    ).resolves.toEqual({ type: "SECRET_TEXT", secret_text: "s3cret" });
  });

  it("refuses an undeclared connection without looking it up", async () => {
    const { get, subgraph } = fakeSubgraph();
    const resolver = resolverOver(subgraph);

    await expect(
      withRunScope({ workflowId: "wf-1", connections: bound }, () =>
        resolver.resolve("conn-foreign", asSlack),
      ),
    ).rejects.toBeInstanceOf(ConnectionNotBoundError);
    // Never fetched, so the refusal cannot tell a piece whether the id exists.
    expect(get).not.toHaveBeenCalled();
  });

  it("refuses an id that does not exist the same way as one that does", async () => {
    const { subgraph } = fakeSubgraph();
    const resolver = resolverOver(subgraph);

    const refusal = (connectionId: string) =>
      withRunScope({ workflowId: "wf-1", connections: bound }, () =>
        resolver.resolve(connectionId, asSlack),
      ).catch((error: Error) =>
        `${error.name}: ${error.message}`.replaceAll(connectionId, "<id>"),
      );

    // Same name, same wording: only the id the step itself supplied differs,
    // so the refusal carries no information about what exists.
    expect(await refusal("conn-foreign")).toBe(
      await refusal("conn-does-not-exist"),
    );
  });

  it("refuses a connectionId written as an expression", async () => {
    const { subgraph } = fakeSubgraph();
    const resolver = resolverOver(subgraph);

    await expect(
      withRunScope({ workflowId: "wf-1", connections: bound }, () =>
        resolver.resolve("{{trigger.payload.connectionId}}", asSlack),
      ),
    ).rejects.toBeInstanceOf(ConnectionNotBoundError);
  });

  it("keeps the set the run pinned when the workflow is edited mid-run", async () => {
    const { subgraph } = fakeSubgraph();
    const resolver = resolverOver(subgraph);
    const state = workflowState();

    const outcome = await withRunScope(
      { workflowId: "wf-1", connections: bindingFor(state) },
      async () => {
        // The edit lands while the run is in flight, and declares a connection
        // the run did not start with.
        state.steps.push({
          ...state.steps[0],
          id: "s2",
          key: "leak",
          connectionId: "conn-foreign",
        });
        expect(bindingFor(state).has("conn-foreign")).toBe(true);
        return resolver.resolve("conn-foreign", asSlack).catch((e: Error) => e);
      },
    );

    expect(outcome).toBeInstanceOf(ConnectionNotBoundError);
  });

  it("resolves nothing outside a run", async () => {
    const { subgraph } = fakeSubgraph();
    const resolver = resolverOver(subgraph);

    await expect(resolver.resolve("conn-slack", asSlack)).rejects.toBeInstanceOf(
      ConnectionNotBoundError,
    );
  });

  // What the block executor asks for. Without it, it falls back to guessing
  // which values to keep out of the journal.
  it("resolves the concrete secrets through the binding", async () => {
    const { subgraph } = fakeSubgraph();
    const resolver = resolverOver(subgraph);

    const resolved = await withRunScope(
      { workflowId: "wf-1", connections: bound },
      () => resolver.resolveWithSecrets!("conn-slack", asSlack),
    );

    expect(resolved.auth).toEqual({ type: "SECRET_TEXT", secret_text: "s3cret" });
    expect(resolved.secretValues).toContain("s3cret");
  });

  it("refuses an undeclared connection on the secret-bearing path too", async () => {
    const { get, subgraph } = fakeSubgraph();
    const resolver = resolverOver(subgraph);

    await expect(
      withRunScope({ workflowId: "wf-1", connections: bound }, () =>
        resolver.resolveWithSecrets!("conn-someone-elses", asSlack),
      ),
    ).rejects.toBeInstanceOf(ConnectionNotBoundError);
    expect(get).not.toHaveBeenCalled();
  });
});

describe("connector binding", () => {
  it("refuses a connection belonging to another connector", async () => {
    const { subgraph } = fakeSubgraph();
    const resolver = new DocumentConnectionResolver(subgraph, secrets);

    await expect(
      resolver.resolve("conn-imap", asSlack),
    ).rejects.toBeInstanceOf(ConnectorMismatchError);
  });

  it("ignores the version a blockType pins", async () => {
    const { subgraph } = fakeSubgraph();
    const resolver = new DocumentConnectionResolver(subgraph, secrets);

    await expect(
      resolver.resolve("conn-slack", {
        blockType: `${SLACK_PACKAGE}@9.9.9#send_message`,
        piecePackage: SLACK_PACKAGE,
      }),
    ).resolves.toBeDefined();
  });

  it("refuses when nothing identifies the asking block", async () => {
    const { subgraph } = fakeSubgraph();
    const resolver = new DocumentConnectionResolver(subgraph, secrets);

    // Absent information refuses: a caller that names no piece has not shown
    // the connection is its to use.
    await expect(resolver.resolve("conn-slack")).rejects.toBeInstanceOf(
      ConnectorMismatchError,
    );
  });

  it("refuses a connection whose connectorId is blank", async () => {
    const { subgraph } = fakeSubgraph();
    const resolver = new DocumentConnectionResolver(subgraph, secrets);

    // A connection document's initial state, which would otherwise match
    // every piece rather than none.
    await expect(
      resolver.resolve("conn-blank", asSlack),
    ).rejects.toBeInstanceOf(ConnectorMismatchError);
  });

  it("answers a foreign connection as it answers a wrong-typed document", async () => {
    const { subgraph } = fakeSubgraph();
    const resolver = new DocumentConnectionResolver(subgraph, secrets);
    const message = (error: unknown) => (error as Error).message;

    const foreign = await resolver.resolve("conn-imap", asSlack).catch(message);
    const blank = await resolver.resolve("conn-blank", asSlack).catch(message);

    expect(foreign).toBe(blank);
  });
});
