# Document Drive Synchronization

This document describes the synchronization mechanism between two BaseDocumentDriveServers.

## Sequence Diagram

```mermaid
sequenceDiagram
    participant Connect as Connect Server
    participant Reactor as Reactor Server

    %% Initial setup for pull-based sync
    Connect->>Reactor: registerPullResponderListener(filter)
    Reactor-->>Connect: listenerId
    Note over Connect, Reactor: Connect now has a listenerId to pull data from Reactor

    %% Pull-based synchronization loop
    loop Pull Interval
        Connect->>Reactor: pullStrands(listenerId)
        Reactor-->>Connect: StrandUpdates[]

        alt Has strands to process
            Note over Connect: Process each strand
            loop For each strand
                Connect->>Connect: Process operations in strand
            end
            Connect->>Reactor: acknowledgeStrands(listenerId, revisions)
            Reactor-->>Connect: Success/Failure
        else No strands
            Note over Connect: Do nothing until next interval
        end
    end

    %% Push-based sync (can happen independently)
    Note over Connect, Reactor: When Connect has new operations
    Connect->>Reactor: pushUpdates(strands)
    Note over Reactor: Process incoming strands
    Reactor-->>Connect: ListenerRevisions[]

    %% Bi-directional sync (Reactor to Connect)
    Note over Connect, Reactor: Reactor can also pull from Connect in the same way
    Reactor->>Connect: registerPullResponderListener(filter)
    Connect-->>Reactor: listenerId

    loop Pull Interval
        Reactor->>Connect: pullStrands(listenerId)
        Connect-->>Reactor: StrandUpdates[]
        alt Has strands to process
            Reactor->>Reactor: Process operations in strands
            Reactor->>Connect: acknowledgeStrands(listenerId, revisions)
            Connect-->>Reactor: Success/Failure
        end
    end

    %% Push from Reactor to Connect
    Note over Reactor, Connect: When Reactor has new operations
    Reactor->>Connect: pushUpdates(strands)
    Connect-->>Reactor: ListenerRevisions[]
```

## Synchronization Overview

The synchronization between document drive servers uses both pull and push mechanisms:

### Pull-based Synchronization

1. **Registration**: A server registers as a pull responder listener on another server
2. **Periodic Pulls**: At regular intervals, the server pulls strands of operations
3. **Processing**: The server processes the operations locally
4. **Acknowledgment**: The server acknowledges processing by sending listener revisions

### Push-based Synchronization

1. **Direct Push**: When a server has new operations, it can directly push them to another server
2. **Batching**: Operations are batched to avoid overwhelming the receiving server
3. **Acknowledgment**: The receiving server returns listener revisions to confirm receipt

This bi-directional synchronization ensures that changes made on either server propagate to the other, maintaining consistency between distributed document drives.
