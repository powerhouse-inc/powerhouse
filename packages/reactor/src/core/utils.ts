import type { Action, Operation, PHDocument } from "document-model";
import type { ErrorInfo, PagedResults } from "../shared/types.js";

/**
 * Represents a minimal job plan for validation purposes
 */
export type JobPlanForValidation = {
  key: string;
  actions: Action[];
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
 * Represents a job plan with dependencies for topological sorting
 */
export type JobPlanForSorting = {
  key: string;
  dependsOn: string[];
};

/**
 * Validates a batch mutation request for common errors
 */
export function validateBatchRequest(jobs: JobPlanForValidation[]): void {
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
  for (const job of jobs) {
    if (job.actions.length === 0) {
      throw new Error(`Job '${job.key}' has empty actions array`);
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
 * Filters paged results by parent ID
 */
export function filterByParentId(
  results: PagedResults<PHDocument>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  parentId: string,
): PagedResults<PHDocument> {
  // TODO: Implement filterByParentId
  return results;
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
export function getSharedScope(operations: Operation[]): string {
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
