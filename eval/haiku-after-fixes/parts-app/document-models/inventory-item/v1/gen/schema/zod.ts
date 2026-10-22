/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as z from "zod";
import type {
  AddItemInput,
  AdjustQuantityInput,
  InventoryItemState,
  MoveItemInput,
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

export function AddItemInputSchema(): z.ZodObject<Properties<AddItemInput>> {
  return z.object({
    location: z.string(),
    name: z.string(),
    quantity: z.number(),
  });
}

export function AdjustQuantityInputSchema(): z.ZodObject<
  Properties<AdjustQuantityInput>
> {
  return z.object({
    delta: z.number(),
  });
}

export function InventoryItemStateSchema(): z.ZodObject<
  Properties<InventoryItemState>
> {
  return z.object({
    __typename: z.literal("InventoryItemState").optional(),
    location: z.string().nullish(),
    name: z.string().nullish(),
    quantity: z.number(),
  });
}

export function MoveItemInputSchema(): z.ZodObject<Properties<MoveItemInput>> {
  return z.object({
    location: z.string(),
  });
}
