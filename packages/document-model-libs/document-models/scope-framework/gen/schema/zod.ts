import { z } from "zod";
import {
  AddElementInput,
  ArticleComponent,
  CoreComponent,
  MoveElementInput,
  RemoveElementInput,
  ReorderElementsInput,
  ScopeComponent,
  ScopeFrameworkElement,
  ScopeFrameworkElementType,
  ScopeFrameworkLocalState,
  ScopeFrameworkState,
  SectionComponent,
  SetRootPathInput,
  TypeSpecificationComponent,
  TypeSpecificationComponentCategory,
  UpdateElementComponentsInput,
  UpdateElementNameInput,
  UpdateElementTypeInput,
} from "./types";

type Properties<T> = Required<{
  [K in keyof T]: z.ZodType<T[K], any, T[K]>;
}>;

type definedNonNullAny = {};

export const isDefinedNonNullAny = (v: any): v is definedNonNullAny =>
  v !== undefined && v !== null;

export const definedNonNullAnySchema = z
  .any()
  .refine((v) => isDefinedNonNullAny(v));

export const ScopeFrameworkElementTypeSchema = z.enum([
  "Article",
  "Core",
  "Scope",
  "Section",
  "TypeSpecification",
]);

export const TypeSpecificationComponentCategorySchema = z.enum([
  "Accessory",
  "Immutable",
  "Primary",
  "Supporting",
]);

export function AddElementInputSchema(): z.ZodObject<
  Properties<AddElementInput>
> {
  return z.object({
    __typename: z.literal("AddElementInput").optional(),
    components: ElementComponentsSchema().nullable(),
    id: z.string(),
    name: z.string().nullable(),
    path: z.string(),
    type: ScopeFrameworkElementTypeSchema,
  });
}

export function ArticleComponentSchema(): z.ZodObject<
  Properties<ArticleComponent>
> {
  return z.object({
    __typename: z.literal("ArticleComponent").optional(),
    content: z.string().nullable(),
  });
}

export function CoreComponentSchema(): z.ZodObject<Properties<CoreComponent>> {
  return z.object({
    __typename: z.literal("CoreComponent").optional(),
    content: z.string().nullable(),
  });
}

export function ElementComponentsSchema() {
  return z.union([
    ArticleComponentSchema(),
    CoreComponentSchema(),
    ScopeComponentSchema(),
    SectionComponentSchema(),
    TypeSpecificationComponentSchema(),
  ]);
}

export function MoveElementInputSchema(): z.ZodObject<
  Properties<MoveElementInput>
> {
  return z.object({
    __typename: z.literal("MoveElementInput").optional(),
    id: z.string(),
    newParentId: z.string(),
  });
}

export function RemoveElementInputSchema(): z.ZodObject<
  Properties<RemoveElementInput>
> {
  return z.object({
    __typename: z.literal("RemoveElementInput").optional(),
    id: z.string(),
  });
}

export function ReorderElementsInputSchema(): z.ZodObject<
  Properties<ReorderElementsInput>
> {
  return z.object({
    __typename: z.literal("ReorderElementsInput").optional(),
    order: z.array(z.string()),
    parentElementId: z.string(),
  });
}

export function ScopeComponentSchema(): z.ZodObject<
  Properties<ScopeComponent>
> {
  return z.object({
    __typename: z.literal("ScopeComponent").optional(),
    content: z.string().nullable(),
  });
}

export function ScopeFrameworkElementSchema(): z.ZodObject<
  Properties<ScopeFrameworkElement>
> {
  return z.object({
    __typename: z.literal("ScopeFrameworkElement").optional(),
    components: ElementComponentsSchema().nullable(),
    id: z.string(),
    name: z.string().nullable(),
    path: z.string(),
    type: ScopeFrameworkElementTypeSchema.nullable(),
    version: z.number(),
  });
}

export function ScopeFrameworkLocalStateSchema(): z.ZodObject<
  Properties<ScopeFrameworkLocalState>
> {
  return z.object({
    __typename: z.literal("ScopeFrameworkLocalState").optional(),
  });
}

export function ScopeFrameworkStateSchema(): z.ZodObject<
  Properties<ScopeFrameworkState>
> {
  return z.object({
    __typename: z.literal("ScopeFrameworkState").optional(),
    elements: z.array(ScopeFrameworkElementSchema()),
    rootPath: z.string(),
  });
}

export function SectionComponentSchema(): z.ZodObject<
  Properties<SectionComponent>
> {
  return z.object({
    __typename: z.literal("SectionComponent").optional(),
    content: z.string().nullable(),
  });
}

export function SetRootPathInputSchema(): z.ZodObject<
  Properties<SetRootPathInput>
> {
  return z.object({
    __typename: z.literal("SetRootPathInput").optional(),
    newRootPath: z.string(),
  });
}

export function TypeSpecificationComponentSchema(): z.ZodObject<
  Properties<TypeSpecificationComponent>
> {
  return z.object({
    __typename: z.literal("TypeSpecificationComponent").optional(),
    additionalLogic: z.string().nullable(),
    category: TypeSpecificationComponentCategorySchema.nullable(),
    documentIdentifierRules: z.string().nullable(),
    name: z.string().nullable(),
    overview: z.string().nullable(),
    typeAuthority: z.string().nullable(),
  });
}

export function UpdateElementComponentsInputSchema(): z.ZodObject<
  Properties<UpdateElementComponentsInput>
> {
  return z.object({
    __typename: z.literal("UpdateElementComponentsInput").optional(),
    components: ElementComponentsSchema().nullable(),
    id: z.string(),
  });
}

export function UpdateElementNameInputSchema(): z.ZodObject<
  Properties<UpdateElementNameInput>
> {
  return z.object({
    __typename: z.literal("UpdateElementNameInput").optional(),
    id: z.string(),
    name: z.string().nullable(),
  });
}

export function UpdateElementTypeInputSchema(): z.ZodObject<
  Properties<UpdateElementTypeInput>
> {
  return z.object({
    __typename: z.literal("UpdateElementTypeInput").optional(),
    id: z.string(),
    type: ScopeFrameworkElementTypeSchema,
  });
}
