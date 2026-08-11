/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as z from "zod";
import type {
  AddMemberInput,
  ReactorGroupState,
  RemoveMemberInput,
  SetGroupDescriptionInput,
  SetGroupNameInput,
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

export function AddMemberInputSchema(): z.ZodObject<
  Properties<AddMemberInput>
> {
  return z.object({
    address: z.string(),
  });
}

export function ReactorGroupStateSchema(): z.ZodObject<
  Properties<ReactorGroupState>
> {
  return z.object({
    __typename: z.literal("ReactorGroupState").optional(),
    description: z.string(),
    members: z.array(z.string()),
    name: z.string(),
  });
}

export function RemoveMemberInputSchema(): z.ZodObject<
  Properties<RemoveMemberInput>
> {
  return z.object({
    address: z.string(),
  });
}

export function SetGroupDescriptionInputSchema(): z.ZodObject<
  Properties<SetGroupDescriptionInput>
> {
  return z.object({
    description: z.string(),
  });
}

export function SetGroupNameInputSchema(): z.ZodObject<
  Properties<SetGroupNameInput>
> {
  return z.object({
    name: z.string(),
  });
}
