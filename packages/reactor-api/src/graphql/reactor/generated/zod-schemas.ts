/* eslint-disable */
import { z } from "zod";
import {
  DocumentChangeType,
  PagingInput,
  PropagationMode,
  SearchFilterInput,
  ViewFilterInput,
} from "./graphql.js";

type Properties<T> = Required<{
  [K in keyof T]: z.ZodType<T[K], any, T[K]>;
}>;

type definedNonNullAny = {};

export const isDefinedNonNullAny = (v: any): v is definedNonNullAny =>
  v !== undefined && v !== null;

export const definedNonNullAnySchema = z
  .any()
  .refine((v) => isDefinedNonNullAny(v));

export const DocumentChangeTypeSchema = z.nativeEnum(DocumentChangeType);

export const PropagationModeSchema = z.nativeEnum(PropagationMode);

export function PagingInputSchema(): z.ZodObject<Properties<PagingInput>> {
  return z.object({
    cursor: z.string().nullish(),
    limit: z.number().nullish(),
    offset: z.number().nullish(),
  });
}

export function SearchFilterInputSchema(): z.ZodObject<
  Properties<SearchFilterInput>
> {
  return z.object({
    identifiers: z.array(z.string()).nullish(),
    parentId: z.string().nullish(),
    type: z.string().nullish(),
  });
}

export function ViewFilterInputSchema(): z.ZodObject<
  Properties<ViewFilterInput>
> {
  return z.object({
    branch: z.string().nullish(),
    scopes: z.array(z.string()).nullish(),
  });
}
