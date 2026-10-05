import {
  groupDocumentType,
  groupMembershipActionTypes,
  type Operand,
  type OperationWithContext,
} from "@powerhousedao/shared/document-model";
import type { SubjectRole } from "../schema/tables.js";

export type SubjectMention = { identifier: string; role: SubjectRole };

/** A stored signer, read without trusting its shape. */
export type StoredSigner = {
  user?: { address?: unknown };
  app?: { key?: unknown };
};

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ETH_ADDRESS = /^0x[0-9a-f]{40}$/i;
const DID_KEY = /^did:key:z[1-9A-HJ-NP-Za-km-z]+$/;

/** A condition literal counts as an identifier only in these two shapes. */
export function isAddressLiteral(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (ETH_ADDRESS.test(value) || DID_KEY.test(value))
  );
}

function base58Encode(bytes: Uint8Array): string {
  const digits: number[] = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let out = "";
  for (let k = 0; k < bytes.length && bytes[k] === 0; k++) out += "1";
  for (let i = digits.length - 1; i >= 0; i--) out += BASE58[digits[i]];
  return out;
}

function base64UrlDecode(value: string): Uint8Array | undefined {
  try {
    return new Uint8Array(Buffer.from(value, "base64url"));
  } catch {
    return undefined;
  }
}

/** The did:key of a P-256 JWK, the form an app key takes; else undefined. */
export function jwkToDidKey(jwk: unknown): string | undefined {
  if (typeof jwk !== "object" || jwk === null) return undefined;
  const { kty, crv, x, y } = jwk as JsonWebKey;
  if (kty !== "EC" || crv !== "P-256") return undefined;
  if (typeof x !== "string" || typeof y !== "string") return undefined;
  const xBytes = base64UrlDecode(x);
  const yBytes = base64UrlDecode(y);
  if (xBytes?.length !== 32 || yBytes?.length !== 32) return undefined;
  const compressed = new Uint8Array(35);
  compressed[0] = 0x80;
  compressed[1] = 0x24;
  compressed[2] = (yBytes[31] & 1) === 1 ? 0x03 : 0x02;
  compressed.set(xBytes, 3);
  return `did:key:z${base58Encode(compressed)}`;
}

function operandLiterals(operand: Operand | undefined, out: string[]): void {
  if (operand === undefined || typeof operand !== "object") return;
  if ("lit" in operand && isAddressLiteral(operand.lit)) out.push(operand.lit);
}

function conditionLiterals(condition: unknown, out: string[]): void {
  if (typeof condition !== "object" || condition === null) return;
  const c = condition as Record<string, unknown>;
  for (const key of ["eq", "ne", "lt", "lte", "gt", "gte"]) {
    const pair = c[key];
    if (Array.isArray(pair)) {
      for (const operand of pair) operandLiterals(operand as Operand, out);
    }
  }
  for (const key of ["in", "notIn"]) {
    const pair = c[key];
    if (!Array.isArray(pair)) continue;
    operandLiterals(pair[0] as Operand, out);
    if (Array.isArray(pair[1])) {
      for (const operand of pair[1]) operandLiterals(operand as Operand, out);
    }
  }
  if ("exists" in c) operandLiterals(c.exists as Operand, out);
  for (const key of ["and", "or"]) {
    const list = c[key];
    if (Array.isArray(list)) {
      for (const inner of list) conditionLiterals(inner, out);
    }
  }
  if ("not" in c) conditionLiterals(c.not, out);
}

function grantMentions(grant: unknown, out: string[]): void {
  if (typeof grant !== "object" || grant === null) return;
  const { principal, where } = grant as {
    principal?: unknown;
    where?: unknown;
  };
  if (typeof principal === "object" && principal !== null) {
    const { address, match } = principal as {
      address?: unknown;
      match?: unknown;
    };
    if (typeof address === "string" && address !== "") out.push(address);
    conditionLiterals(match, out);
  }
  conditionLiterals(where, out);
}

/** Identifiers named in an action's input, by the spec's three sources. */
export function namedIn({
  operation,
  context,
}: OperationWithContext): string[] {
  const { type, input } = operation.action;
  const out: string[] = [];
  if (typeof input !== "object" || input === null) return out;
  const record = input as Record<string, unknown>;
  if (type === "INITIALIZE_AUTH" && Array.isArray(record.grants)) {
    for (const grant of record.grants) grantMentions(grant, out);
  } else if (type === "SET_GRANT") {
    grantMentions(record.grant, out);
  } else if (
    context.documentType === groupDocumentType &&
    (groupMembershipActionTypes as readonly string[]).includes(type) &&
    typeof record.address === "string" &&
    record.address !== ""
  ) {
    out.push(record.address);
  }
  return out;
}

/** Every mention an operation carries, except `creator` (needs the header). */
export function mentionsOf(item: OperationWithContext): SubjectMention[] {
  const mentions: SubjectMention[] = [];
  const signer = item.operation.action.context?.signer as
    | StoredSigner
    | undefined;
  const address = signer?.user?.address;
  if (typeof address === "string" && address !== "") {
    mentions.push({ identifier: address, role: "signer" });
  }
  const appKey = signer?.app?.key;
  if (typeof appKey === "string" && appKey !== "") {
    mentions.push({ identifier: appKey, role: "app-key" });
  }
  if (item.operation.action.type === "CREATE_DOCUMENT") {
    const input = item.operation.action.input as
      | { signing?: { publicKey?: unknown } }
      | undefined;
    const signing = input?.signing;
    const headerKey = jwkToDidKey(signing?.publicKey);
    if (headerKey !== undefined) {
      mentions.push({ identifier: headerKey, role: "header-key" });
    }
  }
  for (const identifier of namedIn(item)) {
    mentions.push({ identifier, role: "named" });
  }
  return mentions;
}
