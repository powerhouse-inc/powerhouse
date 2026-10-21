import type {
  DefinitionDiagnostic,
  DefinitionPath,
} from "@powerhousedao/shared/document-model";
import { createDiagnostic } from "./diagnostics.js";
import { canonicalJson, isNFC } from "./primitives.js";

export const DOCUMENT_MODEL_IDENTITY_NAMESPACE =
  "f80a5a40-200a-5996-b2af-2c0996a4135e";

export type DefinitionIdentityRequest =
  | {
      readonly kind: "module";
      readonly documentType: string;
      readonly moduleKey: string;
    }
  | {
      readonly kind: "operation";
      readonly documentType: string;
      readonly moduleKey: string;
      readonly operationKey: string;
    }
  | {
      readonly kind: "error";
      readonly documentType: string;
      readonly moduleKey: string;
      readonly operationKey: string;
      readonly errorKey: string;
    }
  | {
      readonly kind: "state-example";
      readonly documentType: string;
      readonly scope: "global" | "local";
      readonly exampleKey: string;
    }
  | {
      readonly kind: "operation-example";
      readonly documentType: string;
      readonly moduleKey: string;
      readonly operationKey: string;
      readonly exampleKey: string;
    };

export type DefinitionIdentityResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly diagnostic: DefinitionDiagnostic };

type Segment = readonly [field: string, value: string];

function segments(request: DefinitionIdentityRequest): readonly Segment[] {
  switch (request.kind) {
    case "module":
      return [["moduleKey", request.moduleKey]];
    case "operation":
      return [
        ["moduleKey", request.moduleKey],
        ["operationKey", request.operationKey],
      ];
    case "error":
      return [
        ["moduleKey", request.moduleKey],
        ["operationKey", request.operationKey],
        ["errorKey", request.errorKey],
      ];
    case "state-example":
      return [
        ["scope", request.scope],
        ["exampleKey", request.exampleKey],
      ];
    case "operation-example":
      return [
        ["moduleKey", request.moduleKey],
        ["operationKey", request.operationKey],
        ["exampleKey", request.exampleKey],
      ];
  }
}

function escapeNonAscii(value: string): string {
  return [...value]
    .map((point) => {
      const code = point.codePointAt(0) ?? 0;
      return code >= 0x20 && code <= 0x7e ? point : `\\u{${code.toString(16)}}`;
    })
    .join("");
}

export const IDENTITY_KEY_SEPARATOR = "/";

/**
 * The identity path of one specification item: `module/lineItems`,
 * `operation/lineItems/addLineItem`,
 * `error/lineItems/addLineItem/InvoiceAlreadyIssued`,
 * `state-example/global/empty`, or
 * `operation-example/lineItems/addLineItem/item`.
 *
 * The same grammar keys the identity vectors an adapter extracts and the
 * compatibility map a migrated declaration carries, so the two are readable
 * against each other.
 */
export function definitionIdentityKey(
  request: DefinitionIdentityRequest,
): string {
  return [request.kind, ...segments(request).map(([, value]) => value)].join(
    IDENTITY_KEY_SEPARATOR,
  );
}

export function deriveDefinitionId(
  request: DefinitionIdentityRequest,
  path: DefinitionPath = [],
): DefinitionIdentityResult {
  const fields: readonly Segment[] = [
    ["documentType", request.documentType],
    ...segments(request),
  ];
  for (const [field, value] of fields) {
    if (!isNFC(value)) {
      return {
        ok: false,
        diagnostic: createDiagnostic({
          code: "PH-DM-IDENTITY-INVALID",
          path: [...path, field],
          message: `${field} "${escapeNonAscii(value)}" is not in Unicode NFC, so its derived ID would depend on how the source was encoded.`,
          expected: "an identity segment already in Unicode NFC",
          received: `"${escapeNonAscii(value)}"`,
          repair: `Rewrite ${field} in the source as "${escapeNonAscii(value.normalize("NFC"))}".`,
        }),
      };
    }
    // The document type is not part of an identity key, and every document
    // type in this repository carries a slash.
    if (field !== "documentType" && value.includes(IDENTITY_KEY_SEPARATOR)) {
      // `definitionIdentityKey` joins the segments with a slash, and a
      // compatibility map is keyed by that string. A segment carrying the
      // separator would make two different items share one key.
      return {
        ok: false,
        diagnostic: createDiagnostic({
          code: "PH-DM-IDENTITY-INVALID",
          path: [...path, field],
          message: `${field} ${JSON.stringify(value)} contains ${JSON.stringify(IDENTITY_KEY_SEPARATOR)}, which separates the segments of an identity key.`,
          expected: `a ${field} without ${JSON.stringify(IDENTITY_KEY_SEPARATOR)}`,
          received: value,
          repair: `Rename it without ${JSON.stringify(IDENTITY_KEY_SEPARATOR)}; a compatibility map is keyed by the joined identity path.`,
        }),
      };
    }
  }
  const tuple = [
    "powerhouse.document-model.identity",
    1,
    request.documentType,
    request.kind,
    ...fields.slice(1).map(([, value]) => value),
  ];
  return {
    ok: true,
    id: uuidV5(DOCUMENT_MODEL_IDENTITY_NAMESPACE, canonicalJson(tuple)),
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidBytes(uuid: string): Uint8Array {
  if (!UUID_PATTERN.test(uuid)) {
    throw new TypeError(
      `UUID namespace ${JSON.stringify(uuid)} is not canonical.`,
    );
  }
  const hex = uuid.replaceAll("-", "");
  return Uint8Array.from({ length: 16 }, (_, index) =>
    Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
  );
}

function formatUuid(bytes: Uint8Array): string {
  const hex = [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function uuidV5(namespace: string, name: string | Uint8Array): string {
  const namespaceBytes = uuidBytes(namespace);
  const nameBytes =
    typeof name === "string" ? new TextEncoder().encode(name) : name;
  const input = new Uint8Array(namespaceBytes.length + nameBytes.length);
  input.set(namespaceBytes);
  input.set(nameBytes, namespaceBytes.length);
  const digest = sha1(input).slice(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  return formatUuid(digest);
}

function rotateLeft(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function sha1(bytes: Uint8Array): Uint8Array {
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const input = new Uint8Array(paddedLength);
  input.set(bytes);
  input[bytes.length] = 0x80;
  const view = new DataView(input.buffer);
  const bitLength = BigInt(bytes.length) * 8n;
  view.setUint32(paddedLength - 8, Number(bitLength >> 32n), false);
  view.setUint32(paddedLength - 4, Number(bitLength & 0xffff_ffffn), false);

  const state = new Uint32Array([
    0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0,
  ]);
  const words = new Uint32Array(80);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 80; index += 1) {
      words[index] = rotateLeft(
        words[index - 3] ^
          words[index - 8] ^
          words[index - 14] ^
          words[index - 16],
        1,
      );
    }

    let a = state[0];
    let b = state[1];
    let c = state[2];
    let d = state[3];
    let e = state[4];

    for (let index = 0; index < 80; index += 1) {
      let f: number;
      let k: number;
      if (index < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (index < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (index < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const next = (rotateLeft(a, 5) + f + e + k + words[index]) >>> 0;
      e = d;
      d = c;
      c = rotateLeft(b, 30);
      b = a;
      a = next;
    }

    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
  }

  const digest = new Uint8Array(20);
  const digestView = new DataView(digest.buffer);
  state.forEach((word, index) => {
    digestView.setUint32(index * 4, word, false);
  });
  return digest;
}
