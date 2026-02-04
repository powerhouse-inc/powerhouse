# GqlChannel - GraphQL-based Network Synchronization

## Overview

`GqlChannel` is an implementation of `IChannel` that enables synchronization between reactor instances across a network using GraphQL queries and mutations. It provides bidirectional communication through a polling-based transport mechanism.

## Architecture

### Transport Mechanism

GqlChannel uses HTTP/GraphQL as the transport layer:

- **Outbox (Push)**: GraphQL mutation `pushSyncEnvelope` sends operations to the remote reactor
- **Inbox (Pull)**: GraphQL query `pollSyncEnvelopes` periodically polls the remote reactor for new operations

### Components

```
┌────────────────────────────────────────────────────────────────┐
│ Local Reactor                                                  │
│                                                                │
│  ┌──────────────┐        ┌──────────────────────────────────┐  │
│  │ SyncManager  │───────▶│ GqlChannel                       │  │
│  └──────────────┘        │                                  │  │
│                          │  Mailboxes:                      │  │
│                          │  • inbox    (ops from remote)    │  │
│                          │  • outbox   (ops to remote)      │  │
│                          │  • deadLetter (failed ops)       │  │
│                          │                                  │  │
│                          │  Polling Loop:                   │  │
│                          │  • Query remote every N ms       │  │
│                          │  • Cursor-based incremental sync │  │
│                          │                                  │  │
│                          │  Outbox Handler:                 │  │
│                          │  • Sends ops via mutation        │  │
│                          └────────┬─────────────────────────┘  │
│                                   │ HTTP/GraphQL               │
└───────────────────────────────────┼────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────┐
│ Remote Reactor                                                │
│                                                               │
│  ┌──────────────────────┐      ┌──────────────────────────┐   │
│  │ GraphQL Resolvers    │      │ ISyncManager             │   │
│  │                      │─────▶│                          │   │
│  │ • pollSyncEnvelopes  │      │ Access channel by ID:    │   │
│  │ • pushSyncEnvelope   │      │ • Read from outbox       │   │
│  │ • createChannel      │      │ • Write to inbox         │   │
│  └──────────────────────┘      │                          │   │
│                                │ Channel mailboxes handle │   │
│                                │ all operation routing    │   │
│                                └──────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
```

## Configuration

GqlChannel is configured via `ChannelConfig.parameters`:

```typescript
{
  type: "gql",
  channelId: "channel-uuid",
  remoteName: "remote-name",
  parameters: {
    // Required
    url: "https://remote-reactor.example.com/graphql",
    
    // Optional
    authToken: "bearer-token",           // Auth token for remote
    pollIntervalMs: 5000,                // Polling interval (default: 5000)
    retryBaseDelayMs: 1000,              // Base delay for retries (default: 1000)
    retryMaxDelayMs: 300000,             // Max delay for retries (default: 300000)
    maxFailures: 5                       // Max failures before stopping (default: 5)
  }
}
```

### Creating a GqlChannel

```typescript
import { GqlChannelFactory } from "@powerhousedao/reactor";

const factory = new GqlChannelFactory();

const channel = factory.instance(
  {
    type: "gql",
    channelId: "550e8400-e29b-41d4-a716-446655440000",
    remoteName: "production-reactor",
    parameters: {
      url: "https://reactor.prod.example.com/graphql",
      authToken: process.env.REACTOR_AUTH_TOKEN,
      pollIntervalMs: 3000,
    },
  },
  cursorStorage,
);
```

## Polling Strategy

### Cursor-Based Incremental Sync

GqlChannel uses cursor-based polling to efficiently sync only new operations:

1. **Read cursor**: Get last processed ordinal from `ISyncCursorStorage`
2. **Query operations**: Request operations where `ordinal > cursor`
3. **Process envelopes**: Add received operations to inbox
4. **Update cursor**: Store new cursor position after successful processing

### Polling Loop

```typescript
// Pseudo-code
async poll() {
  const cursor = await cursorStorage.get(remoteName);
  const cursorOrdinal = cursor?.cursorOrdinal ?? 0;
  
  const envelopes = await query(`
    pollSyncEnvelopes(
      channelId: "${channelId}",
      cursorOrdinal: ${cursorOrdinal}
    )
  `);
  
  for (const envelope of envelopes) {
    inbox.add(envelopeToSyncOperation(envelope));
  }
  
  scheduleNextPoll();
}
```

### Performance Considerations

- **Poll Interval**: Balance between latency and network overhead
  - Low latency: 1-3 seconds
  - Normal: 5-10 seconds
  - Low priority: 30-60 seconds

- **Batch Size**: Remote server should limit results per query
  - Recommended: 10-100 operations per poll
  - Prevents overwhelming the local reactor

- **Network Efficiency**: Cursor-based approach ensures only new operations are transferred

## Error Handling

### Failure Categories

1. **Network Errors**: Connection timeout, DNS failure, etc.
2. **Authentication Errors**: Invalid or expired tokens
3. **GraphQL Errors**: Malformed queries, server errors
4. **Operation Errors**: Invalid operations, hash mismatches

### Retry Strategy

GqlChannel implements exponential backoff with failure threshold:

```
retryDelayMs = min(maxDelay, baseDelay * 2^failureCount + jitter)
```

**Default values:**
- `baseDelay`: 1000ms
- `maxDelay`: 300000ms (5 minutes)
- `maxFailures`: 5

**Behavior:**
- Failures increment `failureCount`
- Success resets `failureCount` to 0
- After `maxFailures` consecutive failures, polling stops
- Manual intervention required to restart

### Dead Letter Queue

Operations that fail permanently move to `deadLetter` mailbox:

- Network errors during push → deadLetter
- Repeated failures → deadLetter
- Manual inspection and retry required

## Security Considerations

### Authentication

- **Bearer Tokens**: Store in `parameters.authToken`
- **Token Rotation**: Update config when tokens expire
- **Secure Storage**: Keep tokens in environment variables, not in code

### HTTPS

- **Always use HTTPS** in production
- Ensures encrypted communication
- Prevents man-in-the-middle attacks

### Authorization

Server-side resolvers should:
- Verify auth tokens
- Check permissions for channel access
- Validate channel ownership
- Rate limit requests

## GraphQL Schema

See [GraphQL Schema Documentation](../GraphQL/index.md#synchronization-operations) for the complete schema definition.

### Key Types

- `SyncEnvelope`: Container for operations being transported
- `OperationWithContext`: Operation plus routing metadata
- `ChannelMeta`: Channel identification
- `RemoteCursor`: Cursor for incremental sync

### Operations

```graphql
type Query {
  pollSyncEnvelopes(
    channelId: String!
    cursorOrdinal: Int!
  ): [SyncEnvelope!]!
}

type Mutation {
  pushSyncEnvelope(
    envelope: SyncEnvelopeInput!
  ): Boolean!
}
```

## Integration with SyncManager

GqlChannel integrates seamlessly with `ISyncManager`:

1. **Remote Configuration**: Admin configures remote with GqlChannel
2. **Channel Creation**: SyncManager uses `GqlChannelFactory` to create channel
3. **Lifecycle Management**: SyncManager starts/stops channel
4. **Mailbox Processing**: SyncManager subscribes to inbox/outbox events
5. **Cursor Management**: SyncManager updates cursors after processing operations

## Comparison with InternalChannel

| Feature | InternalChannel | GqlChannel |
|---------|----------------|------------|
| **Transport** | Direct function call | HTTP/GraphQL |
| **Latency** | Microseconds | Milliseconds to seconds |
| **Network** | In-process only | Across network |
| **Use Case** | Testing, same process | Production, distributed |
| **Reliability** | 100% | Network dependent |
| **Security** | N/A | HTTPS + auth tokens |

## Future Enhancements

### Subscription-based Push

Replace polling with GraphQL subscriptions for lower latency:

```graphql
type Subscription {
  syncEnvelopeAdded(channelId: String!): SyncEnvelope!
}
```

Benefits:
- Near real-time sync
- Lower bandwidth (no polling)
- Better user experience

Challenges:
- Requires WebSocket support
- More complex connection management
- Firewall compatibility

### Compression

Add operation payload compression:

```typescript
parameters: {
  compression: "gzip" | "brotli",
  compressionLevel: 6
}
```

Benefits:
- Reduced bandwidth
- Faster transmission
- Lower costs

### Multiplexing

Allow single GqlChannel to handle multiple remotes:

```typescript
parameters: {
  remoteNames: ["remote1", "remote2", "remote3"]
}
```

Benefits:
- Fewer network connections
- Better resource utilization
- Simplified configuration

## Testing

### Unit Tests

```typescript
describe("GqlChannel", () => {
  it("should poll remote for operations", async () => {
    const mockFetch = vi.fn().mockResolvedValue(mockResponse);
    global.fetch = mockFetch;
    
    const channel = new GqlChannel(/*...*/);
    
    // Wait for poll
    await vi.advanceTimersByTime(5000);
    
    expect(mockFetch).toHaveBeenCalledWith(
      "https://remote.example.com/graphql",
      expect.objectContaining({
        method: "POST"
      })
    );
  });
});
```

### Integration Tests

Test two reactors syncing via GqlChannel:

```typescript
it("should sync operations between reactors", async () => {
  const reactor1 = await buildReactor1WithGqlChannel();
  const reactor2 = await buildReactor2WithGqlChannel();
  
  const doc = await reactor1.create(/*...*/);
  
  // Wait for sync
  await waitForOperationsReady(reactor2.eventBus);
  
  const syncedDoc = await reactor2.get(doc.id);
  expect(syncedDoc).toEqual(doc);
});
```

## References

- [Synchronization Specification](./index.md)
- [IChannel Interface](./index.md#ichannel)
- [InternalChannel](../../src/sync/channels/internal-channel.ts)
- [GqlChannel Implementation](../../src/sync/channels/gql-channel.ts)
- [GqlChannelFactory Implementation](../../src/sync/channels/gql-channel-factory.ts)

