import { z } from "zod";
import type {
  DocumentChangeEvent,
  DocumentModelResultPage,
  DocumentWithChildren,
  JobInfo,
  MoveChildrenResult,
  PhDocument as PHDocument,
  PhDocumentResultPage as PHDocumentResultPage,
} from "./generated/graphql.js";

// Scalar DTOs
export const JSONObjectDTO = z.unknown();
export const DateTimeDTO = z.union([z.string(), z.date()]);

// Input DTOs
export const PagingInputDTO = z
  .object({
    limit: z.number().int().optional(),
    offset: z.number().int().optional(),
    cursor: z.string().optional(),
  })
  .strip();

export const ViewFilterInputDTO = z
  .object({
    branch: z.string().optional(),
    scopes: z.array(z.string()).optional(),
  })
  .strip();

export const SearchFilterInputDTO = z
  .object({
    type: z.string().optional(),
    parentId: z.string().optional(),
    identifiers: z.array(z.string()).optional(),
  })
  .strip();

// Enum DTOs
export const PropagationModeDTO = z.enum(["CASCADE", "ORPHAN"]);

export const DocumentChangeTypeDTO = z.enum([
  "CREATED",
  "DELETED",
  "UPDATED",
  "PARENT_ADDED",
  "PARENT_REMOVED",
  "CHILD_ADDED",
  "CHILD_REMOVED",
]);

// Object type DTOs
export const DocumentModelStateDTO = z
  .object({
    id: z.string(),
    name: z.string(),
    namespace: z.string().nullable().optional(),
    version: z.string().nullable().optional(),
    specification: JSONObjectDTO.nullable().optional(),
  })
  .strip();

export const DocumentModelResultPageDTO = z
  .object({
    items: z.array(DocumentModelStateDTO),
    totalCount: z.number().int(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
    cursor: z.string().nullable().optional(),
  })
  .strip();

export const PHDocumentDTO = z
  .object({
    id: z.string(),
    slug: z.string().nullable().optional(),
    name: z.string(),
    documentType: z.string(),
    state: JSONObjectDTO,
    revision: z.number().int(),
    created: DateTimeDTO,
    lastModified: DateTimeDTO,
    parentId: z.string().nullable().optional(),
  })
  .strip();

export const PHDocumentResultPageDTO = z
  .object({
    items: z.array(PHDocumentDTO),
    totalCount: z.number().int(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
    cursor: z.string().nullable().optional(),
  })
  .strip();

export const DocumentWithChildrenDTO = z
  .object({
    document: PHDocumentDTO,
    childIds: z.array(z.string()),
  })
  .strip();

export const MoveChildrenResultDTO = z
  .object({
    source: PHDocumentDTO,
    target: PHDocumentDTO,
  })
  .strip();

export const JobInfoDTO = z
  .object({
    id: z.string(),
    status: z.string(),
    result: JSONObjectDTO.nullable().optional(),
    error: z.string().nullable().optional(),
    createdAt: DateTimeDTO,
    completedAt: DateTimeDTO.nullable().optional(),
  })
  .strip();

export const DocumentChangeContextDTO = z
  .object({
    parentId: z.string().nullable().optional(),
    childId: z.string().nullable().optional(),
  })
  .strip();

export const DocumentChangeEventDTO = z
  .object({
    type: DocumentChangeTypeDTO,
    documents: z.array(PHDocumentDTO),
    context: DocumentChangeContextDTO.nullable().optional(),
  })
  .strip();

// Type exports
export type TPagingInput = z.infer<typeof PagingInputDTO>;
export type TViewFilterInput = z.infer<typeof ViewFilterInputDTO>;
export type TSearchFilterInput = z.infer<typeof SearchFilterInputDTO>;
export type TPropagationMode = z.infer<typeof PropagationModeDTO>;
export type TDocumentChangeType = z.infer<typeof DocumentChangeTypeDTO>;
export type TDocumentModelState = z.infer<typeof DocumentModelStateDTO>;
export type TDocumentModelResultPage = z.infer<
  typeof DocumentModelResultPageDTO
>;
export type TPHDocument = z.infer<typeof PHDocumentDTO>;
export type TPHDocumentResultPage = z.infer<typeof PHDocumentResultPageDTO>;
export type TDocumentWithChildren = z.infer<typeof DocumentWithChildrenDTO>;
export type TMoveChildrenResult = z.infer<typeof MoveChildrenResultDTO>;
export type TJobInfo = z.infer<typeof JobInfoDTO>;
export type TDocumentChangeContext = z.infer<typeof DocumentChangeContextDTO>;
export type TDocumentChangeEvent = z.infer<typeof DocumentChangeEventDTO>;

// Conversion functions
export function toDocumentModelResultPageDTO(
  data: DocumentModelResultPage,
): TDocumentModelResultPage {
  return DocumentModelResultPageDTO.parse(data);
}

export function toPHDocumentDTO(data: PHDocument): TPHDocument {
  return PHDocumentDTO.parse(data);
}

export function toPHDocumentResultPageDTO(
  data: PHDocumentResultPage,
): TPHDocumentResultPage {
  return PHDocumentResultPageDTO.parse(data);
}

export function toDocumentWithChildrenDTO(
  data: DocumentWithChildren,
): TDocumentWithChildren {
  return DocumentWithChildrenDTO.parse(data);
}

export function toMoveChildrenResultDTO(
  data: MoveChildrenResult,
): TMoveChildrenResult {
  return MoveChildrenResultDTO.parse(data);
}

export function toJobInfoDTO(data: JobInfo): TJobInfo {
  return JobInfoDTO.parse(data);
}

export function toDocumentChangeEventDTO(
  data: DocumentChangeEvent,
): TDocumentChangeEvent {
  return DocumentChangeEventDTO.parse(data);
}
