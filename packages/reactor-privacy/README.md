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
