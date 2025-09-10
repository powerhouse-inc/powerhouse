# Usage

```tsx
// Configure and start the job executor
const config: JobExecutorConfig = {
  maxConcurrency: 5,
  jobTimeout: 30000, // 30 seconds
  retryBaseDelay: 1000,
  retryMaxDelay: 10000,
};

// Start the executor (it will listen for 'jobAvailable' events from the event bus)
await jobExecutor.start(config);

// Subscribe to job execution events
const unsubscribeJobCompleted = jobExecutor.on(
  "jobCompleted",
  (result: JobResult) => {
    console.log(`Job ${result.job.id} completed in ${result.duration}ms`);
  },
);

const unsubscribeJobFailed = jobExecutor.on(
  "jobFailed",
  (result: JobResult) => {
    console.error(`Job ${result.job.id} failed: ${result.error}`);
  },
);

// Execute a single job immediately (bypass queue)
const job: Job = {
  id: "urgent-job-123",
  documentId: "doc-456",
  scope: "global",
  branch: "main",
  operation: {
    type: "URGENT_UPDATE",
    input: { data: "critical update" },
    scope: "global",
    index: 100,
    timestamp: new Date().toISOString(),
    hash: "def456",
    skip: 0,
  },
  createdAt: new Date().toISOString(),
};

const result = await jobExecutor.executeJob(job);
if (result.success) {
  console.log("Urgent job completed successfully");
} else {
  console.error("Urgent job failed:", result.error);
}

// Get executor status
const status = await jobExecutor.getStatus();
console.log(`Executor running: ${status.isRunning}`);
console.log(`Active jobs: ${status.activeJobs}`);
console.log(
  `Success rate: ${status.totalJobsSucceeded}/${status.totalJobsProcessed}`,
);

// Get performance statistics
const stats = await jobExecutor.getStats();
console.log(`Average execution time: ${stats.averageExecutionTime}ms`);
console.log(`Success rate: ${(stats.successRate * 100).toFixed(2)}%`);
console.log(`Jobs per second: ${stats.jobsPerSecond}`);

// Pause execution temporarily
await jobExecutor.pause();
console.log("Job execution paused");

// Resume execution
await jobExecutor.resume();
console.log("Job execution resumed");

// Gracefully stop the executor
await jobExecutor.stop(true); // true = wait for current jobs to complete

// Clean up event subscriptions
unsubscribeJobCompleted();
unsubscribeJobFailed();
```
