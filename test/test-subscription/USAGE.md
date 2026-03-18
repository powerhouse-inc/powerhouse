# test-subscription

Minimal CLI client for testing reactor GraphQL subscriptions over WebSocket.

## Prerequisites

A running reactor/switchboard instance (default: `localhost:4001`).

## Quick start

```bash
cd test/test-subscription
pnpm start
```

This subscribes to **all** `documentChanges` events and logs them in real time.

## Options

```
--url <url>        WebSocket endpoint
                   Default: ws://localhost:4001/graphql/subscriptions

--type <type>      Filter by document type (e.g. powerhouse/document-drive)
                   Omit to receive all document types.

--parent-id <id>   Filter by parent document (drive) ID.
                   Only events whose context.parentId matches are delivered.

--job-id <id>      Additionally subscribe to jobChanges for a specific job.

--auth <token>     Pass a bearer token via connectionParams.

--help             Show help and exit.
```

All options are passed after `--` when using `pnpm start`:

```bash
pnpm start -- --type powerhouse/document-drive
```

## Examples

```bash
# All document changes on the default local reactor
pnpm start

# Only document-drive changes
pnpm start -- --type powerhouse/document-drive

# All changes under a specific drive
pnpm start -- --parent-id "abc-123-drive-id"

# Combine filters: drive documents in a specific drive
pnpm start -- --type powerhouse/document-drive --parent-id "abc-123-drive-id"

# Track a specific job
pnpm start -- --job-id "job-uuid-here"

# Custom server URL with auth
pnpm start -- --url ws://staging.example.com/graphql/subscriptions --auth "my-token"
```

## Output format

Each event is logged with a millisecond timestamp:

```
[12:34:56.789] documentChanges [CREATED] My Document (powerhouse/budget-statement) context: {"parentId":"...","childId":"..."}
[12:34:57.012] documentChanges [UPDATED] My Document (powerhouse/budget-statement)
[12:34:58.345] jobChanges [READ_READY] job=abc-123
```

Change types: `CREATED`, `UPDATED`, `DELETED`, `PARENT_ADDED`, `PARENT_REMOVED`, `CHILD_ADDED`, `CHILD_REMOVED`.

## Shutdown

Press `Ctrl+C` for a clean disconnect.
