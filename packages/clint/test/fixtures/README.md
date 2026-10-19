# Test Fixtures

## Registry Fixtures

Two HTTP servers for testing service announcements. Both log all incoming
requests to stdout and store payloads for inspection via `GET /announcements`.

### `test-registry.js` — Plain JSON POST

Accepts any JSON POST body and stores it verbatim.

```sh
PORT=4455 node tests/fixtures/test-registry.js
```

### `test-registry-graphql.js` — GraphQL Mutation

Accepts `announceClintEndpoints` GraphQL mutations, validates the shape,
and stores the `variables.input` object. Generates a random `documentId`
on startup and prints the full `SERVICE_ANNOUNCE_URL` to configure.

```sh
PORT=4455 node tests/fixtures/test-registry-graphql.js
# Output:
#   Registry listening on http://localhost:4455
#   <CLI_NAME>_SERVICE_ANNOUNCE_URL=http://localhost:4455?documentId=<uuid>

# Override the document ID:
DOCUMENT_ID=my-doc-123 PORT=4455 node tests/fixtures/test-registry-graphql.js
```

To test a CLI against the GraphQL registry:

```sh
# Terminal 1: start the registry
PORT=4455 node tests/fixtures/test-registry-graphql.js

# Terminal 2: export the URL printed by the registry and run the CLI
export PH_PIRATE_SERVICE_ANNOUNCE_URL="http://localhost:4455?documentId=<uuid>"
ph-pirate -i

# Terminal 3: inspect announcements
curl http://localhost:4455/announcements | jq .
```
