import { compilerDiagnostics } from "./diagnostic-codes.js";
import type {
  DefinitionDiagnostic,
  DefinitionPath,
} from "@powerhousedao/shared/document-model";
import { uuidV5 } from "../kernel/hashes.js";
import { canonicalJson, isNFC } from "../kernel/primitives.js";

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

type DefinitionIdentityResult =
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

const IDENTITY_KEY_SEPARATOR = "/";

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
        diagnostic: compilerDiagnostics.create({
          code: "PH-DM-IDENTITY-INVALID",
          path: [...path, field],
          message: `${field} "${escapeNonAscii(value)}" is not in Unicode NFC, so its derived ID would depend on how the source was encoded.`,
          expected: "an identity segment already in Unicode NFC",
          received: `"${escapeNonAscii(value)}"`,
          repair: `Rewrite ${field} in the source as "${escapeNonAscii(value.normalize("NFC"))}".`,
        }),
      };
    }
    if (field !== "documentType" && value.includes(IDENTITY_KEY_SEPARATOR)) {
      return {
        ok: false,
        diagnostic: compilerDiagnostics.create({
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
