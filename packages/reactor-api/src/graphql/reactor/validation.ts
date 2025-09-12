import { z } from "zod";

// Scalar DTOs
export const JSONObjectDTO = z.unknown();
export const DateTimeDTO = z.union([z.string(), z.date()]);

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
