/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as z from "zod";
import type {
  AddColorInput,
  AddImageryReferenceInput,
  AddLogoInput,
  AddSuggestionInput,
  AddTypefaceInput,
  AgentFeedback,
  BrandSheetState,
  ClearConceptInput,
  ClearImageryDirectionInput,
  ClearLogoAssetInput,
  ClearMaximInput,
  ClearProductNameInput,
  ClearVoiceInput,
  Color,
  ColorRole,
  ImageRef,
  Imagery,
  Logo,
  MarkType,
  RemoveColorInput,
  RemoveImageryReferenceInput,
  RemoveLogoInput,
  RemoveSuggestionInput,
  RemoveTypefaceInput,
  ReorderColorsInput,
  ReorderImageryReferencesInput,
  ReorderLogosInput,
  ReorderTypefacesInput,
  ResolveSuggestionInput,
  SetConceptInput,
  SetImageryDirectionInput,
  SetImageryGuidanceInput,
  SetLogoAssetInput,
  SetMaximInput,
  SetProductNameInput,
  SetReadyForFeedbackInput,
  SetVoiceInput,
  SetVoiceVocabularyInput,
  Suggestion,
  SuggestionDecision,
  SuggestionResolution,
  TypeRole,
  Typeface,
  UpdateColorInput,
  UpdateLogoInput,
  UpdateTypefaceInput,
  UpdateVoiceInput,
  Vocabulary,
  Voice,
} from "./types.js";

type Properties<T> = Required<{
  [K in keyof T]: z.ZodType<T[K]>;
}>;

type definedNonNullAny = {};

export const isDefinedNonNullAny = (v: any): v is definedNonNullAny =>
  v !== undefined && v !== null;

export const definedNonNullAnySchema = z
  .any()
  .refine((v) => isDefinedNonNullAny(v));

export const ColorRoleSchema = z.enum([
  "ACCENT",
  "PRIMARY",
  "SECONDARY",
  "SURFACE",
  "TEXT",
]);

export const MarkTypeSchema = z.enum(["COMBINATION", "SYMBOL", "WORDMARK"]);

export const SuggestionDecisionSchema = z.enum(["ACCEPTED", "DISMISSED"]);

export const TypeRoleSchema = z.enum(["BODY", "HEADLINE", "NUMERALS", "UI"]);

export function AddColorInputSchema(): z.ZodObject<Properties<AddColorInput>> {
  return z.object({
    hex: z.string(),
    id: z.string(),
    insertBefore: z.string().nullish(),
    name: z.string(),
    role: ColorRoleSchema,
    usage: z.string(),
  });
}

export function AddImageryReferenceInputSchema(): z.ZodObject<
  Properties<AddImageryReferenceInput>
> {
  return z.object({
    data: z.string().nullish(),
    filename: z.string().nullish(),
    id: z.string(),
    insertBefore: z.string().nullish(),
    mediaType: z.string().nullish(),
    url: z.url().nullish(),
  });
}

export function AddLogoInputSchema(): z.ZodObject<Properties<AddLogoInput>> {
  return z.object({
    description: z.string(),
    id: z.string(),
    insertBefore: z.string().nullish(),
    markType: MarkTypeSchema,
  });
}

export function AddSuggestionInputSchema(): z.ZodObject<
  Properties<AddSuggestionInput>
> {
  return z.object({
    agent: z.string(),
    content: z.string(),
    createdAt: z.iso.datetime(),
    id: z.string(),
  });
}

export function AddTypefaceInputSchema(): z.ZodObject<
  Properties<AddTypefaceInput>
> {
  return z.object({
    alternatives: z.array(z.string()),
    family: z.string(),
    id: z.string(),
    insertBefore: z.string().nullish(),
    notes: z.string().nullish(),
    role: TypeRoleSchema,
  });
}

export function AgentFeedbackSchema(): z.ZodObject<Properties<AgentFeedback>> {
  return z.object({
    __typename: z.literal("AgentFeedback").optional(),
    readyForFeedback: z.boolean(),
    suggestions: z.array(z.lazy(() => SuggestionSchema())),
  });
}

export function BrandSheetStateSchema(): z.ZodObject<
  Properties<BrandSheetState>
> {
  return z.object({
    __typename: z.literal("BrandSheetState").optional(),
    agentFeedback: z.lazy(() => AgentFeedbackSchema()),
    colors: z.array(z.lazy(() => ColorSchema())),
    concept: z.string().nullish(),
    imagery: z.lazy(() => ImagerySchema().nullish()),
    logos: z.array(z.lazy(() => LogoSchema())),
    maxim: z.string().nullish(),
    name: z.string().nullish(),
    typography: z.array(z.lazy(() => TypefaceSchema())),
    voice: z.lazy(() => VoiceSchema().nullish()),
  });
}

export function ClearConceptInputSchema(): z.ZodObject<
  Properties<ClearConceptInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function ClearImageryDirectionInputSchema(): z.ZodObject<
  Properties<ClearImageryDirectionInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function ClearLogoAssetInputSchema(): z.ZodObject<
  Properties<ClearLogoAssetInput>
> {
  return z.object({
    logoId: z.string(),
  });
}

export function ClearMaximInputSchema(): z.ZodObject<
  Properties<ClearMaximInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function ClearProductNameInputSchema(): z.ZodObject<
  Properties<ClearProductNameInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function ClearVoiceInputSchema(): z.ZodObject<
  Properties<ClearVoiceInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function ColorSchema(): z.ZodObject<Properties<Color>> {
  return z.object({
    __typename: z.literal("Color").optional(),
    hex: z.string(),
    id: z.string(),
    name: z.string(),
    role: ColorRoleSchema,
    usage: z.string(),
  });
}

export function ImageRefSchema(): z.ZodObject<Properties<ImageRef>> {
  return z.object({
    __typename: z.literal("ImageRef").optional(),
    data: z.string().nullish(),
    filename: z.string().nullish(),
    id: z.string(),
    mediaType: z.string().nullish(),
    url: z.url().nullish(),
  });
}

export function ImagerySchema(): z.ZodObject<Properties<Imagery>> {
  return z.object({
    __typename: z.literal("Imagery").optional(),
    avoid: z.array(z.string()),
    direction: z.string().nullish(),
    include: z.array(z.string()),
    references: z.array(z.lazy(() => ImageRefSchema())),
  });
}

export function LogoSchema(): z.ZodObject<Properties<Logo>> {
  return z.object({
    __typename: z.literal("Logo").optional(),
    assetData: z.string().nullish(),
    assetFilename: z.string().nullish(),
    assetMediaType: z.string().nullish(),
    assetUrl: z.url().nullish(),
    description: z.string(),
    id: z.string(),
    markType: MarkTypeSchema,
  });
}

export function RemoveColorInputSchema(): z.ZodObject<
  Properties<RemoveColorInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function RemoveImageryReferenceInputSchema(): z.ZodObject<
  Properties<RemoveImageryReferenceInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function RemoveLogoInputSchema(): z.ZodObject<
  Properties<RemoveLogoInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function RemoveSuggestionInputSchema(): z.ZodObject<
  Properties<RemoveSuggestionInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function RemoveTypefaceInputSchema(): z.ZodObject<
  Properties<RemoveTypefaceInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function ReorderColorsInputSchema(): z.ZodObject<
  Properties<ReorderColorsInput>
> {
  return z.object({
    ids: z.array(z.string()),
    insertBefore: z.string().nullish(),
  });
}

export function ReorderImageryReferencesInputSchema(): z.ZodObject<
  Properties<ReorderImageryReferencesInput>
> {
  return z.object({
    ids: z.array(z.string()),
    insertBefore: z.string().nullish(),
  });
}

export function ReorderLogosInputSchema(): z.ZodObject<
  Properties<ReorderLogosInput>
> {
  return z.object({
    ids: z.array(z.string()),
    insertBefore: z.string().nullish(),
  });
}

export function ReorderTypefacesInputSchema(): z.ZodObject<
  Properties<ReorderTypefacesInput>
> {
  return z.object({
    ids: z.array(z.string()),
    insertBefore: z.string().nullish(),
  });
}

export function ResolveSuggestionInputSchema(): z.ZodObject<
  Properties<ResolveSuggestionInput>
> {
  return z.object({
    changeApplied: z.boolean(),
    comment: z.string().nullish(),
    decision: SuggestionDecisionSchema,
    id: z.string(),
    resolvedAt: z.iso.datetime(),
  });
}

export function SetConceptInputSchema(): z.ZodObject<
  Properties<SetConceptInput>
> {
  return z.object({
    concept: z.string(),
  });
}

export function SetImageryDirectionInputSchema(): z.ZodObject<
  Properties<SetImageryDirectionInput>
> {
  return z.object({
    direction: z.string(),
  });
}

export function SetImageryGuidanceInputSchema(): z.ZodObject<
  Properties<SetImageryGuidanceInput>
> {
  return z.object({
    avoid: z.array(z.string()),
    include: z.array(z.string()),
  });
}

export function SetLogoAssetInputSchema(): z.ZodObject<
  Properties<SetLogoAssetInput>
> {
  return z.object({
    data: z.string().nullish(),
    filename: z.string().nullish(),
    logoId: z.string(),
    mediaType: z.string().nullish(),
    url: z.url().nullish(),
  });
}

export function SetMaximInputSchema(): z.ZodObject<Properties<SetMaximInput>> {
  return z.object({
    maxim: z.string(),
  });
}

export function SetProductNameInputSchema(): z.ZodObject<
  Properties<SetProductNameInput>
> {
  return z.object({
    name: z.string(),
  });
}

export function SetReadyForFeedbackInputSchema(): z.ZodObject<
  Properties<SetReadyForFeedbackInput>
> {
  return z.object({
    ready: z.boolean(),
  });
}

export function SetVoiceInputSchema(): z.ZodObject<Properties<SetVoiceInput>> {
  return z.object({
    guidance: z.string(),
    qualities: z.array(z.string()),
  });
}

export function SetVoiceVocabularyInputSchema(): z.ZodObject<
  Properties<SetVoiceVocabularyInput>
> {
  return z.object({
    avoid: z.array(z.string()),
    prefer: z.array(z.string()),
  });
}

export function SuggestionSchema(): z.ZodObject<Properties<Suggestion>> {
  return z.object({
    __typename: z.literal("Suggestion").optional(),
    agent: z.string(),
    content: z.string(),
    createdAt: z.iso.datetime(),
    id: z.string(),
    resolution: z.lazy(() => SuggestionResolutionSchema().nullish()),
  });
}

export function SuggestionResolutionSchema(): z.ZodObject<
  Properties<SuggestionResolution>
> {
  return z.object({
    __typename: z.literal("SuggestionResolution").optional(),
    changeApplied: z.boolean(),
    comment: z.string().nullish(),
    decision: SuggestionDecisionSchema,
    resolvedAt: z.iso.datetime(),
  });
}

export function TypefaceSchema(): z.ZodObject<Properties<Typeface>> {
  return z.object({
    __typename: z.literal("Typeface").optional(),
    alternatives: z.array(z.string()),
    family: z.string(),
    id: z.string(),
    notes: z.string().nullish(),
    role: TypeRoleSchema,
  });
}

export function UpdateColorInputSchema(): z.ZodObject<
  Properties<UpdateColorInput>
> {
  return z.object({
    hex: z.string().nullish(),
    id: z.string(),
    name: z.string().nullish(),
    role: ColorRoleSchema.nullish(),
    usage: z.string().nullish(),
  });
}

export function UpdateLogoInputSchema(): z.ZodObject<
  Properties<UpdateLogoInput>
> {
  return z.object({
    description: z.string().nullish(),
    id: z.string(),
    markType: MarkTypeSchema.nullish(),
  });
}

export function UpdateTypefaceInputSchema(): z.ZodObject<
  Properties<UpdateTypefaceInput>
> {
  return z.object({
    alternatives: z.array(z.string()).nullish(),
    family: z.string().nullish(),
    id: z.string(),
    notes: z.string().nullish(),
    role: TypeRoleSchema.nullish(),
  });
}

export function UpdateVoiceInputSchema(): z.ZodObject<
  Properties<UpdateVoiceInput>
> {
  return z.object({
    guidance: z.string().nullish(),
    qualities: z.array(z.string()).nullish(),
  });
}

export function VocabularySchema(): z.ZodObject<Properties<Vocabulary>> {
  return z.object({
    __typename: z.literal("Vocabulary").optional(),
    avoid: z.array(z.string()),
    prefer: z.array(z.string()),
  });
}

export function VoiceSchema(): z.ZodObject<Properties<Voice>> {
  return z.object({
    __typename: z.literal("Voice").optional(),
    guidance: z.string(),
    qualities: z.array(z.string()),
    vocabulary: z.lazy(() => VocabularySchema()),
  });
}
