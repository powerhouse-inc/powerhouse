import type {
  Action,
  ISigner,
  Operation,
  PHDocument,
  Signature,
} from "document-model";
import { v4 as uuidv4 } from "uuid";
import type { ErrorInfo, JobMeta, PagedResults } from "../shared/types.js";

/**
 * Represents a minimal job plan for validation purposes
 */
export type JobPlanForValidation = {
  key: string;
  actions: Action[];
  dependsOn: string[];
};

/**
 * Represents a minimal load job plan for validation purposes
 */
export type LoadJobPlanForValidation = {
  key: string;
  operations: Operation[];
  dependsOn: string[];
};

/**
 * Represents a job plan with scope information for action validation
 */
export type JobPlanWithScope = {
  key: string;
  scope: string;
  actions: Action[];
};

/**
 * Represents a load job plan with scope information for operation validation
 */
export type LoadJobPlanWithScope = {
  key: string;
  scope: string;
  operations: Operation[];
};

/**
 * Represents a job plan with dependencies for topological sorting
 */
export type JobPlanForSorting = {
  key: string;
  dependsOn: string[];
};

/**
 * Validates structural properties shared by all batch requests:
 * duplicate keys, missing dependencies, and dependency cycles.
 */
export function validateBatchStructure(jobs: JobPlanForSorting[]): void {
  const keys = new Set<string>();
  for (const job of jobs) {
    if (keys.has(job.key)) {
      throw new Error(`Duplicate plan key: ${job.key}`);
    }
    keys.add(job.key);
  }
  for (const job of jobs) {
    for (const depKey of job.dependsOn) {
      if (!keys.has(depKey)) {
        throw new Error(
          `Job '${job.key}' depends on non-existent key: ${depKey}`,
        );
      }
    }
  }
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const detectCycle = (key: string): boolean => {
    visited.add(key);
    recStack.add(key);
    const job = jobs.find((j) => j.key === key);
    if (job) {
      for (const depKey of job.dependsOn) {
        if (!visited.has(depKey)) {
          if (detectCycle(depKey)) {
            return true;
          }
        } else if (recStack.has(depKey)) {
          return true;
        }
      }
    }
    recStack.delete(key);
    return false;
  };
  for (const job of jobs) {
    if (!visited.has(job.key)) {
      if (detectCycle(job.key)) {
        throw new Error(`Dependency cycle detected involving key: ${job.key}`);
      }
    }
  }
}

/**
 * Validates a batch mutation request for common errors
 */
export function validateBatchRequest(jobs: JobPlanForValidation[]): void {
  validateBatchStructure(jobs);
  for (const job of jobs) {
    if (job.actions.length === 0) {
      throw new Error(`Job '${job.key}' has empty actions array`);
    }
  }
}

/**
 * Validates a batch load request for common errors
 */
export function validateBatchLoadRequest(
  jobs: LoadJobPlanForValidation[],
): void {
  validateBatchStructure(jobs);
  for (const job of jobs) {
    if (job.operations.length === 0) {
      throw new Error(`Job '${job.key}' has empty operations array`);
    }
  }
}

/**
 * Validates that all actions in a job match the declared scope
 */
export function validateActionScopes(job: JobPlanWithScope): void {
  for (const action of job.actions) {
    const actionScope = action.scope || "global";
    if (actionScope !== job.scope) {
      throw new Error(
        `Job '${job.key}' declares scope '${job.scope}' but action has scope '${actionScope}'`,
      );
    }
  }
}

/**
 * Validates that all operations in a job match the declared scope
 */
export function validateOperationScopes(job: LoadJobPlanWithScope): void {
  for (const operation of job.operations) {
    const operationScope = operation.action.scope || "global";
    if (operationScope !== job.scope) {
      throw new Error(
        `Job '${job.key}' declares scope '${job.scope}' but operation has scope '${operationScope}'`,
      );
    }
  }
}

/**
 * Performs topological sort on jobs based on dependencies
 */
export function topologicalSort(jobs: JobPlanForSorting[]): string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  const visit = (key: string): void => {
    if (visited.has(key)) {
      return;
    }
    visited.add(key);
    const job = jobs.find((j) => j.key === key);
    if (job) {
      for (const depKey of job.dependsOn) {
        visit(depKey);
      }
    }
    result.push(key);
  };
  for (const job of jobs) {
    visit(job.key);
  }
  return result;
}

/**
 * Converts an Error or string to ErrorInfo
 */
export function toErrorInfo(error: Error | string): ErrorInfo {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack || new Error().stack || "",
    };
  }
  return {
    message: error,
    stack: new Error().stack || "",
  };
}

/**
 * Filters paged results by document type
 */
export function filterByType(
  results: PagedResults<PHDocument>,
  type: string,
): PagedResults<PHDocument> {
  // Filter documents by their document type from the header
  const filteredDocuments = results.results.filter(
    (document) => document.header.documentType === type,
  );

  // Create new paged results with filtered documents
  // Note: This maintains the same paging structure but with filtered results
  return {
    results: filteredDocuments,
    options: results.options,
    nextCursor: results.nextCursor,
    next: results.next
      ? async () => {
          // If there's a next function, apply the same filter to the next page
          const nextResults = await results.next!();
          return filterByType(nextResults, type);
        }
      : undefined,
  };
}

/**
 * Validates that all operations share the same scope.
 * Throws an error if any operation has a different scope.
 */
export function getSharedOperationScope(operations: Operation[]): string {
  if (operations.length === 0) {
    throw new Error("No operations provided");
  }

  const baseScope = operations[0].action.scope;
  for (const [index, operation] of operations.entries()) {
    const scope = operation.action.scope;
    if (scope !== baseScope) {
      throw new Error(
        `All operations in load must share the same scope. Expected '${baseScope}', received '${scope}' at position ${index}`,
      );
    }
  }

  return baseScope;
}

/**
 * Validates that all actions share the same scope.
 * Throws an error if any action has a different scope.
 */
export function getSharedActionScope(actions: Action[]): string {
  if (actions.length === 0) {
    throw new Error("No actions provided");
  }

  const baseScope = actions[0].scope;
  for (const action of actions) {
    if (action.scope !== baseScope) {
      throw new Error(
        `All actions must share the same scope. Expected '${baseScope}', received '${action.scope}'`,
      );
    }
  }

  return baseScope;
}

/**
 * Signs an action with the provided signer.
 * If the action already has valid signatures, it is returned unchanged.
 */
export const signAction = async (
  action: Action,
  signer: ISigner,
  signal?: AbortSignal,
): Promise<Action> => {
  const existingSignatures = action.context?.signer?.signatures;
  if (existingSignatures && existingSignatures.length > 0) {
    return action;
  }

  const signature: Signature = await signer.signAction(action, signal);

  return {
    ...action,
    context: {
      ...action.context,
      signer: {
        user: {
          address: signer.user?.address || "",
          networkId: signer.user?.networkId || "",
          chainId: signer.user?.chainId || 0,
        },
        app: {
          name: signer.app?.name || "",
          key: signer.app?.key || "",
        },
        signatures: [signature],
      },
    },
  };
};

/**
 * Signs multiple actions with the provided signer
 */
export const signActions = async (
  actions: Action[],
  signer: ISigner,
  signal?: AbortSignal,
): Promise<Action[]> => {
  return Promise.all(
    actions.map((action) => signAction(action, signer, signal)),
  );
};

export function buildSingleJobMeta(
  jobId: string,
  callerMeta?: Record<string, unknown>,
): JobMeta {
  return { ...callerMeta, batchId: uuidv4(), batchJobIds: [jobId] };
}
