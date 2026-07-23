import type { AttachmentRef } from "@powerhousedao/reactor";
import type { IAttachmentReferenceReader } from "@powerhousedao/reactor-attachments";
import { describe, expect, it, vi } from "vitest";
import {
  AttachmentAccessService,
  type AttachmentReferenceProjectionCapability,
} from "../src/services/attachment-access.service.js";
import {
  createAuthorizationService,
  type AuthorizationConfig,
  type CanonicalDocumentId,
  type IAuthorizationService,
} from "../src/services/authorization.service.js";
import {
  CanonicalDocumentIdResolutionError,
  createCanonicalDocumentIdResolver,
  type CanonicalDocumentIdResolver,
} from "../src/services/canonical-document-id.js";
import type { DocumentPermissionService } from "../src/services/document-permission.service.js";

const HASH_A = "a".repeat(64);
const REF_A = `attachment://v1:${HASH_A}` as AttachmentRef;
const DOC_ID = "doc-1";
const USER = "0xuser";
const OWNER = "0xowner";
const ADMIN = "0xadmin";

const AVAILABLE: AttachmentReferenceProjectionCapability = {
  status: "available",
};
const UNAVAILABLE: AttachmentReferenceProjectionCapability = {
  status: "unavailable",
  reason: "live-read-model-registration-unsupported",
};

type Recorded = { calls: string[] };

function makeResolver(
  recorded: Recorded,
  result: string | Error = DOC_ID,
): CanonicalDocumentIdResolver {
  return (identifier: string) => {
    recorded.calls.push(`resolve:${identifier}`);
    if (result instanceof Error) return Promise.reject(result);
    return Promise.resolve(result as CanonicalDocumentId);
  };
}

function makeAuthorization(
  recorded: Recorded,
  canRead: boolean,
  canWrite = false,
): IAuthorizationService {
  return {
    config: { admins: [], defaultProtection: false, policy: "OPEN" },
    isSupremeAdmin: () => false,
    canCreate: () => true,
    canRead: (documentId: CanonicalDocumentId, userAddress?: string) => {
      recorded.calls.push(`canRead:${documentId}:${userAddress ?? ""}`);
      return Promise.resolve(canRead);
    },
    canWrite: (documentId: CanonicalDocumentId, userAddress?: string) => {
      recorded.calls.push(`canWrite:${documentId}:${userAddress ?? ""}`);
      return Promise.resolve(canWrite);
    },
    canManage: () => Promise.resolve(false),
    canMutate: () => Promise.resolve(false),
  };
}

function makeReader(
  recorded: Recorded,
  hasReference: boolean,
): IAttachmentReferenceReader {
  return {
    hasReference: (documentId: string, ref: AttachmentRef) => {
      recorded.calls.push(`hasReference:${documentId}:${ref}`);
      return Promise.resolve(hasReference);
    },
  };
}

function service(options: {
  recorded: Recorded;
  resolver?: CanonicalDocumentIdResolver;
  authorization?: IAuthorizationService;
  reader?: IAttachmentReferenceReader;
  projection?: AttachmentReferenceProjectionCapability;
}): AttachmentAccessService {
  return new AttachmentAccessService(
    options.resolver ?? makeResolver(options.recorded),
    options.authorization ?? makeAuthorization(options.recorded, true),
    options.reader ?? makeReader(options.recorded, true),
    options.projection ?? AVAILABLE,
  );
}

describe("AttachmentAccessService", () => {
  it("allows when the document is readable and the reference is indexed", async () => {
    const recorded: Recorded = { calls: [] };
    const access = service({ recorded });

    const result = await access.canReadAttachment({
      documentId: DOC_ID,
      attachmentRef: REF_A,
      userAddress: USER,
    });

    expect(result).toEqual({ kind: "allowed", documentId: DOC_ID, ref: REF_A });
    expect(recorded.calls).toEqual([
      `resolve:${DOC_ID}`,
      `canRead:${DOC_ID}:${USER}`,
      `hasReference:${DOC_ID}:${REF_A}`,
    ]);
  });

  it("resolves slugs through the canonical resolver before deciding", async () => {
    const recorded: Recorded = { calls: [] };
    const access = service({
      recorded,
      resolver: makeResolver(recorded, "canonical-id"),
    });

    const result = await access.canReadAttachment({
      documentId: "my-slug",
      attachmentRef: REF_A,
      userAddress: USER,
    });

    expect(result).toEqual({
      kind: "allowed",
      documentId: "canonical-id",
      ref: REF_A,
    });
    expect(recorded.calls).toEqual([
      "resolve:my-slug",
      `canRead:canonical-id:${USER}`,
      `hasReference:canonical-id:${REF_A}`,
    ]);
  });

  it("normalizes uppercase hex before querying the index", async () => {
    const recorded: Recorded = { calls: [] };
    const access = service({ recorded });

    const result = await access.canReadAttachment({
      documentId: DOC_ID,
      attachmentRef: `attachment://v1:${"A".repeat(64)}`,
      userAddress: USER,
    });

    expect(result).toEqual({ kind: "allowed", documentId: DOC_ID, ref: REF_A });
  });

  it.each([
    ["not a ref", "not-a-ref"],
    ["wrong scheme", `file://v1:${HASH_A}`],
    ["short hash", "attachment://v1:abc123"],
    ["non-hex hash", `attachment://v1:${"z".repeat(64)}`],
    ["unsupported version", `attachment://v2:${HASH_A}`],
    ["empty", ""],
  ])(
    "denies a malformed ref (%s) without any dependency call",
    async (_, ref) => {
      const recorded: Recorded = { calls: [] };
      const access = service({ recorded });

      const result = await access.canReadAttachment({
        documentId: DOC_ID,
        attachmentRef: ref,
        userAddress: USER,
      });

      expect(result).toEqual({ kind: "denied" });
      expect(recorded.calls).toEqual([]);
    },
  );

  it("denies when canonical resolution fails, without authorization or index calls", async () => {
    const recorded: Recorded = { calls: [] };
    const access = service({
      recorded,
      resolver: makeResolver(
        recorded,
        new CanonicalDocumentIdResolutionError(),
      ),
    });

    const result = await access.canReadAttachment({
      documentId: "missing-doc",
      attachmentRef: REF_A,
      userAddress: USER,
    });

    expect(result).toEqual({ kind: "denied" });
    expect(recorded.calls).toEqual(["resolve:missing-doc"]);
  });

  it("denies an unreadable document with zero reference-index calls", async () => {
    const recorded: Recorded = { calls: [] };
    const access = service({
      recorded,
      authorization: makeAuthorization(recorded, false),
    });

    const result = await access.canReadAttachment({
      documentId: DOC_ID,
      attachmentRef: REF_A,
      userAddress: USER,
    });

    expect(result).toEqual({ kind: "denied" });
    expect(recorded.calls).toEqual([
      `resolve:${DOC_ID}`,
      `canRead:${DOC_ID}:${USER}`,
    ]);
  });

  it("denies a relationship miss with the same result shape as an unreadable document", async () => {
    const recorded: Recorded = { calls: [] };
    const access = service({
      recorded,
      reader: makeReader(recorded, false),
    });

    const result = await access.canReadAttachment({
      documentId: DOC_ID,
      attachmentRef: REF_A,
      userAddress: USER,
    });

    expect(result).toEqual({ kind: "denied" });
  });

  it("propagates dependency errors instead of mapping them to a decision", async () => {
    const recorded: Recorded = { calls: [] };
    const reader: IAttachmentReferenceReader = {
      hasReference: () => Promise.reject(new Error("index outage")),
    };
    const access = service({ recorded, reader });

    await expect(
      access.canReadAttachment({
        documentId: DOC_ID,
        attachmentRef: REF_A,
        userAddress: USER,
      }),
    ).rejects.toThrow("index outage");
  });

  it("reports projection-unavailable before any dependency call", async () => {
    const recorded: Recorded = { calls: [] };
    const access = service({ recorded, projection: UNAVAILABLE });

    const result = await access.canReadAttachment({
      documentId: DOC_ID,
      attachmentRef: REF_A,
      userAddress: USER,
    });

    expect(result).toEqual({ kind: "projection-unavailable" });
    expect(recorded.calls).toEqual([]);
  });

  describe("with the real authorization strategies", () => {
    function permissionData(overrides: {
      isProtected?: boolean;
      owner?: string | null;
      grant?: "READ" | "WRITE" | "ADMIN" | null;
      parentGrant?: "READ" | "WRITE" | "ADMIN" | null;
    }): DocumentPermissionService {
      return {
        isProtectedWithAncestors: vi
          .fn()
          .mockResolvedValue(overrides.isProtected ?? true),
        getDocumentOwner: vi.fn().mockResolvedValue(overrides.owner ?? null),
        getUserPermission: vi
          .fn()
          .mockImplementation((documentId: string) =>
            Promise.resolve(
              documentId === "parent-1"
                ? (overrides.parentGrant ?? null)
                : (overrides.grant ?? null),
            ),
          ),
        isOperationRestricted: vi.fn().mockResolvedValue(false),
        hasOperationGrant: vi.fn().mockResolvedValue(false),
      } as unknown as DocumentPermissionService;
    }

    function permissionsService(
      permissions: DocumentPermissionService,
      parents: string[] = [],
    ): IAuthorizationService {
      const config: AuthorizationConfig = {
        admins: [ADMIN],
        defaultProtection: true,
        policy: "DOCUMENT_PERMISSIONS",
      };
      return createAuthorizationService(config, permissions, () =>
        Promise.resolve(parents),
      );
    }

    async function decide(
      authorization: IAuthorizationService,
      userAddress?: string,
    ) {
      const recorded: Recorded = { calls: [] };
      const access = service({ recorded, authorization });
      return access.canReadAttachment({
        documentId: DOC_ID,
        attachmentRef: REF_A,
        userAddress,
      });
    }

    it("allows everyone, including anonymous, under OPEN", async () => {
      const open = createAuthorizationService({
        admins: [],
        defaultProtection: false,
        policy: "OPEN",
      });
      await expect(decide(open, undefined)).resolves.toMatchObject({
        kind: "allowed",
      });
    });

    it("allows only admins under ADMIN_ONLY", async () => {
      const adminOnly = createAuthorizationService({
        admins: [ADMIN],
        defaultProtection: false,
        policy: "ADMIN_ONLY",
      });
      await expect(decide(adminOnly, ADMIN)).resolves.toMatchObject({
        kind: "allowed",
      });
      await expect(decide(adminOnly, USER)).resolves.toEqual({
        kind: "denied",
      });
      await expect(decide(adminOnly, undefined)).resolves.toEqual({
        kind: "denied",
      });
    });

    it("allows the supreme admin on a protected document", async () => {
      const auth = permissionsService(permissionData({ grant: null }));
      await expect(decide(auth, ADMIN)).resolves.toMatchObject({
        kind: "allowed",
      });
    });

    it("allows the document owner", async () => {
      const auth = permissionsService(permissionData({ owner: OWNER }));
      await expect(decide(auth, OWNER)).resolves.toMatchObject({
        kind: "allowed",
      });
    });

    it.each(["READ", "WRITE", "ADMIN"] as const)(
      "allows a %s grant holder",
      async (level) => {
        const auth = permissionsService(permissionData({ grant: level }));
        await expect(decide(auth, USER)).resolves.toMatchObject({
          kind: "allowed",
        });
      },
    );

    it("allows an inherited grant from a parent document", async () => {
      const auth = permissionsService(
        permissionData({ grant: null, parentGrant: "READ" }),
        ["parent-1"],
      );
      await expect(decide(auth, USER)).resolves.toMatchObject({
        kind: "allowed",
      });
    });

    it("allows any caller on an unprotected document", async () => {
      const auth = permissionsService(
        permissionData({ isProtected: false, grant: null }),
      );
      await expect(decide(auth, undefined)).resolves.toMatchObject({
        kind: "allowed",
      });
    });

    it("denies an anonymous caller on a protected document", async () => {
      const auth = permissionsService(permissionData({ grant: null }));
      await expect(decide(auth, undefined)).resolves.toEqual({
        kind: "denied",
      });
    });

    it("denies a grantless caller on a protected document", async () => {
      const auth = permissionsService(permissionData({ grant: null }));
      await expect(decide(auth, USER)).resolves.toEqual({ kind: "denied" });
    });
  });
});

describe("AttachmentAccessService.canAttachToDocument", () => {
  it("allows when the document is writable, resolving the canonical id first", async () => {
    const recorded: Recorded = { calls: [] };
    const access = service({
      recorded,
      resolver: makeResolver(recorded, "canonical-id"),
      authorization: makeAuthorization(recorded, true, true),
    });

    const result = await access.canAttachToDocument({
      documentId: "my-slug",
      userAddress: USER,
    });

    expect(result).toEqual({ kind: "allowed" });
    expect(recorded.calls).toEqual([
      "resolve:my-slug",
      `canWrite:canonical-id:${USER}`,
    ]);
  });

  it("passes an anonymous actor through to canWrite as undefined", async () => {
    const recorded: Recorded = { calls: [] };
    const access = service({
      recorded,
      authorization: makeAuthorization(recorded, true, true),
    });

    const result = await access.canAttachToDocument({ documentId: DOC_ID });

    expect(result).toEqual({ kind: "allowed" });
    expect(recorded.calls).toEqual([
      `resolve:${DOC_ID}`,
      `canWrite:${DOC_ID}:`,
    ]);
  });

  it("denies when the document is not writable", async () => {
    const recorded: Recorded = { calls: [] };
    const access = service({
      recorded,
      authorization: makeAuthorization(recorded, true, false),
    });

    const result = await access.canAttachToDocument({
      documentId: DOC_ID,
      userAddress: USER,
    });

    expect(result).toEqual({ kind: "denied" });
  });

  it("denies when canonical resolution fails, without an authorization call", async () => {
    const recorded: Recorded = { calls: [] };
    const access = service({
      recorded,
      resolver: makeResolver(
        recorded,
        new CanonicalDocumentIdResolutionError(),
      ),
      authorization: makeAuthorization(recorded, true, true),
    });

    const result = await access.canAttachToDocument({
      documentId: "missing-doc",
      userAddress: USER,
    });

    expect(result).toEqual({ kind: "denied" });
    expect(recorded.calls).toEqual(["resolve:missing-doc"]);
  });

  it("decides even when the reference projection is unavailable", async () => {
    // Uploads never consult the reference index, so projection health is
    // irrelevant to the attach decision.
    const recorded: Recorded = { calls: [] };
    const access = service({
      recorded,
      projection: UNAVAILABLE,
      authorization: makeAuthorization(recorded, true, true),
    });

    await expect(
      access.canAttachToDocument({ documentId: DOC_ID, userAddress: USER }),
    ).resolves.toEqual({ kind: "allowed" });
  });

  it("allows anonymous writers on an unprotected document under DOCUMENT_PERMISSIONS", async () => {
    const permissions = {
      isProtectedWithAncestors: vi.fn().mockResolvedValue(false),
      getDocumentOwner: vi.fn().mockResolvedValue(null),
      getUserPermission: vi.fn().mockResolvedValue(null),
      isOperationRestricted: vi.fn().mockResolvedValue(false),
      hasOperationGrant: vi.fn().mockResolvedValue(false),
    } as unknown as DocumentPermissionService;
    const auth = createAuthorizationService(
      {
        admins: [ADMIN],
        defaultProtection: true,
        policy: "DOCUMENT_PERMISSIONS",
      },
      permissions,
      () => Promise.resolve([]),
    );
    const recorded: Recorded = { calls: [] };
    const access = service({ recorded, authorization: auth });

    await expect(
      access.canAttachToDocument({ documentId: DOC_ID }),
    ).resolves.toEqual({ kind: "allowed" });
  });

  it("denies anonymous writers on a protected document under DOCUMENT_PERMISSIONS", async () => {
    const permissions = {
      isProtectedWithAncestors: vi.fn().mockResolvedValue(true),
      getDocumentOwner: vi.fn().mockResolvedValue(null),
      getUserPermission: vi.fn().mockResolvedValue(null),
      isOperationRestricted: vi.fn().mockResolvedValue(false),
      hasOperationGrant: vi.fn().mockResolvedValue(false),
    } as unknown as DocumentPermissionService;
    const auth = createAuthorizationService(
      {
        admins: [ADMIN],
        defaultProtection: true,
        policy: "DOCUMENT_PERMISSIONS",
      },
      permissions,
      () => Promise.resolve([]),
    );
    const recorded: Recorded = { calls: [] };
    const access = service({ recorded, authorization: auth });

    await expect(
      access.canAttachToDocument({ documentId: DOC_ID }),
    ).resolves.toEqual({ kind: "denied" });
  });
});

describe("createCanonicalDocumentIdResolver", () => {
  it("returns the resolved id as the canonical id", async () => {
    const resolver = createCanonicalDocumentIdResolver({
      resolveIdOrSlug: () => Promise.resolve("resolved-id"),
    });
    await expect(resolver("slug")).resolves.toBe("resolved-id");
  });

  it("maps any resolution failure to a detail-free typed error", async () => {
    const resolver = createCanonicalDocumentIdResolver({
      resolveIdOrSlug: () =>
        Promise.reject(new Error("document xyz was not found in table t")),
    });
    await expect(resolver("slug")).rejects.toBeInstanceOf(
      CanonicalDocumentIdResolutionError,
    );
    await expect(resolver("slug")).rejects.not.toThrow(/xyz/);
  });
});
