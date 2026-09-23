import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { createHmac } from "node:crypto";

export type SubjectRole =
  | "signer"
  | "app-key"
  | "creator"
  | "header-key"
  | "named";

export type SubjectMention = { identifier: string; role: SubjectRole };

export const GROUP_DOCUMENT_TYPE = "powerhouse/reactor-group";

const ADDRESS = /^0x[0-9a-f]{40}$/i;
const DID_PKH_ADDRESS = /^did:pkh:[^:]+:[^:]+:(0x[0-9a-f]{40})$/i;

/** Keyed, so the index and audit log cannot confirm a guessed address. */
export function subjectHash(secret: string, identifier: string): string {
  return createHmac("sha256", secret)
    .update(identifier.trim().toLowerCase())
    .digest("hex");
}

/** A JWK in a stable form: the identifier the header-key role is indexed by. */
export function jwkIdentifier(jwk: object): string {
  const sorted = Object.keys(jwk)
    .sort()
    .map((key) => [key, (jwk as Record<string, unknown>)[key]]);
  return JSON.stringify(Object.fromEntries(sorted));
}

/** The address a string names, if it names one. */
export function asAddress(value: string): string | undefined {
  if (ADDRESS.test(value)) return value;
  return DID_PKH_ADDRESS.exec(value)?.[1];
}

function addressesIn(value: unknown, found: Set<string>): void {
  if (typeof value === "string") {
    const address = asAddress(value);
    if (address) found.add(address);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) addressesIn(item, found);
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) addressesIn(item, found);
  }
}

/** Every identifier an operation carries, and the role it carries it in. */
export function mentionsIn(item: OperationWithContext): SubjectMention[] {
  const { action } = item.operation;
  const mentions: SubjectMention[] = [];
  const signer = action.context?.signer;

  if (signer?.user.address) {
    mentions.push({ identifier: signer.user.address, role: "signer" });
  }
  if (signer?.app.key) {
    mentions.push({ identifier: signer.app.key, role: "app-key" });
    if (action.type === "INITIALIZE_AUTH") {
      mentions.push({ identifier: signer.app.key, role: "creator" });
    }
  }

  if (action.type === "CREATE_DOCUMENT") {
    const publicKey = (action.input as { signing?: { publicKey?: object } })
      .signing?.publicKey;
    if (publicKey && Object.keys(publicKey).length > 0) {
      mentions.push({
        identifier: jwkIdentifier(publicKey),
        role: "header-key",
      });
    }
  }

  // Grant principals, condition literals and group members.
  if (
    item.context.scope === "auth" ||
    item.context.documentType === GROUP_DOCUMENT_TYPE
  ) {
    const named = new Set<string>();
    addressesIn(action.input, named);
    for (const identifier of named) {
      mentions.push({ identifier, role: "named" });
    }
  }

  return mentions;
}
