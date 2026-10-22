/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as z from "zod";
import type {
  AddStockInput,
  AdjustQuantityInput,
  InventoryItemState,
  MoveItemInput,
  SetItemDetailsInput,
  StockMovement,
  StockMovementKind,
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

export const StockMovementKindSchema = z.enum(["ADD", "ADJUST", "MOVE"]);

export function AddStockInputSchema(): z.ZodObject<Properties<AddStockInput>> {
  return z.object({
    amount: z.number(),
    at: z.iso.datetime(),
    id: z.string(),
  });
}

export function AdjustQuantityInputSchema(): z.ZodObject<
  Properties<AdjustQuantityInput>
> {
  return z.object({
    at: z.iso.datetime(),
    delta: z.number(),
    id: z.string(),
    reason: z.string().nullish(),
  });
}

export function InventoryItemStateSchema(): z.ZodObject<
  Properties<InventoryItemState>
> {
  return z.object({
    __typename: z.literal("InventoryItemState").optional(),
    history: z.array(z.lazy(() => StockMovementSchema())),
    location: z.string().nullish(),
    name: z.string().nullish(),
    quantity: z.number(),
    sku: z.string().nullish(),
  });
}

export function MoveItemInputSchema(): z.ZodObject<Properties<MoveItemInput>> {
  return z.object({
    at: z.iso.datetime(),
    id: z.string(),
    location: z.string(),
  });
}

export function SetItemDetailsInputSchema(): z.ZodObject<
  Properties<SetItemDetailsInput>
> {
  return z.object({
    name: z.string().nullish(),
    sku: z.string().nullish(),
  });
}

export function StockMovementSchema(): z.ZodObject<Properties<StockMovement>> {
  return z.object({
    __typename: z.literal("StockMovement").optional(),
    at: z.iso.datetime(),
    delta: z.number(),
    id: z.string(),
    kind: StockMovementKindSchema,
    location: z.string().nullish(),
    reason: z.string().nullish(),
  });
}
