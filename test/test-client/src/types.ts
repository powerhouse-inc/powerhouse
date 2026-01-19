// Re-export the Action type from document-model
export type { Action } from "document-model";

// Config types for the load test CLI
export interface LoadTestConfig {
  url: string;
  duration: number;
  documentInterval: number;
  mutationInterval: number;
  verbose: boolean;
}

// Internal tracking for test documents
export interface TestDocument {
  id: string;
  type: string;
  parentId?: string;
  createdAt: number;
  operationCount: number;
  moduleIds: string[];
  folderIds: string[];
  fileIds: string[];
}

// Metrics result types
export interface OperationResult {
  operationType: string;
  documentId: string;
  startTime: number;
  endTime: number;
  success: boolean;
  error?: string;
  latencyMs: number;
  operationCount: number;
}

export interface DocumentResult {
  documentId: string;
  documentType: string;
  startTime: number;
  endTime: number;
  success: boolean;
  error?: string;
  latencyMs: number;
}

export interface Statistics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  documentsCreated: number;
  latency: {
    min: number;
    max: number;
    avg: number;
    p95: number;
    p99: number;
  };
  throughput: {
    opsPerSecond: number;
    docsPerMinute: number;
  };
  errors: Map<string, number>;
}

// GraphQL response types (simplified for our needs)
export interface PhDocument {
  id: string;
  name: string;
  documentType: string;
  state: Record<string, unknown>;
}

export interface DriveInfo {
  id: string;
  name: string;
  documentType: string;
}

// Constants
export const MIN_OPS_PER_CALL = 1;
export const MAX_OPS_PER_CALL = 3;

export const DOCUMENT_MODEL_TYPE = "powerhouse/document-model";
