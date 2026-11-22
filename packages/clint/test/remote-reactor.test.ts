import { createServer, type Server } from "node:http";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type {
  AttachmentRef,
  BatchExecutionRequest,
  IReactorClient,
} from "@powerhousedao/reactor";
import type { IAttachmentService } from "@powerhousedao/reactor-attachments";
import type {
  ISigner,
  UserActionSigner,
} from "@powerhousedao/shared/document-model";
import { setName } from "@powerhousedao/shared/document-model";
import {
  attachRemoteReactor,
  deriveGraphqlEndpoint,
} from "../src/integrations/powerhouse/remote-reactor.js";
import { LocalSigner } from "./fixtures/local-signer.js";
import { ensureDrive } from "../src/integrations/powerhouse/drive.js";
import {
  SignerNotReadyError,
  createGatedSigner,
  policyOfHeader,
} from "../src/integrations/powerhouse/signing.js";
import { createReactorWrites } from "../src/integrations/powerhouse/writes.js";
import {
  attachDefaultReactor,
  resolveRemoteReactorConfig,
} from "../src/integrations/powerhouse/index.js";
import { createMemoryWorkdirStore } from "../src/core/store.js";

describe("deriveGraphqlEndpoint", () => {
  it("derives from a drive url, a graphql url, and a bare origin", () => {
    expect(deriveGraphqlEndpoint("http://localhost:4001/d/powerhouse")).toBe(
      "http://localhost:4001/graphql",
    );
    expect(deriveGraphqlEndpoint("http://localhost:4001/graphql")).toBe(
      "http://localhost:4001/graphql",
    );
    expect(deriveGraphqlEndpoint("http://localhost:4001")).toBe(
      "http://localhost:4001/graphql",
    );
    expect(deriveGraphqlEndpoint("https://sb.example/base/graphql/")).toBe(
      "https://sb.example/base/graphql",
    );
  });
});

/** One request the fake switchboard received. */
interface Seen {
  path: string;
  authorization?: string;
  query: string;
  variables?: Record<string, unknown>;
}

type PushedAction = {
  context?: {
    signer?: {
      user?: { address: string };
      app?: { key: string };
      signatures?: unknown[];
    };
  };
};

/** A document as a `createDocument` mutation sends it. */
type SentDocument = {
  header: {
    id: string;
    slug?: string;
    name: string;
    documentType: string;
    meta?: { preferredEditor?: string };
    protocolVersions?: Record<string, number> | null;
    createdAtUtcIso: string;
    lastModifiedAtUtcIso: string;
  };
  state: { global: { name: string } };
};

/** The `PHDocumentFields` the switchboard answers for a stored document. */
function documentFields(doc: SentDocument) {
  return {
    id: doc.header.id,
    slug: doc.header.slug || doc.header.id,
    name: doc.header.name,
    documentType: doc.header.documentType,
    meta: doc.header.meta ?? null,
    protocolVersions: doc.header.protocolVersions ?? null,
    state: doc.state,
    revisionsList: [],
    createdAtUtcIso: doc.header.createdAtUtcIso,
    lastModifiedAtUtcIso: doc.header.lastModifiedAtUtcIso,
  };
}

/** A job the fake switchboard settled at once, named `job-<documentId>`. */
function settledJob(documentId: string) {
  return {
    id: `job-${documentId}`,
    documentId,
    status: "READ_READY",
    result: null,
    error: null,
    errorName: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    consistencyToken: {
      version: 1,
      createdAtUtcIso: "2026-01-01T00:00:01.000Z",
      coordinates: [],
    },
    meta: { batchId: "batch-1", batchJobIds: [`job-${documentId}`] },
  };
}

const OWNER: UserActionSigner = {
  address: "0x00000000000000000000000000000000000000a1",
  networkId: "eip155",
  chainId: 1,
};

/** A real P-256 signer whose `user` is set later, like Renown's on sign-in. */
async function createLiveSigner(): Promise<
  ISigner & { user: UserActionSigner | undefined }
> {
  const local = await LocalSigner.create({ user: OWNER });
  return {
    user: undefined,
    app: local.app,
    publicKey: local.publicKey,
    sign: (data) => local.sign(data),
    verify: () => local.verify(),
    signAction: (action, target) => local.signAction(action, target),
  };
}

/** A one-action batch: signed per action, needing no document model. */
function renameBatch(): BatchExecutionRequest {
  return {
    jobs: [
      {
        key: "rename",
        documentId: "doc-1",
        scope: "global",
        branch: "main",
        actions: [setName("renamed")],
        dependsOn: [],
      },
    ],
  };
}

describe("attachRemoteReactor", () => {
  let server: Server;
  let port: number;
  const seen: Seen[] = [];
  /** Documents created through the fake switchboard, by id. */
  const stored = new Map<string, SentDocument>();

  beforeAll(async () => {
    // Answers what the attach and the client ask: the probe, the inspection
    // read, the create defaults, createDocument (kept in `stored`), and
    // findDocuments / GetDocument over what is stored. An ExecuteBatch is
    // recorded and refused.
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk: Buffer) => {
        raw += chunk.toString();
      });
      req.on("end", () => {
        let body: { query?: string; variables?: Record<string, unknown> } = {};
        try {
          body = JSON.parse(raw) as typeof body;
        } catch {
          // not a JSON body
        }
        const query = body.query ?? "";
        seen.push({
          path: req.url ?? "",
          authorization: req.headers.authorization,
          query,
          variables: body.variables,
        });
        const send = (payload: unknown) => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(payload));
        };
        if (req.url?.startsWith("/attachments/")) {
          // The attachment routes hold nothing here.
          res.writeHead(404);
          res.end();
        } else if (req.url?.endsWith("/inspection")) {
          send({
            data: { inspection: { info: { name: "fake-switchboard" } } },
          });
        } else if (query.includes("query GetCreateDefaults")) {
          send({
            data: {
              createDefaults: {
                signaturePolicy: "v2-required",
                protocolVersions: { "base-reducer": 2 },
              },
            },
          });
        } else if (query.includes("query GetCreateProtocolVersions")) {
          send({
            data: {
              createDefaults: { protocolVersions: { "base-reducer": 2 } },
            },
          });
        } else if (query.includes("mutation CreateDocument")) {
          const doc = body.variables?.document as SentDocument;
          stored.set(doc.header.id, doc);
          send({ data: { createDocument: documentFields(doc) } });
        } else if (query.includes("query FindDocuments")) {
          const search = body.variables?.search as { type?: string };
          const items = [...stored.values()]
            .filter((doc) => doc.header.documentType === search?.type)
            .map(documentFields);
          send({
            data: {
              findDocuments: {
                items,
                hasNextPage: false,
                hasPreviousPage: false,
                cursor: null,
              },
            },
          });
        } else if (query.includes("query GetDocument(")) {
          const doc = stored.get(String(body.variables?.idOrSlug));
          send({
            data: {
              document: doc
                ? { document: documentFields(doc), childIds: [] }
                : null,
            },
          });
        } else if (query.includes("mutation ExecuteBatch")) {
          send({ errors: [{ message: "recorded by the fake switchboard" }] });
        } else if (query.includes("mutation MutateDocumentAsync")) {
          send({
            data: {
              mutateDocumentAsync: settledJob(
                String(body.variables?.documentIdOrSlug),
              ),
            },
          });
        } else if (query.includes("query GetJobStatus")) {
          const jobId = String(body.variables?.jobId);
          send({ data: { jobStatus: settledJob(jobId.replace(/^job-/, "")) } });
        } else {
          send({ data: { __typename: "Query" } });
        }
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    port = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    seen.length = 0;
    stored.clear();
  });

  const findRequests = () =>
    seen.filter((s) => s.query.includes("query FindDocuments"));
  const mutations = () =>
    seen.filter((s) => s.query.trimStart().startsWith("mutation"));
  const operationName = (s: Seen) => /^\s*mutation\s+(\w+)/.exec(s.query)?.[1];
  const batchActions = (): PushedAction[] => {
    const batch = seen.find((s) => s.query.includes("mutation ExecuteBatch"));
    const jobs = (batch?.variables?.jobs ?? []) as Array<{
      actions: PushedAction[];
    }>;
    return jobs.flatMap((job) => job.actions);
  };

  it("attaches to a listening switchboard and reads inspection facts", async () => {
    const attachment = await attachRemoteReactor({
      url: `http://127.0.0.1:${port}/d/powerhouse`,
      documentModels: [],
    });
    expect(attachment.endpoint).toBe(`http://127.0.0.1:${port}/graphql`);
    expect(attachment.client).toBeDefined();
    expect(attachment.remoteInfo).toEqual({ name: "fake-switchboard" });
  });

  it("fails the attach LOUDLY with the start hint when nothing listens", async () => {
    await expect(
      attachRemoteReactor({
        url: "http://127.0.0.1:1/graphql",
        documentModels: [],
        timeoutMs: 1500,
      }),
    ).rejects.toThrow(/never\s+starts one.*ph run switchboard/s);
  });

  it("sends a static token on the inspection read and on client requests", async () => {
    const { client } = await attachRemoteReactor({
      url: `http://127.0.0.1:${port}/graphql`,
      documentModels: [],
      token: "static-token",
    });
    await (client as IReactorClient).find({
      type: "powerhouse/document-drive",
    });

    const inspection = seen.find((s) => s.path.endsWith("/inspection"));
    expect(inspection?.authorization).toBe("Bearer static-token");
    expect(findRequests().map((s) => s.authorization)).toEqual([
      "Bearer static-token",
    ]);
  });

  it("resolves the bearer per request from tokenProvider, ahead of token", async () => {
    let issued = 0;
    const { client } = await attachRemoteReactor({
      url: `http://127.0.0.1:${port}/graphql`,
      documentModels: [],
      token: "ignored",
      tokenProvider: () => Promise.resolve(`token-${++issued}`),
    });
    const remote = client as IReactorClient;
    await remote.find({ type: "powerhouse/document-drive" });
    await remote.find({ type: "powerhouse/document-drive" });

    const inspection = seen.find((s) => s.path.endsWith("/inspection"));
    expect(inspection?.authorization).toBe("Bearer token-1");
    expect(findRequests().map((s) => s.authorization)).toEqual([
      "Bearer token-2",
      "Bearer token-3",
    ]);
  });

  it("signs the pushed actions with the given signer", async () => {
    const signer = await LocalSigner.create({ user: OWNER });
    const { client } = await attachRemoteReactor({
      url: `http://127.0.0.1:${port}/graphql`,
      documentModels: [],
      signer,
    });
    await expect(
      (client as IReactorClient).executeBatch(renameBatch()),
    ).rejects.toThrow(/recorded by the fake switchboard/);

    const [pushed] = batchActions();
    expect(pushed?.context?.signer?.app?.key).toBe(signer.did);
    expect(pushed?.context?.signer?.user?.address).toBe(OWNER.address);
    expect(pushed?.context?.signer?.signatures).toHaveLength(1);
  });

  it("refuses an unready signer's write before any request is sent", async () => {
    const live = await createLiveSigner();
    const { signer } = createReactorWrites({ signer: live });
    const { client } = await attachRemoteReactor({
      url: `http://127.0.0.1:${port}/graphql`,
      documentModels: [],
      signer,
    });
    const remote = client as IReactorClient;
    seen.length = 0;

    await expect(remote.executeBatch(renameBatch())).rejects.toBeInstanceOf(
      SignerNotReadyError,
    );
    expect(seen).toEqual([]);

    // Signed in: the same client signs as the user from now on.
    live.user = OWNER;
    await expect(remote.executeBatch(renameBatch())).rejects.toThrow(
      /recorded by the fake switchboard/,
    );
    const [pushed] = batchActions();
    expect(pushed?.context?.signer?.user?.address).toBe(OWNER.address);
    expect(pushed?.context?.signer?.app?.key).toBe(live.app?.key);
  });

  it("needs the resolver: a bare gated signer meets the client's own user check first", async () => {
    // Why createReactorWrites hands the client a throwing resolver: the client
    // checks `signer.user` before it calls `signAction`, so the gated
    // signAction never runs and the refusal is a plain Error. It still comes
    // before the mutation.
    const live = await createLiveSigner();
    const { client } = await attachRemoteReactor({
      url: `http://127.0.0.1:${port}/graphql`,
      documentModels: [],
      signer: createGatedSigner(live),
    });
    seen.length = 0;

    const refusal = await (client as IReactorClient)
      .executeBatch(renameBatch())
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(refusal).toBeInstanceOf(Error);
    expect(refusal).not.toBeInstanceOf(SignerNotReadyError);
    expect(seen.some((s) => s.query.includes("mutation ExecuteBatch"))).toBe(
      false,
    );
  });

  it("ensureDrive creates a named v2-required drive in one createDocument and finds it by name", async () => {
    const { client } = await attachRemoteReactor({
      url: `http://127.0.0.1:${port}/graphql`,
      documentModels: [],
    });
    const remote = client as IReactorClient;
    seen.length = 0;

    const first = await ensureDrive(remote, { name: "Remote Home" });
    expect(mutations().map(operationName)).toEqual(["CreateDocument"]);
    const sent = mutations()[0].variables?.document as SentDocument;
    expect(sent.header.id).toBe(first.id);
    expect(policyOfHeader(sent.header)).toBe("v2-required");
    expect(sent.header.name).toBe("Remote Home");
    expect(sent.state.global.name).toBe("Remote Home");

    // Read back through findDocuments, the name is what the lookup matches.
    seen.length = 0;
    const again = await ensureDrive(remote, { name: "Remote Home" });
    expect(again).toEqual({ id: first.id, name: "Remote Home" });
    expect(mutations()).toEqual([]);
  });

  it("ensureDrive creates a legacy drive under a fixed id in one createDocument", async () => {
    const { client } = await attachRemoteReactor({
      url: `http://127.0.0.1:${port}/graphql`,
      documentModels: [],
    });
    const remote = client as IReactorClient;
    seen.length = 0;

    const first = await ensureDrive(remote, {
      id: "remote-fixed",
      name: "Remote Fixed",
      preferredEditor: "test-editor",
    });
    expect(first).toEqual({ id: "remote-fixed", name: "Remote Fixed" });
    expect(mutations().map(operationName)).toEqual(["CreateDocument"]);
    const sent = mutations()[0].variables?.document as SentDocument;
    expect(policyOfHeader(sent.header)).toBe("legacy");
    expect(sent.header.name).toBe("Remote Fixed");
    expect(sent.state.global.name).toBe("Remote Fixed");
    expect(sent.header.meta?.preferredEditor).toBe("test-editor");

    seen.length = 0;
    const byName = await ensureDrive(remote, { name: "Remote Fixed" });
    expect(byName.id).toBe("remote-fixed");
    expect(mutations()).toEqual([]);
  });

  describe("attachDefaultReactor with an identity", () => {
    const pushed = (): PushedAction[] =>
      seen
        .filter((s) => s.query.includes("mutation MutateDocumentAsync"))
        .flatMap((s) => (s.variables?.actions ?? []) as PushedAction[]);

    /** A stored document under `id`, v2-required or legacy. */
    function storeDocument(id: string, policy: "v2" | "legacy"): void {
      stored.set(id, {
        header: {
          id,
          name: id,
          documentType: "powerhouse/document-model",
          protocolVersions:
            policy === "v2"
              ? { "base-reducer": 2, signature: 2 }
              : { "base-reducer": 2 },
          createdAtUtcIso: "2026-01-01T00:00:00.000Z",
          lastModifiedAtUtcIso: "2026-01-01T00:00:00.000Z",
        },
        state: { global: { name: id } },
      });
    }

    /** A signer-change source, as Renown's `on("user")` would be. */
    function signerChanges() {
      const listeners = new Set<() => void>();
      return {
        onSignerChange: (listener: () => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        change: () => {
          for (const listener of [...listeners]) listener();
        },
        get size() {
          return listeners.size;
        },
      };
    }

    function setup(emit?: (event: string, data?: unknown) => void) {
      return {
        workdir: process.cwd(),
        config: {},
        workspace: createMemoryWorkdirStore(),
        ...(emit ? { emit } : {}),
      };
    }

    it("signs a v2 push with the agent's signer", async () => {
      storeDocument("v2-doc", "v2");
      const signer = await LocalSigner.create({ user: OWNER });
      const reactor = await attachDefaultReactor(setup(), {
        url: `http://127.0.0.1:${port}/graphql`,
        signer,
      });
      seen.length = 0;

      await reactor.client.write.execute("v2-doc", "main", [setName("x")]);

      const [action] = pushed();
      expect(action?.context?.signer?.app?.key).toBe(signer.did);
      expect(action?.context?.signer?.user?.address).toBe(OWNER.address);
      expect(action?.context?.signer?.signatures).toHaveLength(1);
      await reactor.shutdown();
    });

    it("refuses every push while the signer has no user, a legacy one included", async () => {
      // The limit documented on RemoteReactorConfig.signer: the client asks
      // for its signer before it knows the document, so the legacy rule
      // `canWrite` applies cannot let this write through unsigned.
      storeDocument("v2-doc", "v2");
      storeDocument("legacy-doc", "legacy");
      const live = await createLiveSigner();
      const reactor = await attachDefaultReactor(setup(), {
        url: `http://127.0.0.1:${port}/graphql`,
        signer: live,
      });
      const legacy = { header: stored.get("legacy-doc")!.header };
      expect(reactor.writes?.ready()).toBe(false);
      expect(reactor.writes?.canWrite(legacy)).toBe(true);
      seen.length = 0;

      for (const id of ["v2-doc", "legacy-doc"]) {
        await expect(
          reactor.client.write.execute(id, "main", [setName("x")]),
        ).rejects.toBeInstanceOf(SignerNotReadyError);
      }
      expect(pushed()).toEqual([]);

      live.user = OWNER;
      await reactor.client.write.execute("legacy-doc", "main", [setName("y")]);
      expect(pushed()[0]?.context?.signer?.user?.address).toBe(OWNER.address);
      await reactor.shutdown();
    });

    it("announces powerhouse:writes:ready once when the user arrives, and re-authenticates realtime on each change", async () => {
      const live = await createLiveSigner();
      const changes = signerChanges();
      const events: string[] = [];
      const reactor = await attachDefaultReactor(
        setup((event) => events.push(event)),
        {
          url: `http://127.0.0.1:${port}/graphql`,
          signer: live,
          onSignerChange: changes.onSignerChange,
        },
      );
      const client = reactor.client as unknown as {
        notifyCredentialsChanged(): void;
      };
      const notify = vi.spyOn(client, "notifyCredentialsChanged");
      const ready = () =>
        events.filter((event) => event === "powerhouse:writes:ready");

      changes.change();
      expect(ready()).toEqual([]);
      expect(notify).toHaveBeenCalledTimes(1);

      live.user = OWNER;
      changes.change();
      changes.change();
      expect(ready()).toHaveLength(1);
      expect(reactor.writes?.ready()).toBe(true);
      expect(notify).toHaveBeenCalledTimes(3);

      await reactor.shutdown();
      expect(changes.size).toBe(0);
    });

    it("applies legacyDocuments and accepts to writes.canWrite, and sends the bearer", async () => {
      const reactor = await attachDefaultReactor(setup(), {
        url: `http://127.0.0.1:${port}/graphql`,
        signer: await LocalSigner.create({ user: OWNER }),
        legacyDocuments: "refuse",
        accepts: (document) => document.header.id !== "ignored",
        tokenProvider: () => Promise.resolve("agent-bearer"),
      });
      const v2 = { header: { id: "a", protocolVersions: { signature: 2 } } };
      expect(reactor.writes?.canWrite(v2)).toBe(true);
      expect(
        reactor.writes?.canWrite({ header: { id: "b", protocolVersions: {} } }),
      ).toBe(false);
      expect(
        reactor.writes?.canWrite({ header: { ...v2.header, id: "ignored" } }),
      ).toBe(false);
      seen.length = 0;

      await reactor.client.find({ type: "powerhouse/document-drive" });
      expect(findRequests().map((s) => s.authorization)).toEqual([
        "Bearer agent-bearer",
      ]);
      await reactor.shutdown();
    });

    describe("attachment service", () => {
      const HASH = "a".repeat(64);
      const ref = `attachment://v1:${HASH}` as AttachmentRef;
      // The switchboard authorizes a read by the document that references
      // the attachment, so a read names one.
      const statRequests = () =>
        seen.filter((s) => s.path === `/attachments/${HASH}?documentId=doc-1`);

      it("is the switchboard's, on its origin, authenticated by the context's handler ahead of the bearer", async () => {
        const reactor = await attachDefaultReactor(
          {
            ...setup(),
            attachmentJwtHandler: (url) =>
              Promise.resolve(`jwt:${new URL(url).pathname}`),
          },
          {
            url: `http://127.0.0.1:${port}/graphql`,
            tokenProvider: () => Promise.resolve("agent-bearer"),
          },
        );
        seen.length = 0;

        await expect(
          reactor.attachments!.stat(ref, { documentId: "doc-1" }),
        ).rejects.toThrow();

        expect(statRequests().map((s) => s.authorization)).toEqual([
          `Bearer jwt:/attachments/${HASH}`,
        ]);
        await reactor.shutdown();
      });

      it("falls back to the remote's bearer", async () => {
        const reactor = await attachDefaultReactor(setup(), {
          url: `http://127.0.0.1:${port}/graphql`,
          tokenProvider: () => Promise.resolve("agent-bearer"),
        });
        seen.length = 0;

        await expect(
          reactor.attachments!.stat(ref, { documentId: "doc-1" }),
        ).rejects.toThrow();

        expect(statRequests().map((s) => s.authorization)).toEqual([
          "Bearer agent-bearer",
        ]);
        await reactor.shutdown();
      });

      it("keeps a service the context brings", async () => {
        const brought = {} as IAttachmentService;
        const reactor = await attachDefaultReactor(
          { ...setup(), attachments: brought },
          { url: `http://127.0.0.1:${port}/graphql` },
        );
        expect(reactor.attachments).toBe(brought);
        await reactor.shutdown();
      });
    });

    it("stops watching the signer when the attach fails", async () => {
      const changes = signerChanges();
      await expect(
        attachDefaultReactor(setup(), {
          url: "http://127.0.0.1:1/graphql",
          onSignerChange: changes.onSignerChange,
        }),
      ).rejects.toThrow(/not answering/);
      expect(changes.size).toBe(0);
    }, 20_000);
  });
});

describe("resolveRemoteReactorConfig", () => {
  const setup = {
    workdir: "/work/agent",
    config: { environmentId: "env-1" },
    workspace: createMemoryWorkdirStore(),
  };

  it("takes an object as given, and none as empty", async () => {
    const remote = { drive: { name: "Home" } };
    expect(await resolveRemoteReactorConfig(remote, setup)).toBe(remote);
    expect(await resolveRemoteReactorConfig(undefined, setup)).toEqual({});
  });

  it("calls a function with the setup context, sync or async", async () => {
    expect(
      await resolveRemoteReactorConfig(
        (ctx) => ({ drive: { name: `${String(ctx.config.environmentId)}` } }),
        setup,
      ),
    ).toEqual({ drive: { name: "env-1" } });
    expect(
      await resolveRemoteReactorConfig(
        (ctx) => Promise.resolve({ drive: { name: ctx.workdir } }),
        setup,
      ),
    ).toEqual({ drive: { name: "/work/agent" } });
  });
});
