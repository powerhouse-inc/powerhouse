// The account an OAuth2 connection signed in as, from the OpenID Connect ID
// token in the provider's token response (asked for with the `openid email`
// scopes). A fallback for pieces whose auth has no getConnectionIdentifier.
//
// The signature is not checked: the token came straight from the provider's
// token endpoint over TLS, in answer to this runtime's own code exchange,
// which OpenID Connect Core 1.0 §3.1.3.7 allows in place of validating it.
// It only names the connection for people; nothing is authorised on it.

/** The verified email in a connection auth's `data.id_token`, if there is one. */
export function idTokenEmail(auth: unknown): string | undefined {
  const data = (auth as { data?: unknown } | null | undefined)?.data;
  const token = (data as { id_token?: unknown } | null | undefined)?.id_token;
  if (typeof token !== "string") return undefined;
  const payload = token.split(".")[1];
  if (!payload) return undefined;
  let claims: { email?: unknown; email_verified?: unknown };
  try {
    claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as typeof claims;
  } catch {
    return undefined;
  }
  // Google sends email_verified; a provider that leaves it out is taken at its word.
  if (claims.email_verified === false || claims.email_verified === "false") {
    return undefined;
  }
  return typeof claims.email === "string" && claims.email !== ""
    ? claims.email
    : undefined;
}
