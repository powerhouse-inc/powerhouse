import type {
  ErasureItemStatus,
  ErasureRequestStatus,
} from "../schema/tables.js";

/** One document an erasure of the requested ids would remove. */
export type ErasurePlanItem = {
  documentId: string;
  /** The requested drive this document was expanded from; null if requested. */
  expandedFrom: string | null;
  /** A live document is refused with DocumentNotDeletedError. */
  live: boolean;
  /** Rows in operation_index_operations, against maxPurgeOperations. */
  operationCount: number;
  /** Surviving documents whose accepted auth history names this group. */
  groupReferencers: string[];
};

export type ErasurePlan = {
  maxPurgeOperations: number;
  items: ErasurePlanItem[];
};

export type ErasureItem = {
  documentId: string;
  status: ErasureItemStatus;
  allowLarge: boolean;
  markerOrdinal: number | null;
  lastError: string | null;
  updatedAt: Date;
};

export type ErasureRequest = {
  requestId: string;
  subjectHash: string | null;
  /** The stored form: hashed when it is an address. */
  requestedBy: string;
  requestedAt: Date;
  deadline: Date;
  status: ErasureRequestStatus;
  items: ErasureItem[];
};

export interface IErasureService {
  /** What erasing these ids would remove, and what blocks each. Read-only. */
  plan(ids: string[]): Promise<ErasurePlan>;
  /** Records the request; returns immediately. */
  request(
    ids: string[],
    opts: { requestedBy: string; deadline?: Date; allowLarge?: string[] },
  ): Promise<ErasureRequest>;
  status(requestId: string): Promise<ErasureRequest>;
}
