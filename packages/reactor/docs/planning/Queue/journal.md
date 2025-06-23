# IQueueJournal

The `IQueueJournal` is responsible for implementing the durable journal.

### Interface

```tsx

type JsonValue =
  | string
  | number
  | boolean
  | { [key: string]: JsonValue }
  | JsonValue[];

interface IQueueJournal {
  create(job: Job, queueState: JobQueueState): Promise<void>;
  complete(jobId: string): Promise<void>;
  fail(jobId: string, reason: string): Promise<void>;
  findUnresolvedJobs(): Promise<Job[]>;
}

```

### RedisQueueJournal

The `RedisQueueJournal` is a durable journal implementation that uses Redis as the underlying storage.

This is used on the server.

### IndexedDBQueueJournal

The `IndexedDBQueueJournal` is a durable journal implementation that uses IndexedDB as the underlying storage.

This is used on the client.

### InMemoryQueueJournal

The `InMemoryQueueJournal` is a durable journal implementation that uses an in-memory map as the underlying storage.

This is used in tests.
