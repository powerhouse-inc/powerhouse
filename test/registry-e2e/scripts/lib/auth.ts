import { generateAccessToken, RenownBuilder } from "@renown/sdk/node";
import { existsSync } from "node:fs";
import path from "node:path";

/** The `.ph` directory holding a `ph login` session. */
export function renownDir(): string {
  return path.resolve(process.env.REGISTRY_E2E_RENOWN_DIR ?? ".ph");
}

export function hasRenownLogin(): boolean {
  return existsSync(path.join(renownDir(), ".renown.json"));
}

/** A Renown bearer token for `audience`, as `ph publish` mints one. */
export async function renownToken(
  audience: string,
  expiresIn = 3600,
): Promise<{ token: string; did: string }> {
  const dir = renownDir();
  // `never`: revalidating may rewrite the stored session, which is not ours.
  const renown = await new RenownBuilder("ph-cli", {
    storagePath: path.join(dir, ".renown.json"),
    keyPath: path.join(dir, ".keypair.json"),
    revalidate: "never",
  }).build();
  if (!renown.user) {
    throw new Error(`No Renown user in ${dir}; run \`ph login\` there first.`);
  }
  const result = await generateAccessToken(renown, {
    expiresIn,
    aud: audience,
  });
  // The registry records the user's pkh DID as owner, not the signing key's.
  return { token: result.token, did: renown.user.did };
}

/** A verdaccio user token (`npm adduser`); the account lands in Postgres. */
export async function verdaccioToken(
  registryUrl: string,
  name: string,
  password: string,
): Promise<string> {
  const res = await fetch(
    `${registryUrl}/-/user/org.couchdb.user:${encodeURIComponent(name)}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, password, type: "user", roles: [] }),
    },
  );
  const body = (await res.json().catch(() => ({}))) as { token?: string };
  if (!res.ok || !body.token) {
    throw new Error(`adduser ${name} returned ${res.status}`);
  }
  return body.token;
}
