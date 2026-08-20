import type { IReactorClient, JobInfo } from "@powerhousedao/reactor";
import type { Action, PHDocument } from "@powerhousedao/shared/document-model";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { GraphQLObjectType } from "graphql";
import { buildSchema, parse, validate } from "graphql";
import { describe, expect, it, vi } from "vitest";
import { execute, executeAsync } from "../src/graphql/reactor/resolvers.js";
import type { ActionInput } from "../src/graphql/reactor/gen/graphql.js";

const SDL = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../src/graphql/reactor/schema.graphql",
  ),
  "utf8",
);

const action: ActionInput = {
  id: "act-1",
  type: "SET_NAME",
  timestampUtcMs: "2026-01-01T00:00:00.000Z",
  input: { name: "x" },
  scope: "global",
};

const document = {
  header: {
    id: "doc-1",
    name: "doc",
    documentType: "powerhouse/document-model",
    slug: "",
    revision: { global: 1 },
    createdAtUtcIso: "2026-01-01T00:00:00.000Z",
    lastModifiedAtUtcIso: "2026-01-01T00:00:00.000Z",
  },
  state: { global: {} },
} as unknown as PHDocument;

const job: JobInfo = {
  id: "job-1",
  status: "PENDING",
  createdAtUtcIso: "2026-01-01T00:00:00.000Z",
} as unknown as JobInfo;

/** Captures what the client was asked to do. */
function recordingClient() {
  const executeSpy = vi.fn().mockResolvedValue(document);
  const executeAsyncSpy = vi.fn().mockResolvedValue(job);
  return {
    client: {
      execute: executeSpy,
      executeAsync: executeAsyncSpy,
    } as unknown as IReactorClient,
    executeSpy,
    executeAsyncSpy,
  };
}

const argsOf = (spy: ReturnType<typeof vi.fn>) =>
  spy.mock.calls[0] as [string, string, Action[]];

describe("execute", () => {
  it("applies the actions to the document it names", async () => {
    const { client, executeSpy } = recordingClient();

    const result = await execute(client, {
      documentIdentifier: "doc-1",
      actions: [action],
      branch: "feature",
    });

    const [identifier, branch, actions] = argsOf(executeSpy);
    expect(identifier).toBe("doc-1");
    expect(branch).toBe("feature");
    expect(actions).toHaveLength(1);
    expect(actions[0].id).toBe("act-1");
    expect(result.id).toBe("doc-1");
  });

  it("applies to main when no branch is named", async () => {
    const { client, executeSpy } = recordingClient();

    await execute(client, { documentIdentifier: "doc-1", actions: [action] });

    expect(argsOf(executeSpy)[1]).toBe("main");
  });

  it("treats a null branch as none given", async () => {
    const { client, executeSpy } = recordingClient();

    await execute(client, {
      documentIdentifier: "doc-1",
      actions: [action],
      branch: null,
    });

    expect(argsOf(executeSpy)[1]).toBe("main");
  });

  it("reads a signature back as the tuple verification indexes into", async () => {
    // The wire carries a signature joined into one string, because GraphQL
    // declares signatures as a list of strings rather than of lists.
    const { client, executeSpy } = recordingClient();

    await execute(client, {
      documentIdentifier: "doc-1",
      actions: [
        {
          ...action,
          context: {
            prevOpHash: "deadbeef",
            prevOpIndex: 3,
            signer: {
              user: { address: "0x1", networkId: "eip155", chainId: 1 },
              app: { name: "Connect", key: "did:key:z6Mk" },
              signatures: ["ts, key, hash, prev, 0xsig"],
            },
          },
        },
      ],
    });

    const submitted = argsOf(executeSpy)[2][0];
    expect(submitted.context?.signer?.signatures).toEqual([
      ["ts", "key", "hash", "prev", "0xsig"],
    ]);
    expect(submitted.context?.prevOpHash).toBe("deadbeef");
    expect(submitted.context?.prevOpIndex).toBe(3);
  });

  it("carries no context for an action that arrived without one", async () => {
    const { client, executeSpy } = recordingClient();

    await execute(client, { documentIdentifier: "doc-1", actions: [action] });

    expect(argsOf(executeSpy)[2][0]).not.toHaveProperty("context");
  });

  it("reports a refusal from the reactor as an error", async () => {
    const client = {
      execute: vi.fn().mockRejectedValue(new Error("locked by permissions")),
    } as unknown as IReactorClient;

    await expect(
      execute(client, { documentIdentifier: "doc-1", actions: [action] }),
    ).rejects.toThrow("locked by permissions");
  });
});

describe("executeAsync", () => {
  it("returns the job rather than only its id", async () => {
    const { client, executeAsyncSpy } = recordingClient();

    const submitted = await executeAsync(client, {
      documentIdentifier: "doc-1",
      actions: [action],
    });

    expect(submitted.id).toBe("job-1");
    expect(submitted.status).toBe("PENDING");
    // A job is never more resultless than at the moment it is handed back.
    expect(submitted.result).toBeNull();
    expect(argsOf(executeAsyncSpy)[1]).toBe("main");
  });
});

describe("the mutation surface", () => {
  const mutation = buildSchema(SDL).getType("Mutation") as GraphQLObjectType;

  it("offers execute and executeAsync", () => {
    const fields = mutation.getFields();
    expect(fields.execute).toBeDefined();
    expect(fields.executeAsync).toBeDefined();
  });

  it("says execute takes a branch, not a view", () => {
    // The view's scopes were accepted and ignored on the old field.
    const args = mutation.getFields().execute.args.map((arg) => arg.name);
    expect(args).toEqual(["documentIdentifier", "actions", "branch"]);
  });

  it("points the deprecated fields at their replacements", () => {
    const fields = mutation.getFields();
    expect(fields.mutateDocument.deprecationReason).toContain("execute");
    expect(fields.mutateDocumentAsync.deprecationReason).toContain(
      "executeAsync",
    );
  });

  it("keeps the untyped fields callable", () => {
    // Deprecation is advisory: a client that has not migrated still works.
    const fields = mutation.getFields();
    expect(fields.mutateDocument).toBeDefined();
    expect(fields.mutateDocumentAsync).toBeDefined();
  });
});

describe("what each field will accept", () => {
  const schema = buildSchema(SDL);

  /** The validation errors a query earns against the real schema. */
  const errorsFor = (query: string) =>
    validate(schema, parse(query)).map((error) => error.message);

  const call = (field: string, variableType: string) => `
    mutation Send($actions: ${variableType}) {
      ${field}(documentIdentifier: "doc-1", actions: $actions) { id }
    }
  `;

  it("lets execute take typed actions", () => {
    expect(errorsFor(call("execute", "[ActionInput!]!"))).toEqual([]);
  });

  it("refuses untyped actions on execute", () => {
    // This is what makes execute a new field rather than a changed one: a
    // client declaring the old variable type is rejected in validation, whatever
    // its payload looks like, so the old field has to stay for it.
    const errors = errorsFor(call("execute", "[JSONObject!]!"));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("[JSONObject!]!");
    expect(errors[0]).toContain("[ActionInput!]!");
  });

  it("still lets the deprecated field take untyped actions", () => {
    expect(errorsFor(call("mutateDocument", "[JSONObject!]!"))).toEqual([]);
  });

  it("refuses an action with no id given inline to execute", () => {
    const errors = errorsFor(`
      mutation Send {
        execute(
          documentIdentifier: "doc-1"
          actions: [{ type: "SET_NAME", scope: "global", input: {}, timestampUtcMs: "t" }]
        ) { id }
      }
    `);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("id");
  });
});
