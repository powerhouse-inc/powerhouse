# Usage: IQueue

```tsx
// Create a new job for a document operation
const job: Job = {
  id: crypto.randomUUID(),
  documentId: 'doc-123',
  scope: 'global',
  branch: 'main',
  operation: {
    type: 'UPDATE_TITLE',
    input: { title: 'New Title' },
    scope: 'global',
    index: 42,
    timestamp: new Date().toISOString(),
    hash: 'abc123',
    skip: 0
  },
  createdAt: new Date().toISOString(),
  maxRetries: 3
};

// Enqueue the job (this will emit a 'jobAvailable' event to the event bus)
await queue.enqueue(job);

// Check queue size for a specific document/scope/branch
const queueSize = await queue.size('doc-123', 'global', 'main');
console.log(`Queue size: ${queueSize}`);

// Get the next job for processing (used by job executor)
const nextJob = await queue.dequeueNext();
if (nextJob) {
  console.log(`Processing job: ${nextJob.id}`);
}

// Remove a specific job if needed
const removed = await queue.remove('job-id-456');
if (removed) {
  console.log('Job removed successfully');
}

// Clear all jobs for a specific document context
await queue.clear('doc-123', 'global', 'main');

// Get total queue size across all documents
const totalSize = await queue.totalSize();
console.log(`Total jobs in queue: ${totalSize}`);
``` 