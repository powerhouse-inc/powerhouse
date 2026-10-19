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

## Erasure

`createModuleErasure(reactorModule, { deploymentSecret, signer, permissions })`
returns an `ErasureService` (`plan`, `request`, `status`) and an
`ErasureScheduler`; call `scheduler.start()` and, on shutdown,
`await scheduler.stop()`. The scheduler refuses to exist without a signer
carrying an app key, because every receiver refuses an unsigned marker.
`permissions` is an `IDocumentPermissionEraser`; reactor-api's
`PrivacyPermissionAdapter` implements it and `IPermissionRowsLookup`.

Each tick (60 s by default) moves items `waiting -> purging -> purged ->
erased`, one purge at a time across every request, a drive only after its
members. `document_purges` is the only success signal. Remotes bound to a
purged drive and the document's permission rows are removed only after the
marker converged or `markerGrace` (7 days) passed. Operator documentation:
academy, Reference, Reactor, Document erasure.

## Admin subgraph

The package exports the schema of an admin-only subgraph
(`privacySubgraphTypeDefs`, `privacyResolverCoordinates`) and its resolvers
(`createPrivacyResolvers`): queries `disclose(identifier)`,
`erasurePlan(ids)`, `erasureRequest(requestId)` and the mutation
`requestErasure(ids, deadline, allowLarge)`. Every field refuses, before any
work, a caller whose `ctx.user.address` is missing or is not a supreme admin
(`FORBIDDEN`, "Admin access required"). `requestErasure` passes the caller's
address to `IErasureService.request` as `requestedBy`; hashing it for storage
is the service's job.

Under `AuthorizationPolicy.OPEN` every caller, anonymous included, is a
supreme admin, so `refuseAnonymousAdmins(authorizationService)` throws
`PrivacySubgraphOpenPolicyError`. It throws for any authorization service that
answers `isSupremeAdmin` true for an anonymous caller. The
authenticated-caller floor is not a substitute. A host that wants to boot
anyway catches the error and does not register the subgraph.

The package does not depend on reactor-api: the authorization service is typed
structurally (`config.policy`, `isSupremeAdmin`), so reactor-api's
`IAuthorizationService` is passed unchanged. The host wraps the schema in its
own `BaseSubgraph` class, as switchboard's `PrivacySubgraph` does:

```ts
class PrivacySubgraph extends BaseSubgraph {
  static override readonly subgraphName = PRIVACY_SUBGRAPH_NAME;

  static override getSchema(schema: SchemaBuilder<PrivacySubgraph>) {
    return schema.graphql({
      typeDefs: privacySubgraphTypeDefs,
      resolverCoordinates: privacyResolverCoordinates,
      resolvers: (subgraph) =>
        createPrivacyResolvers({
          authorizationService: subgraph.authorizationService,
          ...subgraph.services,
        }),
    });
  }

  constructor(
    args: SubgraphArgs,
    private readonly services: Pick<PrivacyResolverDeps, "erasure" | "disclosure">,
  ) {
    refuseAnonymousAdmins(args.authorizationService);
    super(args);
  }
}
```
