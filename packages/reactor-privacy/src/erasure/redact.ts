import { isAddressLiteral } from "../read-model/subjects.js";
import { subjectHash, type DeploymentSecret } from "../subject-hash.js";

const IDENTIFIERS = /0x[0-9a-fA-F]{40}|did:key:z[1-9A-HJ-NP-Za-km-z]+/g;

/** Names of errors whose message embeds a caller identity of any shape. */
const IDENTITY_ERRORS = new Set(["AuthorizationDeniedError"]);

/** The keyed-hash form an identifier takes in the audit and item rows. */
export function hashedIdentifier(
  secret: DeploymentSecret,
  identifier: string,
): string {
  return `hmac:${subjectHash(secret, identifier)}`;
}

/** Stored form of requestedBy: hashed when it is an address. */
export function storedRequester(
  secret: DeploymentSecret,
  requestedBy: string,
): string {
  return isAddressLiteral(requestedBy)
    ? hashedIdentifier(secret, requestedBy)
    : redactText(secret, requestedBy);
}

export function redactText(secret: DeploymentSecret, text: string): string {
  return text.replace(IDENTIFIERS, (match) => hashedIdentifier(secret, match));
}

/** An error as the audit may hold it: its name, and a message with no address. */
export function redactError(
  secret: DeploymentSecret,
  error: { name?: string; message?: string },
): { name: string; message: string } {
  const name = error.name ?? "Error";
  const message = error.message ?? "";
  if (IDENTITY_ERRORS.has(name)) {
    return { name, message: hashedIdentifier(secret, message) };
  }
  return { name, message: redactText(secret, message) };
}

/** Every string in `value`, keys included, with identifiers hashed. */
export function redactDetail(
  secret: DeploymentSecret,
  value: unknown,
): unknown {
  if (typeof value === "string") return redactText(secret, value);
  if (Array.isArray(value)) return value.map((v) => redactDetail(secret, v));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [
        redactText(secret, key),
        redactDetail(secret, v),
      ]),
    );
  }
  return value;
}
