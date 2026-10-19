The released inputs are the output of `subgraphs/index-file.ts`,
`custom-schema.ts`, and `custom-resolvers.ts` on main commit
`22211870bd7d25501f6de0c1131ec0852a7fb428`, instantiated with the name `example`.
They remain pinned when the generator templates change.

The custom fixture retains constructor state, lifecycle work and an inline
resolver map that uses a resolver function from another file. The inline
fixture covers scalar, enum, abstract-type and subscription coordinates,
captured instance state and ordinary function receivers.
Expected files are literal source snapshots of the migration result.
`released/expected-resolvers.ts.txt` removes only the factory's opaque return
annotation so TypeScript can infer the resolver map required by `schema.graphql`.
