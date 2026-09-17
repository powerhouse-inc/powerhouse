/** One attempt: prepare, build, test, extract, judge, verify, record. */
import { createWorkflow } from "@mastra/core/workflows";
import { acceptance } from "../steps/acceptance.js";
import { build } from "../steps/build.js";
import { extract } from "../steps/extract.js";
import { judge } from "../steps/judge.js";
import { prepareWorkspace } from "../steps/prepare-workspace.js";
import { record, TaskRunOutput } from "../steps/record.js";
import { TaskRunInput } from "../steps/shared.js";
import { verify } from "../steps/verify.js";

export { TaskRunInput, TaskRunOutput };

// Every step returns its output file when it already exists, so re-driving
// a run with the same runId skips finished work. A human review seam between
// judge and verify (suspend/resume) is deliberately out of v1: --skip-verify.
export const taskRun = createWorkflow({
  id: "taskRun",
  inputSchema: TaskRunInput,
  outputSchema: TaskRunOutput,
  options: { autoRestartActiveRuns: false },
})
  .then(prepareWorkspace)
  .then(build)
  .then(acceptance)
  .then(extract)
  .then(judge)
  .then(verify)
  .then(record)
  .commit();
