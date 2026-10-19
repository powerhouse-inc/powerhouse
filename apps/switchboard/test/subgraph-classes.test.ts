import {
  AuthorizationPolicy,
  SUBGRAPH_PROTOCOL,
  type IAuthorizationService,
  type SubgraphArgs,
} from "@powerhousedao/reactor-api";
import {
  reactorDriveResolverCoordinates,
  type IDriveReadModel,
  type ReactorDriveFileNode,
} from "@powerhousedao/reactor-drive";
import {
  privacyResolverCoordinates,
  PrivacySubgraphOpenPolicyError,
} from "@powerhousedao/reactor-privacy";
import type { WorkflowRuntimeService } from "@powerhousedao/reactor-workflow";
import {
  compareResolverCoordinates,
  coordinatesOfResolverMap,
  typeKindsOfDocument,
} from "document-model/tooling";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuthorizationService } from "../../../packages/reactor-api/src/services/authorization.service.js";
import {
  makeHarness,
  makeMockReactorClient,
} from "../../../packages/reactor-api/test/utils/graphql-manager-harness.js";
import { ReactorDriveSubgraph } from "../src/drive-subgraph.js";
import { PrivacySubgraph } from "../src/privacy-subgraph.js";
import { workflowRuntimeResolverCoordinates } from "../src/workflow/resolver-coordinates.js";
import { createWorkflowRuntimeSubgraph } from "../src/workflow/subgraph.js";

vi.mock(
  "../../../packages/reactor-api/src/graphql/reactor/schema.graphql",
  () =>
    vi.importActual<{ default: string }>(
      "../../../packages/reactor-api/src/graphql/reactor/schema.graphql?raw",
    ),
);

const services = () => ({
  erasure: { plan: vi.fn(), request: vi.fn(), status: vi.fn() },
  disclosure: { disclose: vi.fn() },
});

function fixture(
  authorizationService = createAuthorizationService({
    admins: ["0xadmin"],
    defaultProtection: true,
    policy: AuthorizationPolicy.ADMIN_ONLY,
  }),
) {
  const harness = makeHarness({ authorizationService });
  const args: SubgraphArgs = {
    reactorClient: harness.reactorClient,
    graphqlManager: harness.manager,
    http: harness.manager.scopeForPackage("switchboard-test"),
    authorizationService,
    relationalDb: {} as SubgraphArgs["relationalDb"],
    analyticsStore: {} as SubgraphArgs["analyticsStore"],
    syncManager: {} as SubgraphArgs["syncManager"],
  };
  return { ...harness, args };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("PrivacySubgraph construction", () => {
  it("refuses OPEN with the existing error type and exact message", () => {
    const { args } = fixture(
      createAuthorizationService({
        admins: ["0xadmin"],
        defaultProtection: false,
        policy: AuthorizationPolicy.OPEN,
      }),
    );
    const construct = () => new PrivacySubgraph(args, services());
    expect(construct).toThrow(PrivacySubgraphOpenPolicyError);
    expect(construct).toThrow(
      /^The privacy subgraph is not mounted under policy OPEN: it admits anonymous callers as admins$/,
    );
  });

  it.each([undefined, ""])(
    "refuses a non-OPEN policy admitting anonymous address %s",
    (anonymousAddress) => {
      const { args } = fixture();
      const authorizationService: IAuthorizationService = {
        ...args.authorizationService,
        isSupremeAdmin: (address) => address === anonymousAddress,
      };
      expect(
        () =>
          new PrivacySubgraph({ ...args, authorizationService }, services()),
      ).toThrow(
        /^The privacy subgraph is not mounted under policy ADMIN_ONLY: it admits anonymous callers as admins$/,
      );
    },
  );

  it.each([
    AuthorizationPolicy.ADMIN_ONLY,
    AuthorizationPolicy.DOCUMENT_PERMISSIONS,
  ])("accepts authenticated policy %s", (policy) => {
    const { args } = fixture(
      createAuthorizationService(
        {
          admins: ["0xadmin"],
          defaultProtection: true,
          policy,
        },
        {} as Parameters<typeof createAuthorizationService>[1],
        () => Promise.resolve([]),
      ),
    );
    expect(new PrivacySubgraph(args, services()).subgraphName).toBe("privacy");
  });
});

it("registers Workflow, Drive and Privacy in a development host without a deprecation notice", async () => {
  vi.stubEnv("NODE_ENV", "development");
  const notices = vi.spyOn(console, "warn").mockImplementation(() => {});
  const { manager, args, mounts } = fixture();
  try {
    await manager.init([]);
    const WorkflowSubgraph = createWorkflowRuntimeSubgraph(
      {} as WorkflowRuntimeService,
    );
    const workflow = new WorkflowSubgraph(args);
    const drive = new ReactorDriveSubgraph(args, {} as IDriveReadModel);
    const privacy = new PrivacySubgraph(args, services());
    for (const instance of [workflow, drive, privacy]) {
      expect(
        await manager.registerSubgraphInstance(instance, "graphql", false),
      ).toBe(instance);
      expect(manager.getSubgraphByName(instance.subgraphName)).toBe(instance);
      await manager.updateRouter();
      expect(mounts.has(`/graphql/${instance.subgraphName}`)).toBe(true);
    }
    expect(notices).not.toHaveBeenCalled();
  } finally {
    await manager.shutdown();
  }
}, 15_000);

it("declares the exact resolver coordinates its factories bind", () => {
  const { args } = fixture();
  const WorkflowSubgraph = createWorkflowRuntimeSubgraph(
    {} as WorkflowRuntimeService,
  );
  const cases = [
    {
      protocol: WorkflowSubgraph[SUBGRAPH_PROTOCOL](),
      instance: new WorkflowSubgraph(args),
      coordinates: workflowRuntimeResolverCoordinates,
    },
    {
      protocol: ReactorDriveSubgraph[SUBGRAPH_PROTOCOL](),
      instance: new ReactorDriveSubgraph(args, {} as IDriveReadModel),
      coordinates: reactorDriveResolverCoordinates,
    },
    {
      protocol: PrivacySubgraph[SUBGRAPH_PROTOCOL](),
      instance: new PrivacySubgraph(args, services()),
      coordinates: privacyResolverCoordinates,
    },
  ];
  for (const { protocol, instance, coordinates } of cases) {
    const description = protocol.describe();
    expect(description.diagnostics).toEqual([]);
    expect(
      compareResolverCoordinates(
        coordinates,
        coordinatesOfResolverMap(
          protocol.bind(instance).resolvers,
          typeKindsOfDocument(description.typeDefs),
        ),
        [],
      ),
    ).toEqual([]);
  }
});

type QueryResolver = (
  root: unknown,
  args: Record<string, unknown>,
  context: { user?: { address?: string } },
) => Promise<unknown>;

function queryOf(
  subgraphClass: typeof ReactorDriveSubgraph | typeof PrivacySubgraph,
  instance: object,
  field: string,
): QueryResolver {
  const { resolvers } = subgraphClass[SUBGRAPH_PROTOCOL]().bind(instance);
  return (resolvers as { Query: Record<string, QueryResolver> }).Query[field];
}

describe("ReactorDriveSubgraph resolvers", () => {
  it("serves a file node only to a caller the host authorization lets read its document", async () => {
    const { args } = fixture();
    const node: ReactorDriveFileNode = {
      kind: "file",
      id: "doc-1",
      driveId: "drive-1",
      parentFolder: null,
      name: "Invoice",
      documentType: "powerhouse/invoice",
    };
    const getNode = vi.fn(() => Promise.resolve(node));
    const readModel = { getNode } as unknown as IDriveReadModel;
    const reactorClient = makeMockReactorClient({
      isServed: vi.fn(() => Promise.resolve(true)),
    });
    const reactorDriveNode = queryOf(
      ReactorDriveSubgraph,
      new ReactorDriveSubgraph({ ...args, reactorClient }, readModel),
      "reactorDriveNode",
    );
    const ids = { driveId: "drive-1", id: "doc-1" };

    expect(
      await reactorDriveNode({}, ids, { user: { address: "0xoutsider" } }),
    ).toBeUndefined();
    expect(await reactorDriveNode({}, ids, {})).toBeUndefined();
    expect(
      await reactorDriveNode({}, ids, { user: { address: "0xadmin" } }),
    ).toEqual(node);
    expect(getNode).toHaveBeenCalledExactlyOnceWith("drive-1", "doc-1");
  });
});

describe("PrivacySubgraph resolvers", () => {
  it("plans an erasure for an admin and refuses everyone else", async () => {
    const { args } = fixture();
    const privacyServices = services();
    privacyServices.erasure.plan.mockResolvedValue({ planned: ["doc-1"] });
    const erasurePlan = queryOf(
      PrivacySubgraph,
      new PrivacySubgraph(args, privacyServices),
      "erasurePlan",
    );

    for (const user of [{ address: "0xoutsider" }, {}, undefined]) {
      await expect(
        erasurePlan({}, { ids: ["doc-1"] }, { user }),
      ).rejects.toThrow(/^Admin access required$/);
    }
    expect(privacyServices.erasure.plan).not.toHaveBeenCalled();
    expect(
      await erasurePlan(
        {},
        { ids: ["doc-1"] },
        { user: { address: "0xadmin" } },
      ),
    ).toEqual({ planned: ["doc-1"] });
    expect(privacyServices.erasure.plan).toHaveBeenCalledExactlyOnceWith([
      "doc-1",
    ]);
  });
});

describe("WorkflowRuntimeSubgraph resolvers", () => {
  it("tells only a caller who can read the workflow why it has no reactor access", async () => {
    const { args } = fixture();
    const reactorAccessDenial = vi.fn(() => "signed by an untrusted key");
    const WorkflowSubgraph = createWorkflowRuntimeSubgraph({
      reactorAccessDenial,
    } as unknown as WorkflowRuntimeService);
    const { resolvers } = WorkflowSubgraph[SUBGRAPH_PROTOCOL]().bind(
      new WorkflowSubgraph(args),
    );
    const denialOf = (
      resolvers as {
        WorkflowRuntimeQueries: Record<string, QueryResolver>;
      }
    ).WorkflowRuntimeQueries.reactorAccessDenial;

    for (const user of [{ address: "0xoutsider" }, undefined]) {
      await expect(
        denialOf({}, { workflowId: "wf-1" }, { user }),
      ).rejects.toThrow(/^Forbidden: insufficient permissions$/);
    }
    expect(reactorAccessDenial).not.toHaveBeenCalled();
    expect(
      await denialOf(
        {},
        { workflowId: "wf-1" },
        { user: { address: "0xadmin" } },
      ),
    ).toBe("signed by an untrusted key");
    expect(reactorAccessDenial).toHaveBeenCalledExactlyOnceWith("wf-1");
  });
});
