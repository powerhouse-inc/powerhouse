import { createHmac } from "node:crypto";

/** Shorter keys make the HMAC guessable along with the address. */
export const MIN_DEPLOYMENT_SECRET_BYTES = 32;

export class DeploymentSecretError extends Error {
  constructor() {
    super(
      `The privacy deployment secret must be at least ${MIN_DEPLOYMENT_SECRET_BYTES} bytes`,
    );
    this.name = "DeploymentSecretError";
  }
}

export type DeploymentSecret = string | Uint8Array;

export function assertDeploymentSecret(secret: DeploymentSecret): void {
  const length =
    typeof secret === "string"
      ? Buffer.byteLength(secret, "utf8")
      : secret.byteLength;
  if (length < MIN_DEPLOYMENT_SECRET_BYTES) throw new DeploymentSecretError();
}

/** HMAC-SHA256(secret, lower(identifier)), hex. */
export function subjectHash(
  secret: DeploymentSecret,
  identifier: string,
): string {
  return createHmac("sha256", secret)
    .update(identifier.toLowerCase(), "utf8")
    .digest("hex");
}
