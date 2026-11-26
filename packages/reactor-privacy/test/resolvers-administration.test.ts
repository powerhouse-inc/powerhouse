import { describe, expect, it, vi } from "vitest";
import type { Disclosure } from "../src/disclosure/disclosure-service.js";
import type { ErasureRequest, IErasureService } from "../src/erasure/types.js";
import { createPrivacyResolvers } from "../src/subgraph/resolvers.js";

const ADMIN = "0x00000000000000000000000000000000000000aa";

function resolvers() {
  const logger = { info: vi.fn() };
  const request: ErasureRequest = {
    requestId: "req-1",
    subjectHash: null,
    requestedBy: "hashed",
    requestedAt: new Date(0),
    deadline: new Date(0),
    status: "pending" as ErasureRequest["status"],
    items: [],
  };
  const erasure = {
    plan: vi.fn(),
    request: vi.fn(() => Promise.resolve(request)),
    status: vi.fn(),
  } as unknown as IErasureService;
  const disclosure = {
    disclose: vi.fn(() =>
      Promise.resolve({ permissions: [] } as unknown as Disclosure),
    ),
  };
  const created = createPrivacyResolvers({
    authorizationService: {
      config: { policy: "ADMIN_ONLY" },
      isSupremeAdmin: (address) => address === ADMIN,
      isOperator: (address) => address === ADMIN,
    },
    erasure,
    disclosure,
    logger,
  });
  return { ...created, logger };
}

const admin = { user: { address: ADMIN, label: "vetra agent x" } };

describe("the privacy subgraph's administration log", () => {
  it("logs an erasure request with who asked, naming the request and not the ids", async () => {
    const { Mutation, logger } = resolvers();
    await Mutation.requestErasure({}, { ids: ["doc-1", "doc-2"] }, admin);
    expect(logger.info).toHaveBeenCalledWith(
      "Administration: @action by @administrator",
      "requested erasure req-1 (2 ids)",
      `${ADMIN} (vetra agent x)`,
    );
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain("doc-1");
  });

  it("logs a disclosure without naming its subject", async () => {
    const { Query, logger } = resolvers();
    await Query.disclose({}, { identifier: "alice@example.com" }, admin);
    expect(logger.info).toHaveBeenCalledWith(
      "Administration: @action by @administrator",
      "disclosed what is held of a subject",
      `${ADMIN} (vetra agent x)`,
    );
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain("alice");
  });

  it("logs nothing for a refused caller", async () => {
    const { Mutation, logger } = resolvers();
    await expect(
      Mutation.requestErasure({}, { ids: ["doc-1"] }, {}),
    ).rejects.toThrow("Admin access required");
    expect(logger.info).not.toHaveBeenCalled();
  });
});
