import {
  type ISyncManager,
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  initializeAuth,
  setGrant,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule, setModelName } from "document-model";
import { buildSchema, parse, print, subscribe } from "graphql";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import {
  getPubSub,
  SUBSCRIPTION_TRIGGERS,
  type JobChangesPayload,
} from "../src/graphql/reactor/pubsub.js";
import { ReactorSubgraph } from "../src/graphql/reactor/subgraph.js";
import type { Context, SubgraphArgs } from "../src/graphql/types.js";
import {
  AuthorizationPolicy,
  type IAuthorizationService,
} from "../src/services/authorization.service.js";

const READER = "0xreader";
const OUTSIDER = "0xoutsider";
const DOCUMENT_MODEL = documentModelDocumentModelModule.documentModel.global.id;

// The host's legacy layer under OPEN admits everyone, anonymous included.
const openAuthorization: IAuthorizationService = {
  config: {
    admins: [],
    defaultProtection: false,
    policy: AuthorizationPolicy.OPEN,
  },
  isSupremeAdmin: () => true,
  canCreate: () => true,
  canRead: () => Promise.resolve(true),
  canWrite: () => Promise.resolve(true),
  canManage: () => Promise.resolve(true),
  canMutate: () => Promise.resolve(true),
};

function contextFor(address?: string): Context {
  return {
    user: address ? { address } : undefined,
    headers: {},
    db: null,
  } as unknown as Context;
}

// graphql's own schema, so subscribe() runs in this module's graphql realm.
function subscriptionSchema(subgraph: ReactorSubgraph) {
  const schema = buildSchema(print(subgraph.typeDefs));
  const fields = schema.getSubscriptionType()!.getFields();
  const resolvers = subgraph.resolvers.Subscription as Record<
    string,
    { subscribe: () => unknown; resolve: (payload: unknown) => unknown }
  >;
  for (const [name, resolver] of Object.entries(resolvers)) {
    const field = fields[name] as unknown as Record<string, unknown>;
    field.subscribe = resolver.subscribe;
    field.resolve = resolver.resolve;
  }
  return schema;
}

type Received = {
  data?: {
    documentChanges: { documents: Array<{ id: string; name: string }> };
  };
};

describe("documentChanges and findDocuments under OPEN with auth-scope policies", () => {
  let module: InProcessReactorClientModule | undefined;

  afterEach(() => {
    module?.reactor.kill();
    module = undefined;
  });

  async function build() {
    module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder()
          .withDocumentModelSources([
            driveDocumentModelModule as unknown as DocumentModelModule,
            documentModelDocumentModelModule as unknown as DocumentModelModule,
          ])
          .withExecutorConfig({
            featureFlags: { documentDecisions: true, authEnforcement: true },
          }),
      )
      .buildModule();
    const subgraph = new ReactorSubgraph({
      reactorClient: module.client,
      syncManager: {} as ISyncManager,
      authorizationService: openAuthorization,
    } as unknown as SubgraphArgs);
    return { client: module.client, subgraph };
  }

  async function createDocument(
    client: InProcessReactorClientModule["client"],
    id: string,
    name: string,
  ) {
    const document = documentModelDocumentModelModule.utils.createDocument();
    document.header.id = id;
    document.header.name = name;
    await client.create(document);
    return id;
  }

  async function police(
    client: InProcessReactorClientModule["client"],
    id: string,
  ) {
    await client.execute(id, "main", [
      initializeAuth({
        version: 1,
        grants: [
          {
            id: "g-read",
            description: "the reader reads the domain",
            effect: "allow",
            principal: { address: READER },
            capability: { can: "read", scope: "global" },
          },
          {
            id: "g-admin",
            description: "administration stays reachable",
            effect: "allow",
            principal: { anyone: true },
            capability: { can: "execute", scope: "auth" },
          },
        ],
      }),
    ]);
  }

  async function feed(subgraph: ReactorSubgraph, address?: string) {
    const result = await subscribe({
      schema: subscriptionSchema(subgraph),
      contextValue: contextFor(address),
      document: parse(`
        subscription {
          documentChanges(search: {}) { type documents { id name } }
        }
      `),
    });
    const iterator = (result as AsyncIterableIterator<Received>)[
      Symbol.asyncIterator
    ]();
    const received: string[] = [];
    const pump = (async () => {
      for (;;) {
        const next = await iterator.next();
        if (next.done) return;
        for (const d of next.value.data?.documentChanges.documents ?? []) {
          received.push(d.name);
        }
      }
    })();
    await delay(10);
    return {
      received,
      stop: async () => {
        await iterator.return?.();
        await pump;
      },
    };
  }

  it("sends a subscriber only the documents its policies let it read", async () => {
    const { client, subgraph } = await build();
    const policed = await createDocument(client, "e2e-policed", "secret.pdf");
    await police(client, policed);
    const open = await createDocument(client, "e2e-open", "public.pdf");

    const anonymous = await feed(subgraph);
    const outsider = await feed(subgraph, OUTSIDER);
    const reader = await feed(subgraph, READER);

    await client.execute(policed, "main", [
      setGrant({
        grant: {
          id: "g-touch",
          description: "a change to the policed document",
          effect: "allow",
          principal: { address: "0xnobody" },
          capability: { can: "read", scope: "local" },
        },
      }),
    ]);
    await client.execute(open, "main", [setModelName({ name: "touched" })]);

    const all = [anonymous, outsider, reader];
    for (let i = 0; i < 100; i++) {
      if (all.every((f) => f.received.includes("public.pdf"))) break;
      await delay(20);
    }
    await Promise.all(all.map((f) => f.stop()));

    expect(anonymous.received).toContain("public.pdf");
    expect(anonymous.received).not.toContain("secret.pdf");
    expect(outsider.received).toContain("public.pdf");
    expect(outsider.received).not.toContain("secret.pdf");
    expect(reader.received).toContain("secret.pdf");
  });

  it("lists only readable documents, however the view narrows scopes", async () => {
    const { client, subgraph } = await build();
    const policed = await createDocument(client, "list-policed", "secret.pdf");
    await police(client, policed);
    await createDocument(client, "list-open", "public.pdf");

    const findDocuments = (
      subgraph.resolvers.Query as Record<
        string,
        (
          p: unknown,
          a: unknown,
          c: Context,
        ) => Promise<{ items: Array<{ name: string }> }>
      >
    ).findDocuments;
    const names = async (address: string | undefined, view?: unknown) =>
      (
        await findDocuments(
          undefined,
          { search: { type: DOCUMENT_MODEL }, view },
          contextFor(address),
        )
      ).items.map((item) => item.name);

    expect(await names(undefined)).toEqual(["public.pdf"]);
    expect(await names(undefined, { scopes: ["document"] })).toEqual([
      "public.pdf",
    ]);
    expect((await names(READER)).sort()).toEqual(["public.pdf", "secret.pdf"]);
  });

  describe("jobs on a policed document", () => {
    async function policedJob() {
      const { client, subgraph } = await build();
      const policed = await createDocument(client, "job-policed", "secret.pdf");
      await police(client, policed);
      // Anyone may execute on auth, so this job succeeds for the test's signer.
      const job = await client.executeAsync(policed, "main", [
        setGrant({
          grant: {
            id: "g-job",
            description: "a job on the policed document",
            effect: "allow",
            principal: { address: "0xnobody" },
            capability: { can: "read", scope: "local" },
          },
        }),
      ]);
      await client.waitForJob(job.id);
      return { subgraph, policed, jobId: job.id };
    }

    type JobAnswer = { id: string; status: string; error: string | null };

    it("jobStatus answers an unauthorised caller as for an unknown job", async () => {
      const { subgraph, jobId } = await policedJob();
      const jobStatus = (
        subgraph.resolvers.Query as Record<
          string,
          (p: unknown, a: unknown, c: Context) => Promise<JobAnswer>
        >
      ).jobStatus;

      const asOutsider = await jobStatus(
        undefined,
        { jobId },
        contextFor(OUTSIDER),
      );
      const unknown = await jobStatus(
        undefined,
        { jobId: "no-such-job" },
        contextFor(OUTSIDER),
      );
      const asReader = await jobStatus(
        undefined,
        { jobId },
        contextFor(READER),
      );

      expect(asOutsider.status).toBe(unknown.status);
      expect(asOutsider.error).toBe(unknown.error);
      expect(asReader.status).not.toBe(unknown.status);
      expect(asReader.error).toBeNull();
    });

    it("jobChanges sends an unauthorised subscriber nothing", async () => {
      const { subgraph, policed, jobId } = await policedJob();
      const watch = async (address: string) => {
        const result = await subscribe({
          schema: subscriptionSchema(subgraph),
          contextValue: contextFor(address),
          document: parse(
            `subscription { jobChanges(jobId: "${jobId}") { jobId status } }`,
          ),
        });
        const iterator = (result as AsyncIterableIterator<unknown>)[
          Symbol.asyncIterator
        ]();
        const next = iterator.next();
        await delay(10);
        void getPubSub().publish(SUBSCRIPTION_TRIGGERS.JOB_CHANGES, {
          jobChanges: {
            jobId,
            status: "READ_READY",
            createdAt: new Date().toISOString(),
            completedAt: null,
            error: null,
            result: null,
          },
          jobId,
          documentId: policed,
        } satisfies JobChangesPayload);
        const got = await Promise.race([
          next.then(() => "event"),
          delay(500).then(() => "nothing"),
        ]);
        await iterator.return?.();
        return got;
      };

      expect(await watch(OUTSIDER)).toBe("nothing");
      expect(await watch(READER)).toBe("event");
    });
  });
});
