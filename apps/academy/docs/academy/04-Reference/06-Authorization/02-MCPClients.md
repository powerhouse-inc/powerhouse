# MCP clients

An MCP client (Claude Code, Cursor, an agent of your own) reaches a reactor's
tools in one of two ways, and both sign its writes as you:

| | `ph mcp` (stdio) | HTTP `/mcp` |
| --- | --- | --- |
| For | a project on this computer | a switchboard anywhere |
| Who signs | the client's own session, kept in the project's data folder | a host session the client signs in for |
| Sign-in | none for a pseudonym; a Renown login approves once at Renown's console | the OAuth code grant, in the browser, once per 30 days at most |
| Reads | yes | yes, without signing in |

The client is a labelled session of yours either way: every operation it
writes reads "session `<label>` acting for `<you>`", and the label names the
client.

## `ph mcp` over stdio

A project made with `ph init` has it configured: `.mcp.json` runs the
project's `mcp` script, which is `ph-cli mcp`.

```json
{
  "mcpServers": {
    "reactor-mcp": { "type": "stdio", "command": "node", "args": ["--run", "mcp"] }
  }
}
```

`ph mcp` lists reactor-mcp's tools itself and starts the project's dev host
(`ph dev`) at the first tool call that needs it. The writing tools run in
`ph mcp`'s own process, signed and borne as the client's session,
`mcp <client name>` (`mcp claude-code`, say), with its key in
`.ph/sessions/` and its credential's record in `.ph/credentials/`:

- With a pseudonym, the credential is issued at the first write, with no
  click.
- With a Renown login, the first write answers with a tool error that names
  Renown's console page. Approve the session there once with your wallet,
  then call the tool again.

`ph credentials withdraw "mcp claude-code"` withdraws the client at once, and
it stays withdrawn: it does not issue itself a new credential.

The models are the base ones, the project's own (`document-models/`) and those
of the packages `powerhouse.config.json` lists. A write that needs a model
`ph mcp` lacks is answered with a tool error naming it.

## HTTP `/mcp` with a host session

Point the client at the switchboard's `/mcp`, e.g. for Claude Code:

```bash
claude mcp add --transport http powerhouse http://localhost:4001/mcp
```

Reads work at once. The first write (or any request, on a host that requires
an authenticated caller) is answered with 401 and

```
WWW-Authenticate: Bearer resource_metadata="http://localhost:4001/.well-known/oauth-protected-resource/mcp", scope="documents:write"
```

A client that follows the MCP authorization specification then signs in by
itself:

1. **Discovery.** It reads the resource metadata (RFC 9728), which names the
   authorization server, and then that server's metadata (RFC 8414) at
   `/.well-known/oauth-authorization-server`.
2. **Registration.** It registers as a public client (RFC 7591) with its name
   and redirect URI. It gets a `client_id`; there is no secret.
3. **Authorization.** It opens `/oauth/authorize` in your browser with a PKCE
   challenge (S256, RFC 7636), `scope=documents:write` and
   `resource=<origin>/mcp` (RFC 8707).
4. **Consent.** The host shows its consent page: the session (labelled with
   the client's name), "may sign document changes as you; no administration",
   its end date, where the browser returns afterwards and the client's
   redirect host. Approve it:
   - with a Renown login: **Approve with Renown**, and sign with your wallet;
   - with a pseudonym on this computer: run the line the page shows,
     `ph token approve <code> --url <host>`.

   The page checks back every 5 seconds and, once approved, returns the
   browser to the client with the code, `state` and `iss` (RFC 9207).
5. **Token.** The client trades the code and its PKCE verifier for the
   token. From then on its writes are signed by the session.

The session lasts 30 days at most, or the host's `auth.hostSessions.maxDays`.
Withdraw it like any access token: `ph token list`, `ph token withdraw <id>`
(see [Access tokens](/academy/Reference/Authorization/AccessTokens)).

A host session without `documents:write` gets 403 `insufficient_scope` on a
write tool. A client that sends a bearer of its own session (the way `ph mcp`
does) is not challenged: its writes are its own. A host that issues no host
sessions (`HOST_SESSIONS=false`, or one that serves only its admins) sends no
challenge: a write tool there answers with the `UNSIGNED_WRITE` refusal
(`mcp-http-write`), whose fix names `ph mcp`.

### What the host accepts from a client

- **Redirect URIs**: `https` on any host; `http` on loopback (`localhost`,
  `127.0.0.1`, `[::1]`), where any port matches the registered one (RFC 8252
  7.3, a native app's listener); or an app's own scheme (RFC 8252 7.1, e.g.
  `cursor://...`), which the consent page shows in full. Refused: plain `http`
  off loopback, a fragment, user info, and the schemes `javascript`, `data`,
  `file`, `vbscript`, `blob`, `about`, `ws`, `wss`, `ftp`, `mailto`, `tel`,
  `sms` and `intent`.
- **Errors before you act** (an unknown client, a redirect URI it did not
  register, a missing PKCE challenge) are a page on the host naming the error.
  Only a loopback client is sent back at once. After you click Approve or Deny
  the browser goes back to the client's registered URI.
- **Registrations**: 10 a minute and 20 held per address (an IPv6 address
  counts by its /64), 1,000 in all. A registration no grant was approved for
  is dropped after an hour; one in use, 30 days after its last approval. A
  client registers again after that.
- **Codes**: one use, bound to the client, the exact redirect URI, the PKCE
  verifier and the resource. A code that fails a check is spent and its
  session withdrawn.

### Under `ph vetra`

Vetra Studio's Connect passes `/oauth` and the two `/.well-known/oauth-*`
documents through to its switchboard, so a client signs in on Connect's
origin, which is then the issuer.

## Related

- [OAuth endpoints](/academy/Reference/Authorization/OAuthEndpoints)
- [Every caller signs its writes](/academy/Reference/Authorization/EveryCallerSigns)
- [`ph mcp`](/academy/Reference/CLITooling/PowerhouseCLI#mcp) in the CLI reference
