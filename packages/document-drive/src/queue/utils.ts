import type { ActionJob, DocumentJob, Job, OperationJob } from "document-drive";

export function isDocumentJob(job: Job): job is DocumentJob {
  return "documentType" in job;
}

export function isOperationJob(job: Job): job is OperationJob {
  return "operations" in job;
}

export function isActionJob(job: Job): job is ActionJob {
  return "actions" in job;
}
