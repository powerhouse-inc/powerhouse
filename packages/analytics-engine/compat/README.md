#### Compatibility

This code test compatibility between targets.

##### test/

These are essentially integration tests that compare responses from a Postgres store with responses from the browser store.

Before running, ensure you setup the postgres db.

```bash
docker compose -f ../pg/docker-compose.test.yml up -d
```

Next, follow the [benchmarking docs](./benchmarks/README.md) to to dump ~200k records into the local db.

Finally, you're ready to compare the in-memory and pg stores side by side for compatibility:

```bash
pnpm test
```

##### src/

This poorlly named directory contains a script that deep compares raw results from two different GQL endpoints. This is useful for comparing, say, dev vs prod.

To build:

```
pnpm build
```

To compare dev vs prod:

```
node dist/src/query-list.js --src "https://publish-dev-vpighsmr70zxa92r9w.herokuapp.com/graphql" --target "https://ecosystem-dashboard.herokuapp.com/graphql"
```
