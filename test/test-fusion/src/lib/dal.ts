import {
  RENOWN_SESSION_COOKIE,
  verifyRenownSession,
  type RenownSession,
} from "@renown/sdk/node";
import { cookies } from "next/headers";
import { cache } from "react";
import { SWITCHBOARD_URL } from "./renown";

// Data Access Layer: the single server-side auth check, memoized per request.
export const verifySession = cache(async (): Promise<RenownSession | null> => {
  const cookie = (await cookies()).get(RENOWN_SESSION_COOKIE)?.value;
  if (!cookie) return null;
  // Token-only by default (fast): verifies the JWT signature + expiry and merges
  // the cookie's display hint. Pass verifyCredential:true for sensitive routes.
  const session = await verifyRenownSession(cookie, {
    switchboardUrl: SWITCHBOARD_URL,
  });
  return session ?? null;
});
