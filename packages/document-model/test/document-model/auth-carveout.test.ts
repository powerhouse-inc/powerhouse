import type {
  AuthRequest,
  PHAuthState,
} from "@powerhousedao/shared/document-model";
import {
  base58Decode,
  base64UrlToBytes,
  decide,
  isDocumentCreator,
} from "@powerhousedao/shared/document-model";

// Canonical did:key <-> JWK pairs for the same P-256 keys, produced by
// @didtools/key-webcrypto (the encoder that createSignedHeader feeds).
const CREATOR_DID = "did:key:zDnaexNjCKnPLh5Vhn1KqjmrLDFtXddrtTTE9gJmdWRSCG3wt";
const CREATOR_JWK = {
  kty: "EC",
  crv: "P-256",
  x: "2qGULg46dKXbnsPdvI4AxOHiw94xJRDVAWuyHIyyGd8",
  y: "V_jbfJ-wVhoUspPM9epxaJHUs_6TyMfrOgwB2Kcx170",
};
const OTHER_DID = "did:key:zDnaefv2pj8YQM2T6E3pnrJoGnDGbXsrvJiXhqHzh7d5RzncU";

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

describe("base58Decode", () => {
  it("decodes a did:key P-256 multicodec payload", () => {
    const decoded = base58Decode(CREATOR_DID.slice("did:key:z".length));
    expect(decoded).not.toBeNull();
    expect(decoded!.length).toBe(35); // 2-byte multicodec + 33-byte compressed point
    expect(decoded![0]).toBe(0x80);
    expect(decoded![1]).toBe(0x24);
  });

  it("returns null for characters outside the alphabet", () => {
    expect(base58Decode("0OIl")).toBeNull();
  });
});

describe("isDocumentCreator", () => {
  it("matches a signer key against the creator JWK", () => {
    expect(isDocumentCreator(CREATOR_JWK, CREATOR_DID)).toBe(true);
  });

  it("returns false when there is no creator (empty JWK)", () => {
    expect(isDocumentCreator({}, CREATOR_DID)).toBe(false);
  });

  it("returns false without a signer key", () => {
    expect(isDocumentCreator(CREATOR_JWK, undefined)).toBe(false);
  });

  it("returns false for a different key", () => {
    expect(isDocumentCreator(CREATOR_JWK, OTHER_DID)).toBe(false);
  });

  it("returns false when the y parity does not match", () => {
    const y = base64UrlToBytes(CREATOR_JWK.y);
    y[31] ^= 1; // flip the parity of the last byte
    expect(
      isDocumentCreator({ ...CREATOR_JWK, y: base64UrlEncode(y) }, CREATOR_DID),
    ).toBe(false);
  });

  it("returns false for a malformed did", () => {
    expect(isDocumentCreator(CREATOR_JWK, "did:key:abc")).toBe(false);
    expect(isDocumentCreator(CREATOR_JWK, "not-a-did")).toBe(false);
  });
});

describe("decide auth-scope carve-out", () => {
  const denyAll: PHAuthState = {
    version: 1,
    creator: CREATOR_DID,
    grants: [
      {
        id: "lockdown",
        description: "deny everything",
        effect: "deny",
        principal: { anyone: true },
        capability: { can: "execute", scope: "*" },
      },
    ],
  };
  const authExecute: AuthRequest = {
    verb: "execute",
    scope: "auth",
    operation: "SET_GRANT",
  };

  it("lets the creator execute auth-scope ops despite a deny-all policy", () => {
    expect(decide(denyAll, { key: CREATOR_DID }, authExecute)).toBe("allow");
  });

  it("does not extend the creator carve-out beyond the auth scope", () => {
    expect(
      decide(
        denyAll,
        { key: CREATOR_DID },
        {
          verb: "execute",
          scope: "global",
          operation: "SET_STATUS",
        },
      ),
    ).toBe("deny");
  });

  it("denies a non-creator auth-scope op under a deny-all policy", () => {
    expect(decide(denyAll, { key: OTHER_DID }, authExecute)).toBe("deny");
  });

  it("does not match when no creator is recorded", () => {
    const noCreator: PHAuthState = { version: 1, grants: denyAll.grants };
    expect(decide(noCreator, { key: CREATOR_DID }, authExecute)).toBe("deny");
    expect(decide(noCreator, {}, authExecute)).toBe("deny");
  });

  it("lets a supreme admin execute auth-scope ops", () => {
    expect(
      decide(denyAll, { address: "0xADMIN" }, authExecute, {
        admins: ["0xadmin"],
      }),
    ).toBe("allow");
  });
});
