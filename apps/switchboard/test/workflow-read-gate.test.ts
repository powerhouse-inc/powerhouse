import {
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import { AuthorizationPolicy, type Context } from "@powerhousedao/reactor-api";
import {
  initializeAuth,
  withSignaturePolicy,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { composeWorkflowRuntime } from "../src/workflow-runtime.mjs";

const READER = "0xreader";
const OUTSIDER = "0xoutsider";

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

describe("the workflow runtime's read check", () => {
  let module: InProcessReactorClientModule | undefined;

  afterEach(() => {
    module?.reactor.kill();
    module = undefined;
  });

  async function hostDeps() {
    module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder()
          .withDocumentModelSources([
            documentModelDocumentModelModule as unknown as DocumentModelModule,
          ])
          .withExecutorConfig({
            featureFlags: { documentDecisions: true, authEnforcement: true },
          }),
      )
      .buildModule();
    const client = module.client;
    const id = "wf-policed";
    await client.create(
      withSignaturePolicy(
        documentModelDocumentModelModule.utils.createDocument(),
        "legacy",
        { id },
      ),
    );
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

    const createWorkflowRuntime = vi.fn((_deps: Record<string, unknown>) => ({
      shutdown: vi.fn(),
    }));
    await composeWorkflowRuntime({
      reactorClient: client,
      relationalDb: {} as never,
      attachments: {} as never,
      authorizationService: openAuthorization as never,
      logger,
      load: () =>
        Promise.resolve({
          WORKFLOW_PACKAGE_NAME: "@powerhousedao/workflow",
          setPieceRegistryUrl: vi.fn(),
          createWorkflowRuntime,
        } as never),
    });
    const [deps] = createWorkflowRuntime.mock.calls[0]!;
    return {
      id,
      deps: deps as {
        assertCanRead: (id: string, caller: object) => Promise<unknown>;
        subjectOf: (caller: object) => unknown;
      },
    };
  }

  it("refuses under OPEN a document the caller is not served", async () => {
    const { id, deps } = await hostDeps();

    await expect(deps.assertCanRead(id, contextFor())).rejects.toThrow();
    await expect(
      deps.assertCanRead(id, contextFor(OUTSIDER)),
    ).rejects.toThrow();
    await expect(
      deps.assertCanRead(id, contextFor(READER)),
    ).resolves.toBeUndefined();
  });

  it("reads a caller as its own subject, anonymous as the empty one", async () => {
    const { deps } = await hostDeps();

    expect(deps.subjectOf(contextFor(READER))).toEqual({
      address: READER,
      key: undefined,
    });
    expect(deps.subjectOf(contextFor())).toEqual({
      address: undefined,
      key: undefined,
    });
  });
});
