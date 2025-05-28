# Synchronization

Consider a synchronization scheme that relies on a unidirectional flow of data from Operations Store to Read Model. This diagram shows **flow**, not dependencies. Start at **(1)** and follow the numbered arrows to see each subsequent step.

Key points:

- We focus on synchronizing the IOperationsStore,  and bubbling outward.
    - This allows us to decouple sync and Document View updates.
    - This consolidates `ListenerManager`, `SyncManager`, and Document View update flows into a single dispatch pattern.
- **`SyncManager`**
    - In this diagram, this object is not an exact mapping to the current `SyncManager`.
    - The `SyncManager` has its own storage mechanism and rather than being tied so the internal mechanisms of the Reactor, propagates from the event bus.

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
    ASync -->|"(6)"| Trigger -->|"(7)"| GQL -->|"(8)"| BQueue

    subgraph "Reactor B"
        BQueue["IQueue"] -->|"(9)"| BJobs["IJobExecutor"] -->|"(10) Write"| BOS["IOperationsStore"]
        BOS -->|"(11)"| BPub

        subgraph BEvents["IEventBus"]
            BPub["emit()"]
            BSub["on()"]
        end
    end
```