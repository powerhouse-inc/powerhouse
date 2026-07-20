import { z } from "zod";
import type { PHConnectPwa } from "../clis/types.js";
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
  SchemaSetPreferredEditorAction,
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

export const Set_PreferredEditorSchema = z.enum(["SET_PREFERRED_EDITOR"]);

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
    SetPreferredEditorActionSchema(),
    UndoActionSchema(),
  ]);
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

export function SetPreferredEditorActionInputSchema() {
  return z.object({ preferredEditor: z.string().nullable() });
}

export function SetPreferredEditorActionSchema(): z.ZodObject<
  Properties<SchemaSetPreferredEditorAction>
> {
  return z.object({
    id: z.string(),
    timestampUtcMs: z.string().datetime(),
    input: SetPreferredEditorActionInputSchema(),
    type: Set_PreferredEditorSchema,
    scope: z.literal("header"),
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
    id: z.string(),
    name: z.string(),
    author: AuthorSchema(),
    extension: z.string(),
    description: z.string(),
    specifications: z.array(DocumentSpecificationSchema()),
  });
}

export function DocumentSpecificationSchema(): z.ZodObject<
  Properties<DocumentSpecification>
> {
  return z.object({
    __typename: z.literal("DocumentSpecification").optional(),
    state: ScopeStateSchema(),
    modules: z.array(ModuleSchema()),
    version: z.number().int(),
    changeLog: z.array(z.string()),
  });
}

export function ModuleSchema(): z.ZodObject<Properties<ModuleSpecification>> {
  return z.object({
    __typename: z.literal("ModuleSpecification").optional(),
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
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
    id: z.string(),
    name: z.string().nullable(),
    description: z.string().nullable(),
    schema: z.string().nullable(),
    template: z.string().nullable(),
    reducer: z.string().nullable(),
    errors: z.array(OperationErrorSchema()),
    examples: z.array(CodeExampleSchema()),
    scope: OperationScopeSchema(),
  });
}

export function OperationErrorSchema(): z.ZodObject<
  Properties<OperationErrorSpecification>
> {
  return z.object({
    __typename: z.literal("OperationErrorSpecification").optional(),
    id: z.string(),
    name: z.string().nullable(),
    code: z.string().nullable(),
    description: z.string().nullable(),
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
    schema: z.string(),
    examples: z.array(CodeExampleSchema()),
    initialValue: z.string(),
  });
}

export function ScopeStateSchema(): z.ZodObject<Properties<ScopeState>> {
  return z.object({
    local: StateSchema(),
    global: StateSchema(),
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

export const PowerhouseModuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  documentTypes: z.array(z.string()).optional(),
});

export const PowerhouseModulesSchema = z
  .array(PowerhouseModuleSchema)
  .optional();

export const PublisherSchema = z.object({
  name: z.string().optional(),
  url: z.string().optional(),
});

export const ConfigEntryTypeSchema = z.union([
  z.literal("var"),
  z.literal("secret"),
]);

export const ConfigEntrySchema = z.object({
  name: z.string(),
  type: ConfigEntryTypeSchema,
  description: z.string().optional(),
  required: z.boolean().optional(),
  default: z.boolean().optional(),
});

// PWA / service-worker overrides a package contributes to a Connect build.
// The `z.ZodType<PHConnectPwa>` annotation pins the schema to the TS type in
// packages/shared/clis/types.ts, so drift between them is a compile error;
// the JSON-schema fragment in packages/shared/connect/schema-fragments.ts is
// the remaining hand-kept mirror. Kept on the manifest (not a separate file)
// so it ships in dist/powerhouse.manifest.json and the Connect build can read
// it without executing package code.
//
// Every fixed-shape object below is strict (z.strictObject): an unknown key —
// e.g. a `manifest.nam` typo — fails the build loudly instead of being
// silently dropped, matching the JSON schema's `additionalProperties: false`.
// Only the open MIME/header maps (z.record) accept arbitrary keys by design.
const PwaUrlPatternSchema = z.union([
  z.string(),
  z
    .strictObject({ source: z.string(), flags: z.string().optional() })
    // The pair is rebuilt into a RegExp at build time; catch a non-compiling
    // pattern here, where validation can still name the contributor.
    .refine(
      (p) => {
        try {
          new RegExp(p.source, p.flags);
          return true;
        } catch {
          return false;
        }
      },
      { message: "source/flags do not compile to a valid RegExp" },
    ),
]);

const PwaRuntimeCachingSchema = z.strictObject({
  urlPattern: PwaUrlPatternSchema,
  handler: z.enum([
    "CacheFirst",
    "CacheOnly",
    "NetworkFirst",
    "NetworkOnly",
    "StaleWhileRevalidate",
  ]),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "HEAD", "PATCH"]).optional(),
  options: z
    .strictObject({
      cacheName: z.string().optional(),
      networkTimeoutSeconds: z.number().optional(),
      expiration: z
        .strictObject({
          maxEntries: z.number().optional(),
          maxAgeSeconds: z.number().optional(),
        })
        .optional(),
      cacheableResponse: z
        .strictObject({
          statuses: z.array(z.number()).optional(),
          headers: z.record(z.string(), z.string()).optional(),
        })
        .optional(),
    })
    .optional(),
});

const PwaIconSchema = z.strictObject({
  src: z.string(),
  sizes: z.string().optional(),
  type: z.string().optional(),
  purpose: z.string().optional(),
});

// No `action` field: the route launched files open at is fixed by Connect
// (the runtime handling lives in Connect's own source), so contributors only
// declare WHICH file types they accept. `strictObject` rejects a fragment
// that tries to set its own route. Extensions must carry the leading dot —
// Chromium silently ignores dotless entries, so fail loudly at build instead.
const PwaFileHandlerSchema = z.strictObject({
  accept: z.record(
    z.string(),
    z.array(z.string().regex(/^\./, "file extensions must start with '.'")),
  ),
  icons: z.array(PwaIconSchema).optional(),
  launch_type: z.enum(["single-client", "multiple-clients"]).optional(),
});

// `categories` is intentionally NOT here: it is not authored under
// `connect.pwa` — it is derived from the `category` field of the contributing
// `powerhouse.manifest.json` files (see collectProjectPwaContribution /
// toPwaContribution). `strictObject` therefore rejects an authored `categories`
// (and the removed `shortcuts`/`screenshots`/`share_target`/`display_override`).
const PwaManifestOverrideSchema = z.strictObject({
  name: z.string().optional(),
  short_name: z.string().optional(),
  description: z.string().optional(),
  theme_color: z.string().optional(),
  background_color: z.string().optional(),
  display: z
    .enum(["fullscreen", "standalone", "minimal-ui", "browser"])
    .optional(),
  start_url: z.string().optional(),
  scope: z.string().optional(),
  icons: z.array(PwaIconSchema).optional(),
  file_handlers: z.array(PwaFileHandlerSchema).optional(),
  launch_handler: z
    .strictObject({
      client_mode: z.enum([
        "auto",
        "focus-existing",
        "navigate-existing",
        "navigate-new",
      ]),
    })
    .optional(),
});

export const PwaConfigSchema: z.ZodType<PHConnectPwa> = z.strictObject({
  manifest: PwaManifestOverrideSchema.optional(),
  globPatterns: z.array(z.string()).optional(),
  globIgnores: z.array(z.string()).optional(),
  maximumFileSizeToCacheInBytes: z.number().optional(),
  runtimeCaching: z.array(PwaRuntimeCachingSchema).optional(),
  navigateFallbackDenylist: z.array(PwaUrlPatternSchema).optional(),
});

export const ManifestSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  category: z.string().optional(),
  publisher: PublisherSchema.optional(),
  documentModels: PowerhouseModulesSchema,
  apps: PowerhouseModulesSchema,
  editors: PowerhouseModulesSchema,
  processors: PowerhouseModulesSchema,
  subgraphs: PowerhouseModulesSchema,
  config: z.array(ConfigEntrySchema).optional(),
  pwa: PwaConfigSchema.optional(),
});
