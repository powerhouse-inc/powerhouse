import { Document } from "document-model/document";
import {
  DocumentModelState,
  DocumentModelAction,
  DocumentModelLocalState,
} from "document-model/document-model";
import { z } from "zod";
import {
  ConstantCaseSchema,
  LowercaseSnakeCaseSchema,
  ScopeSchema,
} from "./inputs";
import { EmptyStringSchema } from "./util";

export const AuthorSchema = z
  .object({
    name: EmptyStringSchema,
    website: z
      .union([z.string().url(), z.literal("")])
      .nullish()
      .default(""),
  })
  .default({
    name: "",
    website: "",
  });

const OperationSchema = z.object({
  id: z.string(),
  name: ConstantCaseSchema,
  scope: ScopeSchema,
  schema: z.string(),
  description: EmptyStringSchema,
  template: EmptyStringSchema,
  reducer: EmptyStringSchema,
  errors: z.array(z.string()).default([]),
  examples: z.array(z.string()).default([]),
});

export type TOperation = z.infer<typeof OperationSchema>;

const ModuleSchema = z.object({
  id: z.string(),
  name: LowercaseSnakeCaseSchema,
  description: EmptyStringSchema,
  operations: z.array(OperationSchema),
});

export type TModule = z.infer<typeof ModuleSchema>;

const SpecificationSchema = z.object({
  version: z.number().default(1),
  changeLog: z.array(z.string()).default([]),
  modules: z.array(ModuleSchema).default([]),
});

const GlobalStateSchema = z.object({
  schema: EmptyStringSchema,
  author: AuthorSchema,
  description: EmptyStringSchema,
  initialValue: EmptyStringSchema,
  extension: EmptyStringSchema,
  examples: z.array(z.string()).default([]),
  specifications: z.array(SpecificationSchema).default([]),
});

const LocalStateSchema = GlobalStateSchema.partial().default({});

const DocumentModelSchema = z.object({
  documentType: z.string().min(1).default("powerhouse/document-model"),
  name: z.string().min(1),
  state: z.object({
    global: GlobalStateSchema,
    local: LocalStateSchema,
  }),
});

export type TDocumentModel = Document<
  DocumentModelState,
  DocumentModelAction,
  DocumentModelLocalState
>;
