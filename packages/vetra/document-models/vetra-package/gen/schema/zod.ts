import { z } from "zod";
import type {
  SetPackageCategoryInput,
  SetPackageDescriptionInput,
  SetPackageGithubUrlInput,
  SetPackageKeywordsInput,
  SetPackageNameInput,
  SetPackageNpmUrlInput,
  SetPackagePublisherInput,
  SetPackagePublisherUrlInput,
  VetraPackageState,
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

export function SetPackageCategoryInputSchema(): z.ZodObject<
  Properties<SetPackageCategoryInput>
> {
  return z.object({
    category: z.string(),
  });
}

export function SetPackageDescriptionInputSchema(): z.ZodObject<
  Properties<SetPackageDescriptionInput>
> {
  return z.object({
    description: z.string().nullish(),
  });
}

export function SetPackageGithubUrlInputSchema(): z.ZodObject<
  Properties<SetPackageGithubUrlInput>
> {
  return z.object({
    url: z.string().url().nullish(),
  });
}

export function SetPackageKeywordsInputSchema(): z.ZodObject<
  Properties<SetPackageKeywordsInput>
> {
  return z.object({
    keywords: z.array(z.string()),
  });
}

export function SetPackageNameInputSchema(): z.ZodObject<
  Properties<SetPackageNameInput>
> {
  return z.object({
    name: z.string(),
  });
}

export function SetPackageNpmUrlInputSchema(): z.ZodObject<
  Properties<SetPackageNpmUrlInput>
> {
  return z.object({
    url: z.string().url().nullish(),
  });
}

export function SetPackagePublisherInputSchema(): z.ZodObject<
  Properties<SetPackagePublisherInput>
> {
  return z.object({
    publisher: z.string().nullish(),
  });
}

export function SetPackagePublisherUrlInputSchema(): z.ZodObject<
  Properties<SetPackagePublisherUrlInput>
> {
  return z.object({
    url: z.string().url().nullish(),
  });
}

export function VetraPackageStateSchema(): z.ZodObject<
  Properties<VetraPackageState>
> {
  return z.object({
    __typename: z.literal("VetraPackageState").optional(),
    category: z.string(),
    description: z.string().nullable(),
    githubUrl: z.string().url().nullable(),
    keywords: z.array(z.string()),
    name: z.string(),
    npmUrl: z.string().url().nullable(),
    publisher: z.string().nullable(),
    publisherUrl: z.string().url().nullable(),
  });
}
