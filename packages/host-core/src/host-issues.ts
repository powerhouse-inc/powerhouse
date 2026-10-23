/** Where in the `ph run` pipeline a host check found an issue. */
export type CheckStage = "load" | "declared" | "resolve" | "resolved" | "boot";

export interface HostIssue {
  stage: CheckStage;
  /** A compound's issues come from its members' files too. */
  file: string;
  /** Empty when the issue concerns the file as a whole. */
  path: string;
  message: string;
  hint?: string;
}
