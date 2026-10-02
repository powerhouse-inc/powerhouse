import { PGlite } from "@electric-sql/pglite";
import {
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import {
  AuthorizationPolicy,
  type Context,
  type IAuthorizationService,
} from "@powerhousedao/reactor-api";
import * as engine from "@powerhousedao/reactor-workflow";
import type { WorkflowRuntimeService } from "@powerhousedao/reactor-workflow";
import {
  initializeAuth,
  withSignaturePolicy,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import {
  createRelationalDb,
  type IRelationalDb,
} from "@powerhousedao/shared/processors";
import { Connection } from "@powerhousedao/workflow/document-models/connection";
import type { ILogger } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  composeWorkflowRuntime,
  type ComposedWorkflowRuntime,
} from "../src/workflow-runtime.mjs";

const READER = "0xreader";
const WRITER = "0xwriter";
const OUTSIDER = "0xoutsider";
const DOCUMENT = "wf-policed";
const CONNECTION = "conn-policed";

// The host's legacy layer under OPEN admits everyone, anonymous included.
const openAuthorization = {
  config: {
    admins: [],
    defaultProtection: false,
    policy: AuthorizationPolicy.OPEN,
  },
  isSupremeAdmin: () => true,
  canRead: () => Promise.resolve(true),
  canWrite: () => Promise.resolve(true),
};

// Document permissions: everyone reads, only the writer writes.
const writerOnlyAuthorization = {
  config: {
    admins: [],
    defaultProtection: false,
    policy: AuthorizationPolicy.DOCUMENT_PERMISSIONS,
  },
  isSupremeAdmin: () => false,
  canRead: () => Promise.resolve(true),
  canWrite: (_id: string, address?: string) =>
    Promise.resolve(address === WRITER),
};

const logger = {
  verbose: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: () => logger,
} as unknown as ILogger;

const contextFor = (address?: string) =>
  ({ headers: {}, db: {}, user: address ? { address } : undefined }) as Context;

const readerOnly = (id: string) =>
  initializeAuth({
    version: 1,
    grants: [
      {
        id: `${id}-read`,
        description: "the reader reads the domain",
        effect: "allow",
        principal: { address: READER },
        capability: { can: "read", scope: "global" },
      },
      {
        id: `${id}-admin`,
        description: "administration stays reachable",
        effect: "allow",
        principal: { anyone: true },
        capability: { can: "execute", scope: "auth" },
      },
    ],
  });

describe("the workflow runtime's access checks", () => {
  let module: InProcessReactorClientModule | undefined;
  let composed: ComposedWorkflowRuntime | undefined;
  let database: Kysely<unknown> | undefined;

  afterEach(async () => {
    await composed?.stop();
    await module?.reactor.kill().completed;
    await database?.destroy();
    composed = undefined;
    module = undefined;
    database = undefined;
  });

  // The real engine, composed as the host composes it; the runtime it builds
  // is kept so the tests can call it as the subgraph would.
  async function hostRuntime(
    authorizationService: Pick<
      IAuthorizationService,
      "config" | "isSupremeAdmin" | "canRead" | "canWrite"
    >,
    options: { policed: boolean },
  ): Promise<WorkflowRuntimeService> {
    module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder()
          .withDocumentModelSources([
            documentModelDocumentModelModule as unknown as DocumentModelModule,
            Connection as unknown as DocumentModelModule,
          ])
          .withExecutorConfig({
            featureFlags: { documentDecisions: true, authEnforcement: true },
          }),
      )
      .buildModule();
    const client = module.client;
    await client.create(
      withSignaturePolicy(
        documentModelDocumentModelModule.utils.createDocument(),
        "legacy",
        { id: DOCUMENT },
      ),
    );
    await client.create(
      withSignaturePolicy(Connection.utils.createDocument(), "legacy", {
        id: CONNECTION,
      }),
    );
    if (options.policed) {
      await client.execute(DOCUMENT, "main", [readerOnly(DOCUMENT)]);
      await client.execute(CONNECTION, "main", [readerOnly(CONNECTION)]);
    }

    database = new Kysely<unknown>({
      dialect: new PGliteDialect(new PGlite()),
    });
    let runtime: WorkflowRuntimeService | undefined;
    composed = await composeWorkflowRuntime({
      reactorClient: client,
      relationalDb: createRelationalDb(database) as IRelationalDb,
      attachments: {} as never,
      authorizationService: authorizationService as never,
      logger,
      load: () =>
        Promise.resolve({
          ...engine,
          createWorkflowRuntime: (deps) =>
            (runtime = engine.createWorkflowRuntime(deps)),
        }),
    });
    return runtime!;
  }

  it("refuses under OPEN a document the caller is not served", async () => {
    const runtime = await hostRuntime(openAuthorization, { policed: true });

    await expect(
      runtime.cancelTriggerTestFor(DOCUMENT, contextFor()),
    ).rejects.toThrow();
    await expect(
      runtime.cancelTriggerTestFor(DOCUMENT, contextFor(OUTSIDER)),
    ).rejects.toThrow();
    await expect(
      runtime.cancelTriggerTestFor(DOCUMENT, contextFor(READER)),
    ).resolves.toBe(false);
  });

  it("lists a connection only to the callers it is served to", async () => {
    const runtime = await hostRuntime(openAuthorization, { policed: true });
    const listed = async (address?: string) =>
      (await runtime.connections(contextFor(address))).map(({ id }) => id);

    expect(await listed(READER)).toEqual([CONNECTION]);
    expect(await listed(OUTSIDER)).toEqual([]);
    expect(await listed()).toEqual([]);
  });

  it("refuses a write the host's permissions deny", async () => {
    const runtime = await hostRuntime(writerOnlyAuthorization, {
      policed: false,
    });
    const startOAuth = (address: string) =>
      runtime.startOAuth(CONNECTION, contextFor(address), {
        redirectUri: "https://host/oauth/callback",
      });

    await expect(startOAuth(READER)).rejects.toThrow("to write this document");
    // Past the gate: refused for what the connection is, not who asked.
    await expect(startOAuth(WRITER)).rejects.toThrow(
      "does not sign in with OAuth2",
    );
  });
});
