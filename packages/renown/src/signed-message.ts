// Canonical messages a caller personal_signs (EIP-191) to authorize a Renown
// write without a login token. Kept byte-identical to renown-package
// `subgraphs/renown-auth/core/signed-message.ts`, which verifies them; the
// pinned strings in test/signed-message.test.ts guard both sides.

// Signed actions (revoke, profile update) must carry a timestamp within this
// window of the server's clock, in either direction. Signing a fresh message
// and replaying an old one both fail outside this bound.
export const SIGNATURE_WINDOW_MS = 600_000;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

async function sha256hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return toHex(new Uint8Array(digest));
}

/** Canonical message a caller signs to authorize revoking `credentialId`. */
export function revokeMessage(credentialId: string, timestamp: string): string {
  return `Revoke Renown credential ${credentialId} at ${timestamp}`;
}

/**
 * Canonical message a caller signs to authorize a profile upsert. The payload
 * is hashed (rather than embedded raw) so the signed message has a fixed
 * shape regardless of field content.
 */
export async function profileMessage(
  address: string,
  profile: { username?: string | null; userImage?: string | null },
  timestamp: string,
): Promise<string> {
  const payload = JSON.stringify({
    username: profile.username ?? null,
    userImage: profile.userImage ?? null,
  });
  const hash = await sha256hex(payload);
  return `Update Renown profile ${address.toLowerCase()} ${hash} at ${timestamp}`;
}
