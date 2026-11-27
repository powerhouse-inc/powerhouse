# Every caller signs its writes

From Powerhouse 6.4 no host signs a write for its caller. Every operation in a
document carries the signature of whoever asked for it: a person through a
session key their Renown login or pseudonym vouches for, a service with its
own key, or an agent as a labelled session of its user. A write that reaches a
host unsigned is refused with the error code `UNSIGNED_WRITE`.

A host's own key (the instance key, `.ph/.keypair.json` or
`PH_RENOWN_PRIVATE_KEY`) signs only the host's own work: processors,
workflows, document migrations, the drives it seeds at boot, and what it
completes for a caller's signed delete.

## Who needs this page

- Scripts and integrations that call a switchboard's GraphQL mutations
  without signing the actions, or call the write tools of HTTP `/mcp`.
- Package subgraphs that write through `ctx.clients.write` on behalf of the
  caller.
- Services that wrote as the project's `ph login` before 6.4.

Powerhouse's own clients sign without a code change: Connect, apps on
`@powerhousedao/reactor-browser`, clint, `ph mcp`, `ph mutate` and Vetra
Studio's agent.

## What a host refuses

| Mutation | Why it is refused | Code |
| --- | --- | --- |
| `execute`, `executeAsync`, `executeBatch`, `mutateDocument`, `mutateDocumentAsync` with unsigned actions | the caller hands over actions nobody signed | `unsigned-actions` |
| `createDocument`, `createEmptyDocument`, `renameDocument`, `setPreferredEditor`, the relationship mutations, `deleteDocument`, `deleteDocuments` | the host would have to build and sign the actions | `host-built` |
| A document model's own mutations (`mutation { <Model> { <operation>(...) } }`, its `createDocument`) | the same | `host-built` |
| Actions signed by a key that names no user (an app key alone) | nobody is answerable for them | `no-identity` |
| A write tool over HTTP `/mcp` | the host would sign for the MCP client | `mcp-http-write` |

Reads stay open: who may read a document is still the host's setting.

A caller that sends a host session token (see [Access tokens](/academy/Reference/Authorization/AccessTokens))
is the exception: it delegated a session to the host, so the host builds and
signs these writes with that session's key, and every operation reads
"session `<label>` acting for `<user>`".

## The refusal

GraphQL answers with HTTP 200 and an error whose `extensions` name the case:

```json
{
  "errors": [
    {
      "message": "Refused: this host signs no writes for its callers (Powerhouse 6.4). `Mutation.renameDocument` from an anonymous caller asks the host to build and sign SET_NAME. Sign it as yourself: a Powerhouse client (reactor-browser, clint, `ph mcp`) does it for you, or run `ph mutate <document> SET_NAME --input '<json>'`, or send a host session token (`Authorization: Bearer phs_...`, from this host's OAuth device grant at `/oauth`).",
      "extensions": {
        "code": "UNSIGNED_WRITE",
        "reason": "host-built",
        "field": "Mutation.renameDocument",
        "caller": null,
        "actions": ["SET_NAME"]
      }
    }
  ]
}
```

`caller` is `{ address, label }` when the bearer named one, `null` for an
anonymous caller. `actions` lists the refused action types, each once. An MCP
tool answers with a tool error carrying the same text.

| `reason` | Case | Fix |
| --- | --- | --- |
| `unsigned-actions` | a mutation carried unsigned actions | sign them in your client, run `ph mutate`, or send a host session token |
| `host-built` | the mutation asks the host to build the actions | the same |
| `no-identity` | signed by a key that names no user | sign as a user: open Connect by the sign-in link `ph dev` prints, or use a client with an identity (`ph login`, or the pseudonym it makes for you) |
| `mcp-http-write` | a write tool over HTTP `/mcp` | run `ph mcp`, use a Powerhouse client, or sign in to `/mcp` with a host session (see [MCP clients](/academy/Reference/Authorization/MCPClients)) |

The codes, their text and the fixes come from one table,
`@powerhousedao/shared/clis/unsigned-writes`. A client that handles the
refusal reads it from there: `UNSIGNED_WRITE_ERROR_CODE`,
`UNSIGNED_WRITE_REASONS`, `UNSIGNED_WRITE_CASES`, and `unsignedWriteCause`,
`unsignedWriteFix` and `unsignedWriteMessage` for the text of one refusal.

## Sign in your own client

A TypeScript service or script with Powerhouse's libraries signs its writes
itself and needs no token. `openSession` of `@renown/sdk/identity` opens a
labelled session of whoever acts (a Renown login, the pseudonym, or the key in
`PH_IDENTITY_KEY`), and makes its credential known at the host:

```ts
import { GraphQLReactorClient } from "@powerhousedao/reactor-browser/graphql-client";
import { generateActionId } from "@powerhousedao/shared/document-model";
import { openSession } from "@renown/sdk/identity";

const host = "https://switchboard.example.com";
const session = await openSession({
  dataDir: process.cwd(),
  label: "billing",
  place: "home",
  interactive: false,
  target: { url: host },
});

const client = new GraphQLReactorClient({
  url: `${host}/graphql`,
  signer: session.actionSigner,
  tokenProvider: () => session.bearer(),
  documentModels: [/* the models it creates documents of */],
});

const handle = await client.write.execute(documentId, "main", [
  {
    id: generateActionId(),
    type: "SET_NAME",
    scope: "global",
    timestampUtcMs: new Date().toISOString(),
    input: { name: "Q4" },
  },
]);
await handle.readable;
```

`client.write.create`, `client.write.drives.addFile` and
`client.write.deleteDocument` create, file and delete the same way: the create
is built and signed in the client, and a delete is the client's own signed
`DELETE_DOCUMENT`, which the host completes (the links into the document, its
drive entry and, with cascade, the documents only it held).

## Service identities

A service that runs without a person (a CI job, a container, a bridge to
another system) gets an identity of its own:

```bash
ph identity new --label billing
```

```
# Anonymous 0x7E5F...5Bdf "billing": 0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf
PH_IDENTITY_KEY=0x0000000000000000000000000000000000000000000000000000000000000001
```

(A real key is 32 random bytes; this one is the textbook example.) The two
lines are an env file. Nothing is written unless you pass `--save <file>`,
which writes them to a file readable by you only and never overwrites one;
`--json` prints the identity as JSON. Give the key to the service as a secret
(`PH_IDENTITY_KEY`). A process with it set signs as that identity,
`Anonymous 0x7E5F...5Bdf`, whether or not a Renown login is in its identity
home, and writes no key file. `openSession` above signs with it and enrols its
session's credential at the host by a request the key signs.

A service that must administer a host (install packages, say) goes into that
host's `ADMINS`.

## `ph mutate` for scripts

`ph mutate` sends one change, signed as you through ph-cli's own session
`ph-cli`. The actions are plain objects; no document model is needed except
for `--create`.

```bash
# one action
ph mutate <document> SET_NAME --input '{"name":"Q4 report"}'
ph mutate <document> SET_STATUS --input-file status.json --scope local --branch main

# a file of actions, sent in order
ph mutate <document> --actions actions.json

# create, filed in a drive, and delete
ph mutate --create powerhouse/document-model --parent my-drive --name "Invoice"
ph mutate --delete <document> --cascade
```

`actions.json` is an array of `{ "type", "input", "scope" }`; `scope` defaults
to `global`. The switchboard is `--url` (its GraphQL endpoint or its base URL),
else the one the project runs (its run record under `.ph/run/`). `--json`
prints the result for scripts. A refusal prints the host's code and fix, e.g.
`Refused (UNSIGNED_WRITE, no-identity): ...`, and exits 1.

With `PH_IDENTITY_KEY` set, `ph mutate` signs as that identity: the same
command serves a person at a terminal and a CI job.

## Administration is the operator's

Signing decides whose name is on a document's operation. Administering the
host is a separate right, held by its operators:

- `ADMINS`: addresses, comma separated (`auth.admins` in a host's config), for
  a deployment.
- `PH_OPERATOR`: whom the launcher names. `ph run`, `ph dev`, `ph switchboard`,
  `ph vetra` and the supervisor pass `PH_OPERATOR=os-user`: the identities of
  the OS user who runs the host (the key in `PH_IDENTITY_KEY` when it is set,
  else their Renown login, else their pseudonym; their Renown login also when
  the key is set; and the store's pseudonym), re-read at most once a second,
  so a pseudonym made after boot counts at once. A service key in a project's
  `.env` thus takes no administration from the developer who is logged in; the
  host warns at boot that the key and a login are both there, and logs once an
  identity it cannot read (a malformed key). It also takes addresses. The bare
  switchboard binary and containers pass nothing: `ADMINS` alone.

Administration covers package installs and uninstalls, the AI gateway, remote
drives (`addRemoteDrive` over MCP), privacy erasure and disclosure, the
inspection and monitor levers, and publishing through Portle. It holds under
every policy: an OPEN host no longer makes every caller its administrator. A
host with neither logs at boot: `No administrator: package installs and other
administration over HTTP are refused. Set ADMINS.`

A host session token never administers, even an operator's.

## Related

- [Access tokens](/academy/Reference/Authorization/AccessTokens): `ph token`, for tools that sign nothing themselves
- [MCP clients](/academy/Reference/Authorization/MCPClients): `/mcp` with a host session, and `ph mcp`
- [OAuth endpoints](/academy/Reference/Authorization/OAuthEndpoints)
- [Upgrading to 6.4](/academy/Reference/Authorization/UpgradingTo64): `ph migrate --identity` and what was removed
