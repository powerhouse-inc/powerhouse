// Design-time tests are journaled as runs of this kind.
export const TEST_TRIGGER_KIND = "test";

// Runs as the author sees them: tests aren't executions of the workflow.
export function realRuns<T extends { triggerKind: string }>(runs: T[]): T[] {
  return runs.filter((run) => run.triggerKind !== TEST_TRIGGER_KIND);
}
