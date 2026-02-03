# Reactor

## Architecture Overview

```mermaid
graph TB
    subgraph ClientLayer["IReactorClient"]
        ISigner["ISigner"]
        IReactorSubscriptionManager
    end

    subgraph Reactor["IReactor"]
        subgraph WriteLayer["Write Layer"]
            IQueue["IQueue"]
            IJobExecutorManager["IJobExecutorManager"]
            IJobExecutor["IJobExecutor"]
        end

        subgraph CacheLayer["Cache Layer"]
            IOperationIndex["IOperationIndex"]
            IWriteCache["IWriteCache"]
        end

        IOperationStore["IOperationStore"]

        subgraph ReadLayer["Read Layer"]
            IReadModelCoordinator["IReadModelCoordinator"]
            IDocumentView["IDocumentView"]
            IDocumentIndexer["IDocumentIndexer"]
        end
    end

    subgraph EventLayer["Event Layer"]
        IEventBus["IEventBus"]
    end

    subgraph Synchronization
        ISynchronizationManager["ISynchronizationManager"]
        IChannel
        RemoteIChannel
    end

    %% Client to Reactor
    ClientLayer -->|"execute"| IQueue
    ClientLayer -->|"get/find"| IDocumentView
    ClientLayer -->|"get/find"| IDocumentIndexer

    %% Write Path
    IQueue -->|"dequeue"| IJobExecutorManager
    IJobExecutorManager -->|"execute"| IJobExecutor

    %% Job Execution
    IWriteCache -->|"getState"| IJobExecutor
    IWriteCache -->|"getSince"| IOperationStore
    IJobExecutor -->|"apply"| IOperationStore
    IJobExecutor -->|"putState"| IWriteCache
    IJobExecutor -->|"write"| IOperationIndex

    %% Events
    IJobExecutor -->|"OPERATION_WRITTEN"| IEventBus

    %% Read Models
    IEventBus -->|"subscribe"| IReadModelCoordinator
    IReadModelCoordinator -->|"indexOperations"| IDocumentView
    IReadModelCoordinator -->|"indexOperations"| IDocumentIndexer
    IDocumentView -->|"getSinceId"| IOperationStore
    IDocumentIndexer -->|"getSinceId"| IOperationStore


    %% Synchronization
    ISynchronizationManager -->|"subscribe"| IEventBus
    ISynchronizationManager -->|"find"| IOperationIndex
    ISynchronizationManager -->Outbox

    subgraph IChannel
        Inbox
        Outbox
        DeadLetter
    end

    subgraph RemoteIChannel["Remote IChannel"]
        RInbox["Inbox"]
        ROutbox["Outbox"]
    end

    Outbox --> RInbox
    ROutbox --> Inbox
    Inbox -->|"load"| IQueue
```

## Table of Contents

- [Reactor](Reactor/index.md)
- [ReactorClient](ReactorClient/index.md)
- [Auth](Auth/index.md)
- [Graceful Shutdown](GracefulShutdown/index.md)
- [Scaling](Scaling/index.md)

### Components

- [PHDocument](PHDocument/index.md)
- [Attachments](Attachments/index.md)
- [Operations](Operations/index.md)
- [Queue](Queue/index.md)
- [Events](Events/index.md)
- [Jobs](Jobs/index.md)
- [Processors](Processors/index.md)
- [Subscriptions](Subscriptions/index.md)
- [Storage](Storage/index.md)
- [Synchronization](Synchronization/index.md)
- [GraphQL](GraphQL/index.md)
- [Utils](Utils/index.md)
- [Shared](Shared/index.md)

### Implementation

- [Implementation Plan](implementation-plan.md)
- [Testing Strategy](testing-strategy.md)
