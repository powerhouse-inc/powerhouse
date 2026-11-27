# OAuth endpoints

A switchboard issues host session tokens (see [Access tokens](/academy/Reference/Authorization/AccessTokens))
through standard OAuth 2.0 routes, written into reactor-api without an OAuth
server library. Every route is public: the caller has no token yet. Request
bodies are form-encoded (`application/x-www-form-urlencoded`) unless noted;
errors are JSON `{ "error", "error_description" }` with status 400, or 429 for
a limit.

## The issuer

The issuer is the host's configured public URL (`PUBLIC_URL`) plus its base
path. Without one, it is a loopback request's own origin, but never a request
a proxy forwarded (`Forwarded`, `X-Forwarded-*`): a proxy on the same computer
connects over loopback for callers anywhere. With neither, the routes answer
503 and name `PUBLIC_URL`.

The routes below are under `<issuer>/oauth/`. The two metadata documents are
at the origin's root.

## Metadata

| Route | Standard | Returns |
| --- | --- | --- |
| `GET /.well-known/oauth-authorization-server[/<base>]` | RFC 8414 | `issuer`, the endpoints below, `grant_types_supported` (`urn:ietf:params:oauth:grant-type:device_code`, `authorization_code`), `response_types_supported: ["code"]`, `code_challenge_methods_supported: ["S256"]`, `authorization_response_iss_parameter_supported: true`, `token_endpoint_auth_methods_supported: ["none"]`, `scopes_supported: ["documents:write"]` |
| `GET /.well-known/oauth-protected-resource[/<base>]` | RFC 9728 | the GraphQL resource: `resource` (the origin), `authorization_servers`, `bearer_methods_supported: ["header"]`, the scopes |
| `GET /.well-known/oauth-protected-resource/mcp` | RFC 9728 | the same for `/mcp`, resource `<origin>/mcp` |

## Device authorization

`POST oauth/device_authorization` (RFC 8628 3.1) starts a grant. The host makes
the session's key now.

| Parameter | |
| --- | --- |
| `client_id` | required; any string, shown on the consent page |
| `scope` | `documents:write`, the default and the only scope |
| `ph_label` | the session's label (default: the client id), at most 64 printable characters, not starting with `did:` |
| `ph_days` | 1 to 30 (default: the host's most) |

The answer: `device_code`, `user_code` (`WXYZ-BCDF`), `verification_uri`,
`verification_uri_complete`, `expires_in: 600`, `interval: 5`. Limits: 10 starts
a minute and 20 pending grants per client address, 1,000 pending grants in
all, 50 live sessions per user. A host that serves only its admins refuses
with `invalid_scope`, saying why.

## Token

`POST oauth/token` (RFC 6749 5.1), answered with `Cache-Control: no-store`.

| `grant_type` | Parameters | |
| --- | --- | --- |
| `urn:ietf:params:oauth:grant-type:device_code` (RFC 8628 3.4) | `device_code`, `client_id` | `authorization_pending` until approved, `slow_down` (the interval plus 5 s) when polled too often, `access_denied`, `expired_token` |
| `authorization_code` (RFC 6749 4.1.3, RFC 7636) | `code`, `client_id`, `redirect_uri`, `code_verifier` | the code once; a code that fails a check is spent and its session withdrawn |

The answer:

```json
{ "access_token": "phs_...", "token_type": "Bearer", "expires_in": 2592000,
  "scope": "documents:write", "ph_session": "<id>", "ph_label": "billing", "ph_address": "0x..." }
```

The first successful poll issues the token; later ones get `invalid_grant`.
There are no refresh tokens.

## Revocation

`POST oauth/revoke` (RFC 7009) with `token=<token>` withdraws its session at
once. It answers 200 for an unknown token too (RFC 7009 2.2).

## Authorization code grant

For MCP clients (see [MCP clients](/academy/Reference/Authorization/MCPClients)).

`POST oauth/register` (RFC 7591), a JSON body: `client_name`, `redirect_uris`,
and optionally `grant_types` (must include `authorization_code`) and
`token_endpoint_auth_method` (`none` only). Answers 201 with `client_id`
(`phc_<32 hex>`), `token_endpoint_auth_method: "none"`, `grant_types:
["authorization_code"]`, `response_types: ["code"]`. Redirect URIs: `https`,
loopback `http`, or an app's own scheme, not `javascript`, `data`, `file`,
`vbscript`, `blob`, `about`, `ws`, `wss`, `ftp`, `mailto`, `tel`, `sms`,
`intent`; no fragment, no user info. Refused with `invalid_redirect_uri`.

`GET oauth/authorize` (RFC 6749 4.1.1):

| Parameter | |
| --- | --- |
| `response_type` | `code` |
| `client_id`, `redirect_uri` | a registered client and one of its redirect URIs (a loopback one at any port, RFC 8252 7.3) |
| `code_challenge`, `code_challenge_method` | PKCE, `S256` only (RFC 7636) |
| `state` | returned on every redirect |
| `scope` | `documents:write` |
| `resource` | this host (RFC 8707), else `invalid_target` |
| `ph_label`, `ph_days` | as for the device grant; the label defaults to the client's name |

It shows the consent page. The page checks back every 5 s through
`authorize/continue` and, once the grant is approved, redirects to the client
with `code`, `state` and `iss` (RFC 9207). Errors before the person acts are a
page on this host; only a loopback redirect URI gets them as a redirect.

## Consent

| Route | |
| --- | --- |
| `GET oauth/device?user_code=` | the consent page (RFC 8628 3.3): plain HTML, no script, framing denied |
| `GET oauth/device/pending?user_code=` | the grant's details as JSON, for `ph token approve` |
| `POST oauth/device/approve` | JSON `{ user_code, credential, nonce }`: the person's credential for the session's key |
| `POST oauth/device/deny` | the page's Deny |
| `POST oauth/device/renown` | the page's **Approve with Renown**: sends a Renown login to Renown's console |

Approval checks that the grant is pending and unexpired, that the credential
names the grant's session key, is signed by the person and ends no later than
asked, and that it carries the asked label. The page's own buttons are taken
only from the host's pages (Origin and `Sec-Fetch-Site`, a per-page nonce).
10 unknown codes a minute per client.

## A person's own sessions

| Route | |
| --- | --- |
| `GET oauth/sessions` | the caller's live host sessions on this host |
| `POST oauth/sessions/<id>/withdraw` | withdraws one of them |

Both need a bearer the person signed themselves (a session of theirs, not a
host session token). `ph token list --url` and `ph token withdraw --url` use
them.

## Settings

| Setting | |
| --- | --- |
| `HOST_SESSIONS=false` (`auth.hostSessions.enabled`) | no host sessions, and none of these routes |
| `auth.hostSessions.maxDays` | caps a session below 30 days |
| `PUBLIC_URL` | the issuer behind a proxy; also lets the limits read `X-Forwarded-For` from a peer inside the deployment |
