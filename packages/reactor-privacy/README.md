# @powerhousedao/reactor-privacy

GDPR add-on for the Powerhouse reactor. It keeps its own migration ledger
(`kysely_migration_reactor_privacy`) in the reactor schema and owns:

- `erasure_requests`, `erasure_items`, `erasure_audit` (append-only): the
  erasure request ledger;
- `subject_documents`: an index from `HMAC-SHA256(deploymentSecret,
  lower(identifier))` to the documents an identifier appears in, maintained by
  `SubjectDocumentsReadModel`, a fenced read model over the reactor handle;
- `DisclosureService.disclose(identifier)`: the index rows plus the sync
  remotes bound to the address, peer manifests announcing the key, and the
  permission rows a host-supplied `IPermissionRowsLookup` returns. The response
  lists what it does not cover.

The host registers it after the reactor is built:

```ts
await registerSubjectDocumentsReadModel(reactorModule, { deploymentSecret });
const disclosure = new DisclosureService(
  reactorModule.database,
  deploymentSecret,
  permissionLookup,
);
```

Identifiers match case-insensitively. A header key is indexed as the did:key
of its P-256 JWK, the same form an app key takes. Rotating the deployment
secret requires rebuilding the index.

## Admin subgraph

`createPrivacySubgraph` returns the typeDefs and resolvers of an admin-only
subgraph: queries `disclose(identifier)`, `erasurePlan(ids)`,
`erasureRequest(requestId)` and the mutation
`requestErasure(ids, deadline, allowLarge)`. Every field refuses, before any
work, a caller whose `ctx.user.address` is missing or is not a supreme admin
(`FORBIDDEN`, "Admin access required"). `requestErasure` passes the caller's
address to `IErasureService.request` as `requestedBy`; hashing it for storage
is the service's job.

Under `AuthorizationPolicy.OPEN` every caller, anonymous included, is a
supreme admin, so the factory throws `PrivacySubgraphOpenPolicyError` rather
than return a subgraph. It throws for any authorization service that answers
`isSupremeAdmin` true for an anonymous caller. The authenticated-caller floor
is not a substitute. A host that wants to boot anyway catches the error and
does not register the subgraph.

The package does not depend on reactor-api: the authorization service is typed
structurally (`config.policy`, `isSupremeAdmin`), so reactor-api's
`IAuthorizationService` is passed unchanged. The host registers the result as
a late subgraph, as switchboard does for reactor-drive:

```ts
const privacySubgraph = createPrivacySubgraph({
  authorizationService: graphqlManager.getAuthorizationService(),
  erasure, // an IErasureService
  disclosure, // a DisclosureService
});
await graphqlManager.registerSubgraphInstance(
  {
    ...privacySubgraph,
    path: graphqlManager.getBasePath(),
    reactorClient: client,
    relationalDb: undefined as never,
  },
  "graphql",
  false,
);
```
