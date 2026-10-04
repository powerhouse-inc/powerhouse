// `ctx.reactor` — the one way piece code reaches the reactor it runs inside.

// Pieces are isolated from the host on purpose, so this is not a client: it is
// the same call channel `ctx.store` uses (doc 08 §10), and every method is a
// round trip the host answers. The host installs it only for a piece that came
// from an installed reactor package; a bundle fetched from a registry gets the
// throwing stub instead, and finds out by name that it has no reactor.
import {
  callHost,
  HostCallIndeterminateError,
  HostCallTimeoutError,
  hostCallTimeoutMs,
} from "../worker/host-call.js";
import { markIndeterminate } from "../indeterminate.js";
import type { StoreScopeName } from "./store-scope.js";
import type {
  ReactorCreateInput,
  ReactorDocumentSummary,
  ReactorExecuteInput,
  ReactorFindInput,
  ReactorModelDetail,
  ReactorModelSummary,
  ReactorService,
} from "@powerhousedao/pieces-framework";
import {
  REACTOR_FIND,
  REACTOR_GET,
  REACTOR_MODEL,
  REACTOR_MODELS,
  REACTOR_SUBMIT,
  REACTOR_SUBMIT_CREATE,
  REACTOR_WAIT,
} from "../worker/protocol.js";

// The service contract and its input/output shapes live in the framework, so a
// piece and the host it calls are typed against one declaration.
export type {
  ReactorActionInput,
  ReactorCreateInput,
  ReactorDocumentSummary,
  ReactorExecuteInput,
  ReactorFindInput,
  ReactorModelActionSchema,
  ReactorModelDetail,
  ReactorModelSummary,
  ReactorService,
} from "@powerhousedao/pieces-framework";

// `actionIds` are in the order the actions were given.
export interface ReactorSubmission {
  jobId: string;
  actionIds: string[];
}

// The document exists once every job has landed; `followUps` then complete it.
export interface ReactorCreateSubmission {
  documentId: string;
  jobIds: string[];
  followUps: ReactorExecuteInput[];
}

export interface ReactorWaitInput {
  jobId: string;
  maxWaitMs: number;
}

// UNKNOWN: no record of the job (a restart); its actions may or may not be written.
export type ReactorJobStatus =
  | "PENDING"
  | "RUNNING"
  | "WRITE_READY"
  | "READ_READY"
  | "FAILED"
  | "UNKNOWN";

export interface ReactorActionOutcome {
  actionId: string;
  kind: "applied" | "reducer-error" | "denied";
  message?: string;
  reason?: string;
}

// `actions` appears once the job's operations are written.
export interface ReactorJobState {
  jobId: string;
  status: ReactorJobStatus;
  error?: string;
  actions?: ReactorActionOutcome[];
}

// Each wait stays well under the host-call cap, and under the host's own clamp.
const MAX_POLL_WAIT_MS = 4_000;

// Stop waiting this long before the kill, to answer the last wait and report why.
const MIN_DEADLINE_MARGIN_MS = 250;
const MAX_DEADLINE_MARGIN_MS = 2_000;

export function deadlineMargin(budgetMs: number): number {
  return Math.min(
    Math.max(Math.floor(budgetMs / 10), MIN_DEADLINE_MARGIN_MS),
    MAX_DEADLINE_MARGIN_MS,
  );
}

// The write was submitted but its outcome was not seen: it may still land.
export class ReactorJobPendingError extends Error {
  readonly jobId: string;
  readonly status: ReactorJobStatus;

  constructor(jobId: string, status: ReactorJobStatus) {
    super(
      status === "UNKNOWN"
        ? `Reactor job ${jobId} is unknown to the reactor, as after a restart; its actions may or may not have been written`
        : `Reactor job ${jobId} was still ${status} at the step deadline; its actions may yet be written`,
    );
    this.name = "ReactorJobPendingError";
    this.jobId = jobId;
    this.status = status;
    // The job WAS submitted; only its outcome is unknown. Reporting the step
    // FAILED would be a claim nobody can stand behind.
    markIndeterminate(this);
  }
}

// The submit got no answer in time: the job may or may not exist.
export class ReactorSubmitUnconfirmedError extends Error {
  constructor(what: string) {
    super(
      `Submitting ${what} to the reactor got no answer before the step deadline; it may have been submitted`,
    );
    this.name = "ReactorSubmitUnconfirmedError";
    markIndeterminate(this);
  }
}

export class ReactorBudgetExhaustedError extends Error {
  constructor(what: string) {
    super(
      `No time was left before the step deadline to submit ${what}; nothing was submitted`,
    );
    this.name = "ReactorBudgetExhaustedError";
  }
}

// The job applied, but the document it wrote was not read back in time.
export class ReactorStateUnreadError extends Error {
  readonly jobId: string;

  constructor(jobId: string) {
    super(
      `Reactor job ${jobId} applied its actions, but the document was not read back before the step deadline`,
    );
    this.name = "ReactorStateUnreadError";
    this.jobId = jobId;
  }
}

export class ReactorJobFailedError extends Error {
  readonly jobId: string;

  constructor(jobId: string, detail: string | undefined) {
    super(`Reactor job ${jobId} failed: ${detail ?? "unknown error"}`);
    this.name = "ReactorJobFailedError";
    this.jobId = jobId;
  }
}

// A reducer error or a denial does not fail the job, so each action is checked.
export function assertActionsApplied(
  state: ReactorJobState,
  submission: ReactorSubmission,
  actions: readonly { type: string }[],
): void {
  if (!state.actions) {
    throw new Error(
      `Reactor job ${state.jobId} reported no outcome for its ${submission.actionIds.length} action(s)`,
    );
  }
  const outcomes = new Map(
    state.actions.map((outcome) => [outcome.actionId, outcome]),
  );
  // All of them: a model-written payload tends to fail a field at a time.
  const failed = submission.actionIds.flatMap((actionId, index) => {
    const type = actions[index]?.type ?? actionId;
    const outcome = outcomes.get(actionId);
    if (!outcome) return [`Action ${type} produced no operation`];
    if (outcome.kind === "reducer-error") {
      return [`Action ${type} failed: ${outcome.message ?? "unknown error"}`];
    }
    if (outcome.kind === "denied") {
      return [`Action ${type} was denied: ${outcome.reason ?? "no reason"}`];
    }
    return [];
  });
  if (failed.length > 0) throw new Error(failed.join("; "));
}

export interface JobRecordStore {
  put(
    key: string,
    value: unknown,
    scope: StoreScopeName,
    timeoutMs?: number,
  ): Promise<unknown>;
}

export interface RemoteReactorOptions {
  // Epoch ms at which the host kills this worker.
  deadline?: number;
  // Durable ctx.store; a submitted job is recorded there under the step's name.
  store?: JobRecordStore;
  stepName?: string;
}

function jobKey(stepName: string | undefined): string {
  return `reactor.job/${stepName ?? "step"}`;
}

// The worker's half: every method is one host call, named so a failure reads
// as the operation the piece asked for. A write is several, none of them long.
export class RemoteReactorService implements ReactorService {
  private readonly stopAt: number;
  private readonly margin: number;

  constructor(private readonly options: RemoteReactorOptions = {}) {
    const { deadline } = options;
    this.margin =
      deadline === undefined ? 0 : deadlineMargin(deadline - Date.now());
    this.stopAt =
      deadline === undefined
        ? Number.POSITIVE_INFINITY
        : deadline - this.margin;
  }

  // What a call after the job landed may take: up to stopAt, and never less
  // than half the margin, which still leaves a quarter of it to report in.
  // A quarter of the margin for the answer to arrive once the wait ends.
  private waitCallMs(maxWaitMs: number): number {
    if (this.options.deadline === undefined) return hostCallTimeoutMs();
    return Math.min(hostCallTimeoutMs(), maxWaitMs + this.margin / 4);
  }

  private afterJobMs(): number {
    return Math.min(
      hostCallTimeoutMs(),
      Math.max(this.stopAt - Date.now(), this.margin / 2),
    );
  }

  models(): Promise<ReactorModelSummary[]> {
    return callHost<ReactorModelSummary[]>(REACTOR_MODELS, {});
  }

  model(documentType: string): Promise<ReactorModelDetail> {
    return callHost<ReactorModelDetail>(REACTOR_MODEL, { documentType });
  }

  get(input: {
    documentId: string;
    branch?: string;
  }): Promise<ReactorDocumentSummary> {
    return callHost<ReactorDocumentSummary>(REACTOR_GET, input);
  }

  find(input: ReactorFindInput): Promise<ReactorDocumentSummary[]> {
    return callHost<ReactorDocumentSummary[]>(REACTOR_FIND, input);
  }

  async create(input: ReactorCreateInput): Promise<ReactorDocumentSummary> {
    const submission = await this.submitWithin<ReactorCreateSubmission>(
      REACTOR_SUBMIT_CREATE,
      input,
      `a ${input.documentType} document`,
    );
    const { documentId, jobIds } = submission;
    void this.record({ documentId, jobIds });
    let landed: string | undefined;
    try {
      for (const jobId of jobIds) {
        await this.settle(jobId);
        landed = jobId;
      }
      for (const followUp of submission.followUps) {
        landed = await this.write(followUp);
      }
      return await this.readBack(documentId, undefined, landed ?? documentId);
    } catch (error) {
      // Once the create has landed, a later failure must still say it exists.
      if (landed && error instanceof Error) {
        error.message = `Document ${documentId} was created, but: ${error.message}`;
      }
      throw error;
    }
  }

  async execute(input: ReactorExecuteInput): Promise<ReactorDocumentSummary> {
    const jobId = await this.write(input, true);
    return this.readBack(input.documentId, input.branch, jobId);
  }

  // Submits, waits and checks each action; answers the job that carried them.
  private async write(
    input: ReactorExecuteInput,
    recorded = false,
  ): Promise<string> {
    const submission = await this.submitWithin<ReactorSubmission>(
      REACTOR_SUBMIT,
      input,
      `${input.actions.length} action(s)`,
    );
    // Alongside the wait rather than before it, so it never spends the budget.
    if (recorded) void this.record(submission);
    const state = await this.settle(submission.jobId);
    assertActionsApplied(state, submission, input.actions);
    return submission.jobId;
  }

  private async readBack(
    documentId: string,
    branch: string | undefined,
    jobId: string,
  ): Promise<ReactorDocumentSummary> {
    try {
      return await callHost<ReactorDocumentSummary>(
        REACTOR_GET,
        { documentId, ...(branch ? { branch } : {}) },
        this.afterJobMs(),
      );
    } catch (error) {
      if (error instanceof HostCallTimeoutError) {
        throw new ReactorStateUnreadError(jobId);
      }
      throw error;
    }
  }

  private async submitWithin<T>(
    method: string,
    input: unknown,
    what: string,
  ): Promise<T> {
    const remaining = this.stopAt - Date.now();
    if (remaining <= 0) throw new ReactorBudgetExhaustedError(what);
    try {
      return await callHost<T>(
        method,
        input,
        Math.min(hostCallTimeoutMs(), remaining),
      );
    } catch (error) {
      // Either timeout class: the mutating one is already indeterminate, and
      // this error says the same thing in the reactor port's own words.
      if (
        error instanceof HostCallTimeoutError ||
        error instanceof HostCallIndeterminateError
      ) {
        throw new ReactorSubmitUnconfirmedError(what);
      }
      throw error;
    }
  }

  private async record(value: unknown): Promise<void> {
    const { store, stepName } = this.options;
    if (!store) return;
    try {
      await store.put(jobKey(stepName), value, "FLOW", this.afterJobMs());
    } catch {
      // Bookkeeping only: the write is already submitted either way.
    }
  }

  private async settle(jobId: string): Promise<ReactorJobState> {
    let status: ReactorJobStatus = "PENDING";
    for (;;) {
      const remaining = this.stopAt - Date.now();
      if (remaining <= 0) throw new ReactorJobPendingError(jobId, status);
      const maxWaitMs = Math.min(
        MAX_POLL_WAIT_MS,
        Math.floor(hostCallTimeoutMs() / 2),
        remaining,
      );
      let state: ReactorJobState;
      try {
        state = await callHost<ReactorJobState>(
          REACTOR_WAIT,
          { jobId, maxWaitMs },
          this.waitCallMs(maxWaitMs),
        );
      } catch (error) {
        if (error instanceof HostCallTimeoutError) {
          throw new ReactorJobPendingError(jobId, status);
        }
        throw error;
      }
      if (state.status === "READ_READY") return state;
      if (state.status === "FAILED") {
        throw new ReactorJobFailedError(jobId, state.error);
      }
      if (state.status === "UNKNOWN") {
        throw new ReactorJobPendingError(jobId, "UNKNOWN");
      }
      status = state.status;
    }
  }
}
