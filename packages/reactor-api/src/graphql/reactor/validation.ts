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

export const RevisionEntryDTO = z
  .object({
    scope: z.string(),
    revision: z.number().int(),
  })
  .strip();

export const PHDocumentDTO = z
  .object({
    id: z.string(),
    slug: z.string().nullable().optional(),
    name: z.string(),
    documentType: z.string(),
    state: JSONObjectDTO,
    revisionsList: z.array(RevisionEntryDTO),
    createdAtUtcIso: DateTimeDTO,
    lastModifiedAtUtcIso: DateTimeDTO,
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

// Operation DTOs for GetDocumentOperations
export const ActionSignerUserDTO = z
  .object({
    address: z.string(),
    networkId: z.string(),
    chainId: z.number().int(),
  })
  .strip();

export const ActionSignerAppDTO = z
  .object({
    name: z.string(),
    key: z.string(),
  })
  .strip();

export const ActionSignerDTO = z
  .object({
    signatures: z.array(z.string()),
    user: ActionSignerUserDTO.nullable().optional(),
    app: ActionSignerAppDTO.nullable().optional(),
  })
  .strip();

export const ActionContextDTO = z
  .object({
    signer: ActionSignerDTO.nullable().optional(),
  })
  .strip();

export const AttachmentDTO = z
  .object({
    data: z.string(),
    mimeType: z.string(),
    hash: z.string(),
    extension: z.string().nullable().optional(),
    fileName: z.string().nullable().optional(),
  })
  .strip();

export const OperationActionDTO = z
  .object({
    id: z.string(),
    type: z.string(),
    timestampUtcMs: z.string(),
    input: z.unknown(),
    scope: z.string(),
    attachments: z.array(AttachmentDTO).nullable().optional(),
    context: ActionContextDTO.nullable().optional(),
  })
  .strip();

export const OperationDTO = z
  .object({
    index: z.number().int(),
    timestampUtcMs: z.string(),
    hash: z.string(),
    skip: z.number().int(),
    error: z.string().nullable().optional(),
    id: z.string().nullable().optional(),
    action: OperationActionDTO,
  })
  .strip();

export const OperationResultPageDTO = z
  .object({
    items: z.array(OperationDTO),
    totalCount: z.number().int(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
    cursor: z.string().nullable().optional(),
  })
  .strip();

export const DocumentWithChildrenAndOperationsDTO = z
  .object({
    document: PHDocumentDTO.extend({
      operations: OperationResultPageDTO.optional(),
    }),
    childIds: z.array(z.string()),
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
    type: z.string(),
    documents: z.array(PHDocumentDTO),
    context: DocumentChangeContextDTO.nullable().optional(),
  })
  .strip();

export const JobChangeEventDTO = z
  .object({
    jobId: z.string(),
    status: z.string(),
    result: JSONObjectDTO.nullable().optional(),
    error: z.string().nullable().optional(),
  })
  .strip();
