import { generateAccessToken } from "@renown/sdk/node";
import { getRenown } from "./auth.js";

/**
 * Mint a Renown bearer token bound to the given registry URL via the JWT
 * `aud` claim. Throws if the user is not authenticated (`ph login` first).
 *
 * The audience binding is what lets the registry distinguish a token minted
 * for it from one minted for a different service or registry.
 */
export async function mintRegistryAuthToken(
  registryUrl: string,
  expiresInSeconds: number,
): Promise<string> {
  const renown = await getRenown();
  if (!renown.user) {
    throw new Error("Not authenticated with Renown. Run 'ph login' first.");
  }
  const result = await generateAccessToken(renown, {
    expiresIn: expiresInSeconds,
    aud: registryUrl,
  });
  return result.token;
}
