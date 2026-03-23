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
  DocumentFile,
  DocumentModelGlobalState,
  DocumentSpecification,
  LoadStateActionInput,
  LoadStateActionStateInput,
  ModuleSpecification,
  MoveOperationInput,
  OperationErrorSpecification,
  OperationSpecification,
  PruneActionInput,
  ReorderChangeLogItemsInput,
  ReorderModuleOperationsInput,
  ReorderModulesInput,
  ReorderOperationErrorsInput,
  ReorderOperationExamplesInput,
  ReorderStateExamplesInput,
  SchemaLoadStateAction,
  SchemaPruneAction,
  SchemaRedoAction,
  SchemaSetNameAction,
  SchemaUndoAction,
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

type definedNonNullAny = {};

export const isDefinedNonNullAny = (v: any): v is definedNonNullAny =>
  v !== undefined && v !== null;

export const definedNonNullAnySchema = z
  .any()
  .refine((v) => isDefinedNonNullAny(v));

export const Load_StateSchema = z.enum(["LOAD_STATE"]);

export const PruneSchema = z.enum(["PRUNE"]);

export const RedoSchema = z.enum(["REDO"]);

export const Set_NameSchema = z.enum(["SET_NAME"]);

export const UndoSchema = z.enum(["UNDO"]);

export function OperationScopeSchema(): z.ZodString {
  return z.string();
}

export function DocumentActionSchema() {
  return z.union([
    LoadStateActionSchema(),
    PruneActionSchema(),
    RedoActionSchema(),
    SetNameActionSchema(),
    UndoActionSchema(),
  ]);
}

export function DocumentFileSchema(): z.ZodObject<Properties<DocumentFile>> {
  return z.object({
    __typename: z.literal("DocumentFile").optional(),
    data: z.string(),
    extension: z.string().nullable(),
    fileName: z.string().nullable(),
    mimeType: z.string(),
  });
}

export function LoadStateActionSchema(): z.ZodObject<
  Properties<SchemaLoadStateAction>
> {
  return z.object({
    id: z.string(),
    timestampUtcMs: z.string(),
    input: z.lazy(() => LoadStateActionInputSchema()),
    type: Load_StateSchema,
    scope: OperationScopeSchema(),
  });
}

export function LoadStateActionInputSchema(): z.ZodObject<
  Properties<LoadStateActionInput>
> {
  return z.object({
    operations: z.number(),
    state: z.lazy(() => LoadStateActionStateInputSchema()),
  });
}

export function LoadStateActionStateInputSchema(): z.ZodObject<
  Properties<LoadStateActionStateInput>
> {
  return z.object({
    data: z.unknown().nullish(),
    name: z.string(),
  });
}

export function PruneActionSchema(): z.ZodObject<
  Properties<SchemaPruneAction>
> {
  return z.object({
    id: z.string(),
    timestampUtcMs: z.string(),
    input: z.lazy(() => PruneActionInputSchema()),
    type: PruneSchema,
    scope: OperationScopeSchema(),
  });
}

export function PruneActionInputSchema(): z.ZodObject<
  Properties<PruneActionInput>
> {
  return z.object({
    end: z.number().nullish(),
    start: z.number().nullish(),
  });
}

export function RedoActionInputSchema() {
  return z.object({ count: z.number() });
}

export function RedoActionSchema(): z.ZodObject<Properties<SchemaRedoAction>> {
  return z.object({
    id: z.string(),
    timestampUtcMs: z.string().datetime(),
    input: RedoActionInputSchema(),
    type: RedoSchema,
    scope: OperationScopeSchema(),
  });
}

export function SetNameActionInputSchema() {
  return z.object({ name: z.string() });
}

export function SetNameActionSchema(): z.ZodObject<
  Properties<SchemaSetNameAction>
> {
  return z.object({
    id: z.string(),
    timestampUtcMs: z.string().datetime(),
    input: SetNameActionInputSchema(),
    type: Set_NameSchema,
    scope: z.literal("global"),
  });
}

// export function SetNameOperationSchema(): z.ZodObject<
//   Properties<SetNameOperation>
// > {
//   return z.object({
//     __typename: z.literal("SetNameOperation").optional(),
//     hash: z.string(),
//     index: z.number(),
//     input: z.string(),
//     timestampUtcMs: z.string().datetime(),
//     type: z.string(),
//   });
// }

export function UndoActionInputSchema() {
  return z.object({ count: z.number() });
}

export function UndoActionSchema(): z.ZodObject<Properties<SchemaUndoAction>> {
  return z.object({
    id: z.string(),
    timestampUtcMs: z.string().datetime(),
    input: UndoActionInputSchema(),
    type: UndoSchema,
    scope: OperationScopeSchema(),
  });
}

type Properties<T> = Required<{
  [K in keyof T]: z.ZodType<T[K], T[K]>;
}>;

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

export function DocumentModelGlobalStateSchema(): z.ZodObject<
  Properties<DocumentModelGlobalState>
> {
  return z.object({
    __typename: z.literal("DocumentModelGlobalState").optional(),
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
    version: z.number().int(),
  });
}

export function ModuleSchema(): z.ZodObject<Properties<ModuleSpecification>> {
  return z.object({
    __typename: z.literal("ModuleSpecification").optional(),
    description: z.string().nullable(),
    id: z.string(),
    name: z.string(),
    operations: z.array(OperationSpecificationSchema()),
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

export function OperationSpecificationSchema(): z.ZodObject<
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
