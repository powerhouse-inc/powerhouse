### Usage

```tsx
// Create queue parameters for a document operation
const queueParams: QueueParameters = {
  documentId: 'doc-123',
  scopes: ['global'],
  branch: 'main',
  actions: [
    {
      type: 'UPDATE_TITLE',
      input: { title: 'New Title' },
      scope: 'global',
      index: 42,
      timestamp: new Date().toISOString(),
      hash: 'abc123',
      skip: 0
    }
  ],
  resultingHash: 'expected-result-hash-456',
  dependsOn: ['previous-job-id-123'] // Optional dependencies
};

// Enqueue the job (returns the job id)
const jobId = queue.enqueue(queueParams);
console.log(`Enqueued job with id: ${jobId}`);

// Get the next job for processing (used by job executor)
const executionHandle = queue.getNext();
if (executionHandle) {
  console.log(`Processing job: ${executionHandle.job.id}`);
  
  // Start the job execution
  executionHandle.start();
  
  try {
    // Perform job processing here...
    // ... processing logic ...
    
    // Mark job as complete
    executionHandle.complete();
    console.log('Job completed successfully');
  } catch (error) {
    // Mark job as failed with reason
    executionHandle.fail(`Processing failed: ${error.message}`);
    console.log('Job failed');
  }
}

// Block the queue from accepting new jobs
queue.block();
console.log('Queue is now blocked');

// Unblock the queue to resume accepting jobs
queue.unblock();
console.log('Queue is now unblocked');
```
