import { z } from "zod";

import type {
  AddChangeLogItemInput,
  AddModuleInput,
  AddOperationErrorInput,
  AddOperationExampleInput,
  AddOperationInput,
  AddStateExampleInput,
  Author,
  CodeExample,
  DeleteChangeLogItemInput,
  DeleteModuleInput,
  DeleteOperationErrorInput,
  DeleteOperationExampleInput,
  DeleteOperationInput,
  DeleteStateExampleInput,
  DocumentModelState,
  DocumentSpecification,
  ModuleSpecification,
  MoveOperationInput,
  OperationErrorSpecification,
  OperationSpecification,
  ReorderChangeLogItemsInput,
  ReorderModuleOperationsInput,
  ReorderModulesInput,
  ReorderOperationErrorsInput,
  ReorderOperationExamplesInput,
  ReorderStateExamplesInput,
  ScopeState,
  SetAuthorNameInput,
  SetAuthorWebsiteInput,
  SetInitialStateInput,
  SetModelDescriptionInput,
  SetModelExtensionInput,
  SetModelIdInput,
  SetModelNameInput,
  SetModuleDescriptionInput,
  SetModuleNameInput,
  SetOperationDescriptionInput,
  SetOperationErrorCodeInput,
  SetOperationErrorDescriptionInput,
  SetOperationErrorNameInput,
  SetOperationErrorTemplateInput,
  SetOperationNameInput,
  SetOperationReducerInput,
  SetOperationSchemaInput,
  SetOperationScopeInput,
  SetOperationTemplateInput,
  SetStateSchemaInput,
  State,
  UpdateChangeLogItemInput,
  UpdateOperationExampleInput,
  UpdateStateExampleInput,
} from "./types.js";

type Properties<T> = Required<{
  [K in keyof T]: z.ZodType<T[K], any, T[K]>;
}>;

type definedNonNullAny = {};

export const isDefinedNonNullAny = (v: any): v is definedNonNullAny =>
  v !== undefined && v !== null;

export const definedNonNullAnySchema = z
  .any()
  .refine((v) => isDefinedNonNullAny(v));

export function AddChangeLogItemInputSchema(): z.ZodObject<
  Properties<AddChangeLogItemInput>
> {
  return z.object({
    __typename: z.literal("AddChangeLogItemInput").optional(),
    content: z.string(),
    id: z.string(),
    insertBefore: z.string().nullable(),
  });
}

export function AddModuleInputSchema(): z.ZodObject<
  Properties<AddModuleInput>
> {
  return z.object({
    description: z.string().nullish(),
    id: z.string(),
    name: z.string(),
  });
}

export function AddOperationErrorInputSchema(): z.ZodObject<
  Properties<AddOperationErrorInput>
> {
  return z.object({
    errorCode: z.string().nullish(),
    errorDescription: z.string().nullish(),
    errorName: z.string().nullish(),
    errorTemplate: z.string().nullish(),
    id: z.string(),
    operationId: z.string(),
  });
}

export function AddOperationExampleInputSchema(): z.ZodObject<
  Properties<AddOperationExampleInput>
> {
  return z.object({
    example: z.string(),
    id: z.string(),
    operationId: z.string(),
  });
}

export function AddOperationInputSchema(): z.ZodObject<
  Properties<AddOperationInput>
> {
  return z.object({
    description: z.string().nullish(),
    id: z.string(),
    moduleId: z.string(),
    name: z.string(),
    reducer: z.string().nullish(),
    schema: z.string().nullish(),
    template: z.string().nullish(),
    scope: OperationScopeSchema().nullish(),
  });
}

export function AddStateExampleInputSchema(): z.ZodObject<
  Properties<AddStateExampleInput>
> {
  return z.object({
    scope: z.string(),
    example: z.string(),
    id: z.string(),
    insertBefore: z.string().nullish(),
  });
}

export function AuthorSchema(): z.ZodObject<Properties<Author>> {
  return z.object({
    __typename: z.literal("Author").optional(),
    name: z.string(),
    website: z.string().nullable(),
  });
}

export function CodeExampleSchema(): z.ZodObject<Properties<CodeExample>> {
  return z.object({
    __typename: z.literal("CodeExample").optional(),
    id: z.string(),
    value: z.string(),
  });
}

export function DeleteChangeLogItemInputSchema(): z.ZodObject<
  Properties<DeleteChangeLogItemInput>
> {
  return z.object({
    __typename: z.literal("DeleteChangeLogItemInput").optional(),
    id: z.string(),
  });
}

export function DeleteModuleInputSchema(): z.ZodObject<
  Properties<DeleteModuleInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function DeleteOperationErrorInputSchema(): z.ZodObject<
  Properties<DeleteOperationErrorInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function DeleteOperationExampleInputSchema(): z.ZodObject<
  Properties<DeleteOperationExampleInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function DeleteOperationInputSchema(): z.ZodObject<
  Properties<DeleteOperationInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function DeleteStateExampleInputSchema(): z.ZodObject<
  Properties<DeleteStateExampleInput>
> {
  return z.object({
    scope: z.string(),
    id: z.string(),
  });
}

export function OperationScopeSchema(): z.ZodString {
  return z.string();
}

export function DocumentModelInputSchema() {
  return z.union([
    AddChangeLogItemInputSchema(),
    AddModuleInputSchema(),
    AddOperationErrorInputSchema(),
    AddOperationExampleInputSchema(),
    AddOperationInputSchema(),
    AddStateExampleInputSchema(),
    DeleteChangeLogItemInputSchema(),
    DeleteModuleInputSchema(),
    DeleteOperationErrorInputSchema(),
    DeleteOperationExampleInputSchema(),
    DeleteOperationInputSchema(),
    DeleteStateExampleInputSchema(),
    MoveOperationInputSchema(),
    ReorderChangeLogItemsInputSchema(),
    ReorderModuleOperationsInputSchema(),
    ReorderModulesInputSchema(),
    ReorderOperationErrorsInputSchema(),
    ReorderOperationExamplesInputSchema(),
    ReorderStateExamplesInputSchema(),
    SetAuthorNameInputSchema(),
    SetAuthorWebsiteInputSchema(),
    SetInitialStateInputSchema(),
    SetModelDescriptionInputSchema(),
    SetModelExtensionInputSchema(),
    SetModelIdInputSchema(),
    SetModelNameInputSchema(),
    SetModuleDescriptionInputSchema(),
    SetModuleNameInputSchema(),
    SetOperationDescriptionInputSchema(),
    SetOperationErrorCodeInputSchema(),
    SetOperationErrorDescriptionInputSchema(),
    SetOperationErrorNameInputSchema(),
    SetOperationErrorTemplateInputSchema(),
    SetOperationNameInputSchema(),
    SetOperationReducerInputSchema(),
    SetOperationSchemaInputSchema(),
    SetOperationTemplateInputSchema(),
    SetStateSchemaInputSchema(),
    UpdateChangeLogItemInputSchema(),
    UpdateOperationExampleInputSchema(),
    UpdateStateExampleInputSchema(),
  ]);
}

export function DocumentModelStateSchema(): z.ZodObject<
  Properties<DocumentModelState>
> {
  return z.object({
    __typename: z.literal("DocumentModelState").optional(),
    author: AuthorSchema(),
    description: z.string(),
    extension: z.string(),
    id: z.string(),
    name: z.string(),
    specifications: z.array(DocumentSpecificationSchema()),
  });
}

export function DocumentSpecificationSchema(): z.ZodObject<
  Properties<DocumentSpecification>
> {
  return z.object({
    __typename: z.literal("DocumentSpecification").optional(),
    changeLog: z.array(z.string()),
    modules: z.array(ModuleSchema()),
    state: ScopeStateSchema(),
    version: z.number(),
  });
}

export function ModuleSchema(): z.ZodObject<Properties<ModuleSpecification>> {
  return z.object({
    __typename: z.literal("ModuleSpecification").optional(),
    description: z.string().nullable(),
    id: z.string(),
    name: z.string(),
    operations: z.array(OperationSchema()),
  });
}

export function MoveOperationInputSchema(): z.ZodObject<
  Properties<MoveOperationInput>
> {
  return z.object({
    newModuleId: z.string(),
    operationId: z.string(),
  });
}

export function OperationSchema(): z.ZodObject<
  Properties<OperationSpecification>
> {
  return z.object({
    __typename: z.literal("OperationSpecification").optional(),
    description: z.string().nullable(),
    errors: z.array(OperationErrorSchema()),
    examples: z.array(CodeExampleSchema()),
    id: z.string(),
    name: z.string().nullable(),
    reducer: z.string().nullable(),
    schema: z.string().nullable(),
    template: z.string().nullable(),
    scope: OperationScopeSchema(),
  });
}

export function OperationErrorSchema(): z.ZodObject<
  Properties<OperationErrorSpecification>
> {
  return z.object({
    __typename: z.literal("OperationErrorSpecification").optional(),
    code: z.string().nullable(),
    description: z.string().nullable(),
    id: z.string(),
    name: z.string().nullable(),
    template: z.string().nullable(),
  });
}

export function ReorderChangeLogItemsInputSchema(): z.ZodObject<
  Properties<ReorderChangeLogItemsInput>
> {
  return z.object({
    __typename: z.literal("ReorderChangeLogItemsInput").optional(),
    order: z.array(z.string()),
  });
}

export function ReorderModuleOperationsInputSchema(): z.ZodObject<
  Properties<ReorderModuleOperationsInput>
> {
  return z.object({
    moduleId: z.string(),
    order: z.array(z.string()),
  });
}

export function ReorderModulesInputSchema(): z.ZodObject<
  Properties<ReorderModulesInput>
> {
  return z.object({
    order: z.array(z.string()),
  });
}

export function ReorderOperationErrorsInputSchema(): z.ZodObject<
  Properties<ReorderOperationErrorsInput>
> {
  return z.object({
    operationId: z.string(),
    order: z.array(z.string()),
  });
}

export function ReorderOperationExamplesInputSchema(): z.ZodObject<
  Properties<ReorderOperationExamplesInput>
> {
  return z.object({
    operationId: z.string(),
    order: z.array(z.string()),
  });
}

export function ReorderStateExamplesInputSchema(): z.ZodObject<
  Properties<ReorderStateExamplesInput>
> {
  return z.object({
    scope: z.string(),
    order: z.array(z.string()),
  });
}

export function SetAuthorNameInputSchema(): z.ZodObject<
  Properties<SetAuthorNameInput>
> {
  return z.object({
    authorName: z.string(),
  });
}

export function SetAuthorWebsiteInputSchema(): z.ZodObject<
  Properties<SetAuthorWebsiteInput>
> {
  return z.object({
    authorWebsite: z.string(),
  });
}

export function SetInitialStateInputSchema(): z.ZodObject<
  Properties<SetInitialStateInput>
> {
  return z.object({
    scope: z.string(),
    initialValue: z.string(),
  });
}

export function SetModelDescriptionInputSchema(): z.ZodObject<
  Properties<SetModelDescriptionInput>
> {
  return z.object({
    description: z.string(),
  });
}

export function SetModelExtensionInputSchema(): z.ZodObject<
  Properties<SetModelExtensionInput>
> {
  return z.object({
    extension: z.string(),
  });
}

export function SetModelIdInputSchema(): z.ZodObject<
  Properties<SetModelIdInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function SetModelNameInputSchema(): z.ZodObject<
  Properties<SetModelNameInput>
> {
  return z.object({
    name: z.string(),
  });
}

export function SetModuleDescriptionInputSchema(): z.ZodObject<
  Properties<SetModuleDescriptionInput>
> {
  return z.object({
    description: z.string().nullish(),
    id: z.string(),
  });
}

export function SetModuleNameInputSchema(): z.ZodObject<
  Properties<SetModuleNameInput>
> {
  return z.object({
    id: z.string(),
    name: z.string().nullish(),
  });
}

export function SetOperationDescriptionInputSchema(): z.ZodObject<
  Properties<SetOperationDescriptionInput>
> {
  return z.object({
    description: z.string().nullish(),
    id: z.string(),
  });
}

export function SetOperationErrorCodeInputSchema(): z.ZodObject<
  Properties<SetOperationErrorCodeInput>
> {
  return z.object({
    errorCode: z.string().nullish(),
    id: z.string(),
  });
}

export function SetOperationErrorDescriptionInputSchema(): z.ZodObject<
  Properties<SetOperationErrorDescriptionInput>
> {
  return z.object({
    errorDescription: z.string().nullish(),
    id: z.string(),
  });
}

export function SetOperationErrorNameInputSchema(): z.ZodObject<
  Properties<SetOperationErrorNameInput>
> {
  return z.object({
    errorName: z.string().nullish(),
    id: z.string(),
  });
}

export function SetOperationErrorTemplateInputSchema(): z.ZodObject<
  Properties<SetOperationErrorTemplateInput>
> {
  return z.object({
    errorTemplate: z.string().nullish(),
    id: z.string(),
  });
}

export function SetOperationNameInputSchema(): z.ZodObject<
  Properties<SetOperationNameInput>
> {
  return z.object({
    id: z.string(),
    name: z.string().nullish(),
  });
}

export function SetOperationScopeInputSchema(): z.ZodObject<
  Properties<SetOperationScopeInput>
> {
  return z.object({
    id: z.string(),
    scope: OperationScopeSchema(),
  });
}

export function SetOperationReducerInputSchema(): z.ZodObject<
  Properties<SetOperationReducerInput>
> {
  return z.object({
    id: z.string(),
    reducer: z.string().nullish(),
  });
}

export function SetOperationSchemaInputSchema(): z.ZodObject<
  Properties<SetOperationSchemaInput>
> {
  return z.object({
    id: z.string(),
    schema: z.string().nullish(),
  });
}

export function SetOperationTemplateInputSchema(): z.ZodObject<
  Properties<SetOperationTemplateInput>
> {
  return z.object({
    id: z.string(),
    template: z.string().nullish(),
  });
}

export function SetStateSchemaInputSchema(): z.ZodObject<
  Properties<SetStateSchemaInput>
> {
  return z.object({
    scope: z.string(),
    schema: z.string(),
  });
}

export function StateSchema(): z.ZodObject<Properties<State>> {
  return z.object({
    __typename: z.literal("State").optional(),
    examples: z.array(CodeExampleSchema()),
    initialValue: z.string(),
    schema: z.string(),
  });
}

export function ScopeStateSchema(): z.ZodObject<Properties<ScopeState>> {
  return z.object({
    global: StateSchema(),
    local: StateSchema(),
  });
}

export function UpdateChangeLogItemInputSchema(): z.ZodObject<
  Properties<UpdateChangeLogItemInput>
> {
  return z.object({
    __typename: z.literal("UpdateChangeLogItemInput").optional(),
    id: z.string(),
    newContent: z.string(),
  });
}

export function UpdateOperationExampleInputSchema(): z.ZodObject<
  Properties<UpdateOperationExampleInput>
> {
  return z.object({
    example: z.string(),
    id: z.string(),
  });
}

export function UpdateStateExampleInputSchema(): z.ZodObject<
  Properties<UpdateStateExampleInput>
> {
  return z.object({
    scope: z.string(),
    id: z.string(),
    newExample: z.string(),
  });
}
