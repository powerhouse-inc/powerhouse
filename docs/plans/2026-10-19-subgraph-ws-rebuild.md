# Plan: subgraph WebSocket rebuilds

Rebuilding, replacing or removing a subscription subgraph must not take down
`/graphql/subscriptions`.

## What happens today

Every subgraph with `hasSubscriptions` gets its own graphql-ws server, attached
with `useServer` to the one `WebSocketServer` at `/graphql/subscriptions`.

1. **Every socket is served by every subgraph.** Each graphql-ws server sees
   each connection, so a client receives one `connection_ack` per subgraph,
   and each `subscribe` is validated against every subgraph's schema. The first
   schema that lacks the field answers with `Cannot query field ...`, which
   ends the subscription. With the reactor subgraph (`r`) and any package
   subgraph that has subscriptions, no WebSocket subscription works, before
   any rebuild.
2. **Unmounting disposes the shared server.** graphql-ws's `dispose()` closes
   every client with `1001`, removes every listener from the
   `WebSocketServer` and closes it. In server mode that also removes its
   `upgrade` listener. Existing clients drop, and every new connection fails
   with `1006` until the process restarts. The subgraph that is mounted next
   attaches to a closed server.

Unmounting happens when a model edit rebuilds a subgraph whose typeDefs use the
model's types, when a package subgraph is replaced, and when one is removed.
The reactor subgraph does not use model types, so a model edit rebuilds only
package subgraphs. Supergraph SSE at `/graphql/stream` is rebuilt per router
update and keeps streaming.

The WebSocket credential monitor tracks a connection once per `onConnect`, so
today it tracks each socket once per subgraph.

## Fix

One graphql-ws server for `/graphql/subscriptions`, owned by the manager and
attached once, when the first subscription subgraph mounts. Subgraphs register
a schema with it under their mount path:

- **Routing.** graphql-ws's `schema` option takes a function. It receives the
  parsed operation, collects its root fields (following root-level fragments,
  ignoring `__*`), and picks the first registered schema whose root type has
  all of them. graphql-ws still parses and validates. Candidates are ordered
  like supergraph claims: rank of origin, then registration order. If none
  matches, the first schema validates it, which returns the usual
  `Cannot query field` error.
- **Rebuild of the same instance** (model edit): the schema is swapped. Running
  subscriptions keep running, because their resolvers are unchanged and still
  connected. New subscriptions get the new schema.
- **Replacement or removal**: the old instance's running subscriptions are
  ended by calling `return()` on their result iterators, captured in
  `onOperation`. graphql-ws then sends `complete`. The socket stays open, and
  subscriptions on other subgraphs continue.
- **Shutdown** disposes the server as before.

The manager calls `useServer` itself, and `IGatewayAdapter.attachWebSocket` is
removed. Its three implementations were identical `useServer` wrappers, and
routing through it would have meant changing its signature anyway.

### Rejected

- **Keep one server per subgraph and narrow `dispose`** to remove only that
  server's listener, closing its sockets with a retryable code. Every socket
  belongs to every server, so this still closes all clients, and it does not
  fix problem 1.
- **Widen `attachWebSocket` to take a schema resolver.** Works, but changes an
  exported interface. A custom adapter would receive a value that it does not
  handle.

## Tests

`packages/reactor-api/test/subgraph-ws-rebuild.test.ts` uses a real Express
adapter, the Apollo gateway, a `WebSocketServer` at `/graphql/subscriptions`
and a graphql-ws client. Each case fails on the current code:

- a model edit rebuilds a subscription subgraph: its subscription keeps
  delivering, and a new client gets the new schema;
- a package subgraph is replaced: its subscription completes, the socket stays
  open, and a new subscription reaches the replacement;
- a package subgraph is removed: its subscription completes, and the endpoint
  keeps serving the others;
- a second subgraph's subscription on the same socket survives all of the
  above;
- two subscription subgraphs each serve their own fields on one socket.

The unit tests in `graphql-manager.test.ts` that read handlers from the
adapter's `attachWebSocket` mock read them from a mocked `useServer`.
