import { z } from "zod";
import type {
  AddPackageKeywordInput,
  Author,
  Keyword,
  RemovePackageKeywordInput,
  SetPackageAuthorInput,
  SetPackageAuthorNameInput,
  SetPackageAuthorWebsiteInput,
  SetPackageCategoryInput,
  SetPackageDescriptionInput,
  SetPackageGithubUrlInput,
  SetPackageNameInput,
  SetPackageNpmUrlInput,
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

export function AddPackageKeywordInputSchema(): z.ZodObject<
  Properties<AddPackageKeywordInput>
> {
  return z.object({
    id: z.string(),
    label: z.string(),
  });
}

export function AuthorSchema(): z.ZodObject<Properties<Author>> {
  return z.object({
    __typename: z.literal("Author").optional(),
    name: z.string().nullable(),
    website: z.string().url().nullable(),
  });
}

export function KeywordSchema(): z.ZodObject<Properties<Keyword>> {
  return z.object({
    __typename: z.literal("Keyword").optional(),
    id: z.string(),
    label: z.string(),
  });
}

export function RemovePackageKeywordInputSchema(): z.ZodObject<
  Properties<RemovePackageKeywordInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function SetPackageAuthorInputSchema(): z.ZodObject<
  Properties<SetPackageAuthorInput>
> {
  return z.object({
    name: z.string().nullish(),
    website: z.string().url().nullish(),
  });
}

export function SetPackageAuthorNameInputSchema(): z.ZodObject<
  Properties<SetPackageAuthorNameInput>
> {
  return z.object({
    name: z.string(),
  });
}

export function SetPackageAuthorWebsiteInputSchema(): z.ZodObject<
  Properties<SetPackageAuthorWebsiteInput>
> {
  return z.object({
    website: z.string().url(),
  });
}

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
    description: z.string(),
  });
}

export function SetPackageGithubUrlInputSchema(): z.ZodObject<
  Properties<SetPackageGithubUrlInput>
> {
  return z.object({
    url: z.string().url(),
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
    url: z.string().url(),
  });
}

export function VetraPackageStateSchema(): z.ZodObject<
  Properties<VetraPackageState>
> {
  return z.object({
    __typename: z.literal("VetraPackageState").optional(),
    author: AuthorSchema(),
    category: z.string().nullable(),
    description: z.string().nullable(),
    githubUrl: z.string().url().nullable(),
    keywords: z.array(KeywordSchema()),
    name: z.string().nullable(),
    npmUrl: z.string().url().nullable(),
  });
}
