# Upgrading identities to 6.4

Powerhouse 6.4 changes who signs a write (every caller signs its own, see
[Every caller signs its writes](/academy/Reference/Authorization/EveryCallerSigns))
and who administers a host (its operators). This page lists what a project
upgrading from 6.3 or earlier has to act on, and what `ph migrate` does for
it.

## The identity step of `ph migrate`

`ph migrate` runs the identity step first, before it moves the project to a
version. `ph migrate --identity` runs it alone.

```bash
ph migrate --identity --dry-run   # what it would do: asks Renown nothing, writes nothing
ph migrate --identity
```

Each item acts on what it finds, so a second run says `nothing to do`:

1. **The project's Renown login** (`.ph/.renown.json` with a user). Before
   6.4, `ph login` wrote it into the project, and the switchboard signed every
   caller's write as that login. The step withdraws its credential at Renown
   with a bearer of `.ph/.keypair.json`, keeps the credential as a tombstone
   in `.ph/credentials/withdrawn/`, and deletes the file. `.ph/.keypair.json`
   stays: it is the switchboard's own key, and the history it signed stays
   valid as signed by that instance. Run `ph login` once afterwards: a login
   lives in your home folder now, for every project.
2. **Studio's agent login** (`.ph/vetra/agent/`): withdrawn and kept the same
   way, then the folder is deleted. Studio's agent signs as its own labelled
   session now. Both `preview-trusted-keys.json` files (`.ph/` and
   `.ph/vetra/`) are deleted.
3. **The owner claim** (`.ph/.owner.json`): deleted, and the address it named
   printed with the `ADMINS` line to set for a deployment.
4. **Dead settings.** `auth.renown.source`, `auth.ownerClaim`,
   `auth.offlineCredentials` and `auth.resolveIdentity` are removed from
   `powerhouse.config.json`; `RENOWN_SOURCE` and `RESOLVE_CALLER_IDENTITY`
   from `.env`. In `hosts/`, each line that still sets one (and
   `identity.storagePath`) is reported with its file and line, for you to
   edit.
5. **`.ph` out of git.** `.ph/.gitignore` (`*`) is written when missing, and
   the `.ph` files git tracks are listed: untrack them with
   `git rm -r --cached .ph`, and replace a key that was ever committed.
6. **Administration.** It reports who administers the host over HTTP
   (`ADMINS` in the environment, in `.env`, or `auth.admins`), or `No
   administrator configured for deployments`.
7. **A 6.3 host's record of unsigned writes** (`.ph/unsigned-writes/`): it
   prints once how many writes the host signed for its callers, by code and
   field, then deletes the folder. Each of those callers needs a signed client
   now.

The logins are withdrawn at `https://www.renown.id`, where `ph login` logged in
before 6.4. A login made at another Renown takes `--renown-url <url>` (or
`PH_CONNECT_RENOWN_URL`).

A withdraw that fails (Renown cannot be reached, or does not take the key as
proof) keeps that item's files, prints the reason and the Renown page where
you can withdraw it with your wallet, and makes the command exit 1. The other
items go on. Run `ph migrate --identity` again to finish it.

A 6.4 switchboard that finds these files logs a warning naming them and
`ph migrate`. It never withdraws or deletes anything itself.

## What 6.4 removed

### Unsigned write helpers of `@powerhousedao/reactor-browser`

`reactorGraphqlCreateDocument`, `reactorGraphqlDeleteDocument`,
`reactorGraphqlDeleteDocuments` and `reactorGraphqlMutateDocument` sent
unsigned writes through the store's GraphQL client, which a 6.4 host refuses
every time. They are gone. The read helpers (`reactorGraphqlFetch*`) and
`useInitReactorGraphqlClient` stay.

| Removed | In an app (the store's reactor client) | Elsewhere (`GraphQLReactorClient` with a `signer`) |
| --- | --- | --- |
| `reactorGraphqlCreateDocument` | `addDocument` | `write.create`, or `write.drives.addFile` to file it in a drive |
| `reactorGraphqlMutateDocument` | `dispatchActions` | `write.execute` |
| `reactorGraphqlDeleteDocument`, `reactorGraphqlDeleteDocuments` | `deleteNode` | `write.deleteDocument` |

In an app, `useReactorClient()` returns the store's client, which signs as the
person signed in. Elsewhere, build a `GraphQLReactorClient` from
`@powerhousedao/reactor-browser/graphql-client` with a `signer`, as
[Every caller signs its writes](/academy/Reference/Authorization/EveryCallerSigns#sign-in-your-own-client)
shows.

### The owner claim

`auth.ownerClaim` made the first person to sign in a host's administrator and
recorded them in `.ph/.owner.json`. Nobody claims a host in 6.4. Its
operators administer it: the `ADMINS` of a deployment, and whoever runs it on
this computer (`PH_OPERATOR=os-user`, which `ph run`, `ph dev` and
`ph switchboard` pass). `auth.ownerClaim` is accepted, ignored and warned of;
`ph migrate` removes it and the file.

### Settings that do nothing

| Setting | Since 6.4 |
| --- | --- |
| `RENOWN_SOURCE`, `auth.renown.source` | a host checks a credential's record in its data folder, then Renown |
| `auth.offlineCredentials` | Renown's answers are always kept; `REFUSE_UNSEEN_CREDENTIALS_OFFLINE` refuses an unseen credential while Renown cannot be reached |
| `RESOLVE_CALLER_IDENTITY`, `auth.resolveIdentity` | a bearer is always verified when one is sent |
| `identity.storagePath` | the switchboard signs as its instance key only, never as a login |

Each is accepted and warned of at boot. `ph migrate` removes them from
`powerhouse.config.json` and `.env`, and reports them in host files.

### Logins in the project

`ph login` writes to your home folder (`~/.ph/identities/renown/`), one login
for every project, and never into a project. `ph logout` withdraws it at
Renown and deletes it. Nobody logged in, you act as your pseudonym,
`Anonymous 0x...`: `ph whoami` shows which.

## After the upgrade

- Scripts that wrote unsigned: `ph mutate`, or an access token
  (`ph token create`).
- Services: an identity of their own (`ph identity new`, `PH_IDENTITY_KEY`).
- MCP clients: `ph mcp`, or sign in to `/mcp`
  ([MCP clients](/academy/Reference/Authorization/MCPClients)).
- Deployments that administer over HTTP: `ADMINS`.
