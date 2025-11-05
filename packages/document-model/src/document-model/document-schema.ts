import { z } from "zod";

export const BaseDocumentHeaderSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAtUtcIso: z.string(),
  lastModifiedAtUtcIso: z.string(),
  documentType: z.string(),
});

export const BaseDocumentStateSchema = z.object({
  global: z.unknown(),
});
