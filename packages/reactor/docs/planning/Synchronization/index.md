# Synchronization

Consider a synchronization scheme that relies on a unidirectional flow of data from Operations Store to Read Model. This diagram shows **flow**, not dependencies. Start at **(1)** and follow the numbered arrows to see each subsequent step.

Key points:

- We focus on synchronizing the IOperationsStore,  and bubbling outward.
    - This allows us to decouple sync and Document View updates.
    - This consolidates `ListenerManager`, `SyncManager`, and Document View update flows into a single dispatch pattern.
- **`SyncManager`**
    - In this diagram, this object is not an exact mapping to the current `SyncManager`.
    - The `SyncManager` has its own storage mechanism and rather than being tied so the internal mechanisms of the Reactor, propagates from the event bus.

### Push

Describes a one-way flow of data from one Reactor to another, pushing operations through an `IChannel` interface.

```mermaid
graph 
    subgraph "IReactor A"
        AQueue["IQueue"] -->|"(1)"| AJobs["IJobExecutor"] -->|"(2) Write"| AOS["IOperationsStore"]
        AOS -->|"(3)"| APub

        subgraph AEvents["IEventBus"]
            APub["emit()"]
            ASub["on()"]
        end
    end

    ASub -->|"(4)"| ASync["ISyncManager"]
    ASync -->|"(5)"| ISyncStorage
    ASync -->|"(6)"| Trigger -->|"(7)"| IChannel -->|"(8)"| BQueue

    subgraph "Reactor B"
        BQueue["IQueue"] -->|"(9)"| BJobs["IJobExecutor"] -->|"(10) Write"| BOS["IOperationsStore"]
        BOS -->|"(11)"| BPub

        subgraph BEvents["IEventBus"]
            BPub["emit()"]
            BSub["on()"]
        end
    end
```

### Pull

Describes a one-way flow of data from one Reactor to another, pulling operations through an `IChannel` interface on an interval.

```mermaid
graph 
    subgraph "IReactor A"
        ADV["IDocumentView"]
    end

    subgraph "Reactor B"
        BQueue --> BJobs["IJobExecutor"] --> BOS["IOperationsStore"]
        BOS --> BPub

        subgraph BEvents["IEventBus"]
            BPub["emit()"]
            BSub["on()"]
        end
    end

    BScheduler["Scheduler Interval"] -->|"(1) Interval"| BSync["ISyncManager"]
    BSync -->|"(2) Query"| IChannel
    IChannel -->|"(3) Read"| ADV
    IChannel -->|"(4) Operations"| BSync
    BSync -->|"(5) Enqueue"| BQueue["IQueue"]
```

### Ping-Pong

Since both `Push-to-Switchboard` and `Pull-from-Switchboard` are one-way flows, we combine them into a ping-pong pattern. This is where both reactors are pushing and pulling through the `IChannel` interface.

The schedulers are "smart" and understand how to optimimally set intervals based on a number of factors, including:

- Operation characteristics (size, frequency, etc.)
- Network characteristics (latency, bandwidth, etc.)
- Reactor characteristics (CPU, memory, etc.)
- Recent pushes from other reactor

```mermaid
graph
    %% === Reactor A ===
    subgraph "IReactor A"
        AQueue["IQueue"] --> AJobs["IJobExecutor"] --> AOS["IOperationsStore"]
        AOS --> APub

        subgraph AEventBus["IEventBus"]
            APub["emit()"]
            ASub["on()"]
        end

        subgraph ASyncManager["Synchronization"]
            AScheduler["Scheduler"] --> ASync["ISyncManager"]
            ASync --> ASyncStore["ISyncStorage"]
        end

        ASub --> ASync
        ASync --> AQueue
    end

    %% Network
    ASync <--> AIChannel["IChannel"]
    AIChannel <--> Transport["Memory / HTTP / WebSocket / etc."]
    Transport <--> BAIChannel["IChannel"]
    BAIChannel <--> BSync

    %% === Reactor B ===
    subgraph "IReactor B"
        BQueue["IQueue"] --> BJobs["IJobExecutor"] --> BOS["IOperationsStore"]
        BOS --> BPub

        subgraph BEventBus["IEventBus"]
            BPub["emit()"]
            BSub["on()"]
        end

        subgraph BSyncManager["Synchronization"]
            BScheduler["Scheduler"] --> BSync["ISyncManager"]
            BSync --> BSyncStore["ISyncStorage"]
        end
        
        BSub --> BSync
        BSync --> BQueue
    end
```

### Ping-Pong: Sequence

```mermaid
sequenceDiagram
    participant EBA as Event Bus A
    participant QA as Queue A
    participant SMA as Sync Manager A
    participant SMB as Sync Manager B
    participant QB as Queue B
    participant EBB as Event Bus B

    Note over EBA, EBB: Push sync

    %% Reactor A initiates sync
    EBA->>SMA: operations added
    SMA->>SMB: push(operations)
    SMB->>QB: enqueue(operations)
    
    %% Reactor B responds with its operations
    EBB->>SMB: operations added
    SMB->>SMA: push(operations)
    SMA->>QA: enqueue(operations)
    
    %% Continued ping-pong
    EBA->>SMA: operations added
    SMA->>SMB: push(operations)
    SMB->>QB: enqueue(operations)
    
    Note over EBA, EBB: Pull sync

    %% Pull-based sync (scheduled)
    SMA->>SMB: pull() request
    SMB-->>SMA: return(latest operations)
    SMA->>QA: enqueue(operations)
    
    SMB->>SMA: pull() request  
    SMA-->>SMB: return(latest operations)
    SMB->>QB: enqueue(operations)
```

### IChannel

The `IChannel` interface is a bi-directional interface for sending and receiving operations.

```tsx

interface IChannel {
    /**
     * Push operations through to a remote reactor.
     */
    push(operations: Operation[]): void;

    /**
     * Pull operations from a remote reactor.
     */
    pull(): Promise<Operation[]>;
}

```

Note that the `IChannel` interface allows for easy composition, when we want to sync with multiple reactors. This is a naive example:

```tsx

class ChannelCollection<T extends IChannel> implements IChannel {
    constructor(private channels: T[]) {}

    push(operations: Operation[]): void {
        this.channels.forEach(channel => channel.push(operations));
    }

    pull(): Promise<Operation[]> {
        return this.channels.reduce((acc, channel) => acc.then(channel.pull()), Promise.resolve([]));
    }
}

```

### IChannel: Optimization

The `IChannel` implementation is free to batch `push` operations and send them in the `pull` request. Over HTTP, for example, this would result in a single `pull` request that will decompose nicely when there is no socket available.
