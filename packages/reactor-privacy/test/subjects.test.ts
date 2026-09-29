import { groupDocumentType } from "@powerhousedao/shared/document-model";
import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { jwkToDidKey, mentionsOf } from "../index.js";
import { createP256Signer } from "./utils/p256-signer.js";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";

function item(
  type: string,
  input: unknown,
  documentType = "powerhouse/document-drive",
): OperationWithContext {
  return {
    operation: {
      id: "op",
      index: 0,
      skip: 0,
      timestampUtcMs: new Date().toISOString(),
      hash: "",
      action: {
        id: "a",
        type,
        scope: "auth",
        timestampUtcMs: new Date().toISOString(),
        input,
      },
    },
    context: {
      documentId: "doc",
      documentType,
      scope: "auth",
      branch: "main",
      ordinal: 1,
    },
  } as OperationWithContext;
}

describe("mentionsOf", () => {
  it("reads grant principals and address literals in match and where", () => {
    const mentions = mentionsOf(
      item("SET_GRANT", {
        grant: {
          id: "g",
          description: "",
          effect: "allow",
          principal: {
            match: {
              and: [
                { eq: [{ attr: "subject.address" }, { lit: ADDRESS }] },
                {
                  not: {
                    in: [{ attr: "x" }, [{ lit: "plain" }, { lit: OTHER }]],
                  },
                },
              ],
            },
          },
          capability: { can: "read" },
          where: { ne: [{ lit: "did:key:zDnaeTest" }, { lit: 3 }] },
        },
      }),
    );
    expect(mentions).toEqual([
      { identifier: ADDRESS, role: "named" },
      { identifier: OTHER, role: "named" },
      { identifier: "did:key:zDnaeTest", role: "named" },
    ]);
  });

  it("reads every INITIALIZE_AUTH grant's address principal", () => {
    const mentions = mentionsOf(
      item("INITIALIZE_AUTH", {
        version: 1,
        grants: [
          { principal: { address: ADDRESS } },
          { principal: { anyone: true } },
          { principal: { group: "group-doc" } },
        ],
      }),
    );
    expect(mentions).toEqual([{ identifier: ADDRESS, role: "named" }]);
  });

  it("reads reactor-group members only on group documents", () => {
    expect(
      mentionsOf(item("ADD_MEMBER", { address: ADDRESS }, groupDocumentType)),
    ).toEqual([{ identifier: ADDRESS, role: "named" }]);
    expect(
      mentionsOf(item("REMOVE_MEMBER", { address: OTHER }, groupDocumentType)),
    ).toEqual([{ identifier: OTHER, role: "named" }]);
    expect(mentionsOf(item("ADD_MEMBER", { address: ADDRESS }))).toEqual([]);
  });

  it("ignores malformed inputs", () => {
    expect(mentionsOf(item("SET_GRANT", null))).toEqual([]);
    expect(mentionsOf(item("SET_GRANT", { grant: { principal: 7 } }))).toEqual(
      [],
    );
    expect(
      mentionsOf(item("INITIALIZE_AUTH", { grants: [null, "x"] })),
    ).toEqual([]);
  });
});

describe("jwkToDidKey", () => {
  it("encodes a P-256 JWK as the did:key its app key carries", async () => {
    const signer = await createP256Signer(ADDRESS);
    expect(jwkToDidKey(signer.jwk)).toBe(signer.did);
  });

  it("returns undefined for an empty or foreign key", () => {
    expect(jwkToDidKey({})).toBeUndefined();
    expect(
      jwkToDidKey({ kty: "OKP", crv: "Ed25519", x: "abc" }),
    ).toBeUndefined();
    expect(
      jwkToDidKey({ kty: "EC", crv: "P-256", x: "x", y: "y" }),
    ).toBeUndefined();
  });
});
