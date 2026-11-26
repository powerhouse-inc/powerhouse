import type * as DocumentModel from "document-model";
import { describe, expect, it, vi } from "vitest";
import type { PackageManagementService } from "../src/services/package-management.service.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "../src/services/authorization.service.js";
import type { Context } from "../src/graphql/types.js";

const info = vi.hoisted(() => vi.fn());

vi.mock("document-model", async (importOriginal) => {
  const actual = await importOriginal<typeof DocumentModel>();
  const logger = {
    info,
    debug: vi.fn(),
    verbose: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return { ...actual, childLogger: () => logger };
});

const { installPackage, uninstallPackage } =
  await import("../src/graphql/packages/resolvers.js");

const ADMIN = "0x00000000000000000000000000000000000000ad";

function service(): PackageManagementService {
  return {
    installPackage: vi.fn(() =>
      Promise.resolve({
        package: {
          name: "@scope/pkg",
          version: "1.0.0",
          registryUrl: "https://registry.test",
          installedAt: new Date(0),
          documentTypes: [],
        },
        documentModelsLoaded: 0,
      }),
    ),
    uninstallPackage: vi.fn(() => Promise.resolve(true)),
  } as unknown as PackageManagementService;
}

const authorization = createAuthorizationService({
  admins: [ADMIN],
  defaultProtection: false,
  policy: AuthorizationPolicy.ADMIN_ONLY,
});

describe("package administration", () => {
  it("logs each install and uninstall with the admin's address and session", async () => {
    info.mockClear();
    const ctx = {
      user: { address: ADMIN, label: "vetra agent x" },
    } as unknown as Context;

    await installPackage(
      service(),
      authorization,
      { name: "@scope/pkg", registryUrl: "https://registry.test" },
      ctx,
    );
    await uninstallPackage(
      service(),
      authorization,
      { name: "@scope/pkg" },
      ctx,
    );

    expect(info.mock.calls).toEqual([
      [
        "Administration: @action by @administrator",
        "installed package @scope/pkg from https://registry.test",
        `${ADMIN} (vetra agent x)`,
      ],
      [
        "Administration: @action by @administrator",
        "uninstalled package @scope/pkg",
        `${ADMIN} (vetra agent x)`,
      ],
    ]);
  });

  it("logs nothing for a caller it refuses", async () => {
    info.mockClear();
    await expect(
      installPackage(service(), authorization, { name: "@scope/pkg" }, {
        user: { address: "0xother" },
      } as unknown as Context),
    ).rejects.toThrow("Admin access required");
    expect(info).not.toHaveBeenCalled();
  });
});
