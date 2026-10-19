import { buildSubgraphSchema } from "@apollo/subgraph";
import type * as GraphQL from "graphql";
import { createRequire } from "node:module";
import type { DocumentPermissionService } from "../src/services/document-permission.service.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PackagesSubgraph } from "../src/graphql/packages/subgraph.js";
import { SystemSubgraph } from "../src/graphql/system/subgraph.js";
import { SUBGRAPH_PROTOCOL } from "../src/graphql/subgraph-protocol.js";
import type { SubgraphArgs } from "../src/graphql/types.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "../src/services/authorization.service.js";
import type { PackageManagementService } from "../src/services/package-management.service.js";
import { PackagesSubgraph as SdlPackagesSubgraph } from "./fixtures/u8-system-packages/packages-subgraph.js";
import { SystemSubgraph as SdlSystemSubgraph } from "./fixtures/u8-system-packages/system-subgraph.js";
import { contextFor } from "./utils/read-gate-fixture.js";
import { resolversOf, typeDefsOf } from "./utils/served-subgraph.js";

const { graphql } = createRequire(import.meta.url)("graphql") as typeof GraphQL;

const ADMIN = "0xadmin";
const installed = {
  name: "@example/pkg",
  version: "1.2.3",
  registryUrl: "https://registry.example",
  installedAt: new Date("2026-10-01T12:00:00.000Z"),
  documentTypes: ["example/invoice"],
};
const packageResult = { ...installed, installedAt: "2026-10-01T12:00:00.000Z" };
const selection = "name version registryUrl installedAt documentTypes";

function fixture(policy: AuthorizationPolicy) {
  const service = {
    getInstalledPackages: vi.fn().mockResolvedValue([installed]),
    getInstalledPackage: vi.fn((name: string) =>
      Promise.resolve(name === installed.name ? installed : null),
    ),
    installPackage: vi
      .fn()
      .mockResolvedValue({ package: installed, documentModelsLoaded: 2 }),
    uninstallPackage: vi.fn().mockResolvedValue(true),
  };
  const args = {
    authorizationService: createAuthorizationService(
      {
        admins: [ADMIN],
        defaultProtection: false,
        policy,
      },
      {} as DocumentPermissionService,
      () => Promise.resolve([]),
    ),
    packageManagementService: service as unknown as PackageManagementService,
  } as SubgraphArgs & { packageManagementService: PackageManagementService };
  return { service, args };
}

async function run(
  subgraph: SystemSubgraph | PackagesSubgraph,
  source: string,
  address?: string,
) {
  return graphql({
    schema: buildSubgraphSchema([
      { typeDefs: typeDefsOf(subgraph), resolvers: resolversOf(subgraph) },
    ]),
    source,
    contextValue: contextFor(address),
  });
}

afterEach(() => vi.unstubAllEnvs());

it("serves typed System and Packages entries while the parity fixtures stay SDL", () => {
  for (const subgraph of [SystemSubgraph, PackagesSubgraph]) {
    expect(subgraph[SUBGRAPH_PROTOCOL]().describe().definition.schemaKind).toBe(
      "typed",
    );
  }
  for (const subgraph of [SdlSystemSubgraph, SdlPackagesSubgraph]) {
    expect(subgraph[SUBGRAPH_PROTOCOL]().describe().definition.schemaKind).toBe(
      "graphql-ast-compat",
    );
  }
});

for (const policy of Object.values(AuthorizationPolicy)) {
  describe(policy, () => {
    for (const [caller, address] of [
      ["admin", ADMIN],
      ["member", "0xmember"],
      ["anonymous", undefined],
    ] as const) {
      it(`keeps System public for ${caller}`, async () => {
        vi.stubEnv("WORKSPACE_VERSION", "9.9.9-test");
        vi.stubEnv("WORKSPACE_GIT_SHA", "unknown");
        const { args } = fixture(policy);
        const source = "{ system { version gitHash gitUrl } }";
        const before = await run(new SdlSystemSubgraph(args), source, address);
        const after = await run(new SystemSubgraph(args), source, address);
        expect(after).toEqual(before);
        expect(after.errors).toBeUndefined();
        expect(after.data).toEqual({
          system: { version: "9.9.9-test", gitHash: "unknown", gitUrl: null },
        });
      });

      it(`keeps all package reads public for ${caller}`, async () => {
        const source = `{ Packages { installedPackages { ${selection} } installedPackage(name: "@example/pkg") { ${selection} } missing: installedPackage(name: "missing") { name } } }`;
        const beforeFixture = fixture(policy);
        const afterFixture = fixture(policy);
        const before = await run(
          new SdlPackagesSubgraph(beforeFixture.args),
          source,
          address,
        );
        const after = await run(
          new PackagesSubgraph(afterFixture.args),
          source,
          address,
        );
        expect(after).toEqual(before);
        expect(after.errors).toBeUndefined();
        expect(after.data).toEqual({
          Packages: {
            installedPackages: [packageResult],
            installedPackage: packageResult,
            missing: null,
          },
        });
        expect(
          afterFixture.service.getInstalledPackages,
        ).toHaveBeenCalledExactlyOnceWith();
        expect(afterFixture.service.getInstalledPackage.mock.calls).toEqual([
          ["@example/pkg"],
          ["missing"],
        ]);
      });

      for (const [argument, registryUrl] of [
        ["", undefined],
        [", registryUrl: null", undefined],
        [', registryUrl: "https://custom.example"', "https://custom.example"],
      ] as const) {
        it(`keeps install authorization and registry argument ${JSON.stringify(argument)} for ${caller}`, async () => {
          const source = `mutation { Packages { installPackage(name: "@example/pkg"${argument}) { package { ${selection} } documentModelsLoaded } } }`;
          const beforeFixture = fixture(policy);
          const afterFixture = fixture(policy);
          const before = await run(
            new SdlPackagesSubgraph(beforeFixture.args),
            source,
            address,
          );
          const after = await run(
            new PackagesSubgraph(afterFixture.args),
            source,
            address,
          );
          expect(after).toEqual(before);
          if (address === ADMIN || policy === AuthorizationPolicy.OPEN) {
            expect(after.errors).toBeUndefined();
            expect(after.data).toEqual({
              Packages: {
                installPackage: {
                  package: packageResult,
                  documentModelsLoaded: 2,
                },
              },
            });
            expect(
              afterFixture.service.installPackage,
            ).toHaveBeenCalledExactlyOnceWith("@example/pkg", registryUrl);
          } else {
            expect(after.data).toBeNull();
            expect(
              after.errors?.map(({ message, path }) => ({ message, path })),
            ).toEqual([
              {
                message: "Admin access required",
                path: ["Packages", "installPackage"],
              },
            ]);
            expect(afterFixture.service.installPackage).not.toHaveBeenCalled();
          }
        });
      }

      it(`keeps uninstall authorization for ${caller}`, async () => {
        const source =
          'mutation { Packages { uninstallPackage(name: "@example/pkg") } }';
        const beforeFixture = fixture(policy);
        const afterFixture = fixture(policy);
        const before = await run(
          new SdlPackagesSubgraph(beforeFixture.args),
          source,
          address,
        );
        const after = await run(
          new PackagesSubgraph(afterFixture.args),
          source,
          address,
        );
        expect(after).toEqual(before);
        if (address === ADMIN || policy === AuthorizationPolicy.OPEN) {
          expect(after.errors).toBeUndefined();
          expect(after.data).toEqual({ Packages: { uninstallPackage: true } });
          expect(
            afterFixture.service.uninstallPackage,
          ).toHaveBeenCalledExactlyOnceWith("@example/pkg");
        } else {
          expect(after.data).toBeNull();
          expect(
            after.errors?.map(({ message, path }) => ({ message, path })),
          ).toEqual([
            {
              message: "Admin access required",
              path: ["Packages", "uninstallPackage"],
            },
          ]);
          expect(afterFixture.service.uninstallPackage).not.toHaveBeenCalled();
        }
      });
    }
  });
}

it.each([
  [
    "getInstalledPackages",
    `{ Packages { installedPackages { name } } }`,
    "installedPackages",
    null,
  ],
  [
    "getInstalledPackage",
    `{ Packages { installedPackage(name: "@example/pkg") { name } } }`,
    "installedPackage",
    { Packages: { installedPackage: null } },
  ],
  [
    "installPackage",
    `mutation { Packages { installPackage(name: "@example/pkg") { documentModelsLoaded } } }`,
    "installPackage",
    null,
  ],
  [
    "uninstallPackage",
    `mutation { Packages { uninstallPackage(name: "@example/pkg") } }`,
    "uninstallPackage",
    null,
  ],
] as const)(
  "preserves %s service errors",
  async (method, source, field, data) => {
    const beforeFixture = fixture(AuthorizationPolicy.ADMIN_ONLY);
    const afterFixture = fixture(AuthorizationPolicy.ADMIN_ONLY);
    beforeFixture.service[method].mockRejectedValue(
      new Error("registry unavailable"),
    );
    afterFixture.service[method].mockRejectedValue(
      new Error("registry unavailable"),
    );
    const before = await run(
      new SdlPackagesSubgraph(beforeFixture.args),
      source,
      ADMIN,
    );
    const after = await run(
      new PackagesSubgraph(afterFixture.args),
      source,
      ADMIN,
    );
    expect(after).toEqual(before);
    expect(after.data).toEqual(data);
    expect(
      after.errors?.map(({ message, path }) => ({ message, path })),
    ).toEqual([{ message: "registry unavailable", path: ["Packages", field] }]);
  },
);
