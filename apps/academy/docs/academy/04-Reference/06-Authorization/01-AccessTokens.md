# Access tokens

An access token lets a tool that signs nothing itself (`curl`, a shell script,
a service in another language, a no-code integration) write to a switchboard
as you. You delegate a session to the host: the host makes the session's key,
you approve it with your own identity, and the host signs that tool's
document changes with the session's key. Every operation it writes reads
"session `<label>` acting for `<you>`".

A tool built on Powerhouse's TypeScript libraries does not need a token: it
signs its own writes (see [Every caller signs its writes](/academy/Reference/Authorization/EveryCallerSigns)).

## What a token may do

| | |
| --- | --- |
| Scope | `documents:write`: create, change and delete documents as you, through GraphQL (`/graphql`, its WebSocket) and HTTP `/mcp`, and read attachments |
| Administration | none. A token administers nothing, not even an operator's: no package installs, no AI gateway, no inspection levers |
| Other routes | refused with 401 `host-session-not-accepted`: package HTTP routes, the AI gateway, the credential and OAuth routes |
| Lifetime | 30 days at most (`--days`, and a host's `auth.hostSessions.maxDays`). There is no refresh: a new session after it ends |
| Withdrawal | at once: the next request with the token gets 401 |

The token has the form `phs_<session id>_<secret>`. It is shown once; the host
keeps only a hash of the secret, in `<dataDir>/.ph/host-sessions/<id>.json`.
Treat it as a password.

A host issues tokens wherever its own credential check runs. Turn it off with
`HOST_SESSIONS=false` (`auth.hostSessions.enabled: false`). A host that serves
only its admins (`AUTH_ENABLED` without document permissions) issues none: a
session there could read and write nothing.

## Create a token

```bash
TOKEN=$(ph token create --label billing --days 7)
```

`ph token create` runs the host's OAuth device grant (RFC 8628) and prints
only the token on stdout, so a script can keep it. How you approve depends on
who you are on this computer:

- **A pseudonym** (no `ph login`): it shows what you allow and asks `Approve?
  [y/N]`, then signs the session's credential with your pseudonym. `--yes`
  approves without asking; without a terminal it refuses unless `--yes` is
  given.
- **A Renown login**: it prints the host's consent page and opens it (never
  with `BROWSER=none`). Click **Approve with Renown** there and sign with your
  wallet. The command waits for the approval and then prints the token.

| Option | Default | |
| --- | --- | --- |
| `--url <host>` | this project's switchboard on localhost | the host, as its consent page names it |
| `--label <name>` | `ph token` | the session's name, which every operation it signs carries |
| `--days <n>` | 30 | 1 to 30 |
| `--replace <session>` | | a session to withdraw once the new token is issued: its id (or a prefix) or label |
| `--yes` | | approve without asking |
| `--json` | | print the whole token response |
| `--data-dir <dir>` | `PH_USER_DATA_DIR`, else the project | where `--replace` finds the session |

`--replace` resolves the session to replace before the grant starts, and
prints the new token before it withdraws the old one: if the withdrawal then
fails, you keep the new token and the command says which session to withdraw.

## Use it

Send it as a bearer to `/graphql`:

```bash
curl -s http://localhost:4001/graphql \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation($id:String!){renameDocument(documentIdOrSlug:$id,name:\"Q4 report\"){id name}}","variables":{"id":"<document-id>"}}'
```

With a token, the mutations a host refuses an unsigned caller work: the host
builds the actions and signs them with the session's key. The same holds for a
document model's own mutations and for HTTP `/mcp`'s write tools.

## The consent page

`<host>/oauth/device?user_code=WXYZ-BCDF` shows what you would allow: the host
and its key, the session's label and key, "may sign document changes as you;
no administration", the end date, the client that asked, where it asked from
and when. Approve only a code you started yourself in the last 10 minutes.
Opening the page approves nothing. A code lasts 10 minutes.

The page has three ways out:

- **Deny**: the device or tool gets no token.
- **Approve with Renown**: for a Renown login. The page sends you to Renown's
  console, which signs a credential for the session's key.
- `ph token approve WXYZ-BCDF --url <host>`, printed on the page: for a
  pseudonym on this computer.

## Approve a code a tool shows

```bash
ph token approve WXYZ-BCDF --url http://localhost:4001
```

`ph token approve` reads the grant from the host, refuses a code another host
issued, shows the details, asks, and signs the session's credential as your
pseudonym. A Renown login approves on the host's page instead. Use it for a
device or tool that started a grant itself, such as an MCP client (see
[MCP clients](/academy/Reference/Authorization/MCPClients)).

## List and withdraw

```bash
ph token list
ph token withdraw billing
```

`ph token list` reads the host sessions of this store from its files: ID,
label, who, how it was granted, the client, created, ends, last use, and
state (`live`, `ended`, `withdrawn`). `ph token withdraw <id|label>` takes an
id prefix or a label; a running host refuses the session's tokens from their
next request. Both take `--data-dir`. With `--url <host>` they ask the host
instead, with a bearer of your own `ph-cli` session, and list or withdraw only
your sessions there.

A token also withdraws itself: `POST <host>/oauth/revoke` with
`token=<token>` (RFC 7009).

## Tokens beside credentials

`ph credentials` lists and withdraws the credentials a host accepts by its own
record (`.ph/credentials` in the data folder): those of your own sessions
(`ph-cli`, `ph mcp`'s, Studio's agent, Connect's sign-in), and those of host
sessions (source `host-session`).

```bash
ph credentials list
ph credentials withdraw <id|address|label>
```

Withdrawing a host session's credential withdraws the session: its token is
refused from the next request, the same as `ph token withdraw`.

## After a restore

A backup of the data folder holds the host sessions with their keys and
hashes. Restored, sessions you withdrew after the backup come back until they
end. Run `ph token list` after a restore and withdraw what should be gone.
Keep the backup secret: it holds private keys.

## Related

- [OAuth endpoints](/academy/Reference/Authorization/OAuthEndpoints): the device grant, token and revoke routes
- [MCP clients](/academy/Reference/Authorization/MCPClients)
- [`ph token create`](/academy/Reference/CLITooling/PowerhouseCLI#token-create) in the CLI reference
