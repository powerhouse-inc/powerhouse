Sync Gap Analysis - Open Issues

4. Dead Letter Handling

4a. No dead letter retry/resolution API

- ISyncManager interface has no methods for dead letter management. KyselySyncDeadLetterStorage has remove(id) and removeByRemote()
  but these aren't exposed through ISyncManager.

---

7. Batch Aggregator

7b. Partial batch emits on failure (batch-aggregator.ts:40-55)

- handleJobFailed deletes the pending batch and processes whatever events arrived. The failed job's operations are silently dropped
  with no notification of incompleteness.
