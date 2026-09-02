import { BasePropertySchema, TPropertyValue } from "../common.js";
import { DropdownState } from "./common.js";
import { type AppConnectionValueForAuthProperty, type PropertyContext } from "../../../context/index.js";
import * as z from "zod/mini";
import { PropertyType } from "../property-type.js";
import { PieceAuthProperty } from "../../authentication/index.js";

type DynamicDropdownOptions<T, PieceAuth extends PieceAuthProperty | PieceAuthProperty[] |  undefined = undefined> = (
  propsValue: Record<string, unknown> & {
    auth?: PieceAuth extends undefined ? undefined : AppConnectionValueForAuthProperty<Exclude<PieceAuth, undefined>>;
  },
  ctx: PropertyContext,
) => Promise<DropdownState<T>>;

export const DropdownProperty = z.object({
  ...BasePropertySchema.shape,
  ...TPropertyValue(z.unknown(), PropertyType.DROPDOWN).shape,
  refreshers: z.array(z.string()),
});

export type DropdownProperty<T, R extends boolean, PieceAuth extends PieceAuthProperty | PieceAuthProperty[] |  undefined = undefined> = BasePropertySchema & {
  /**
   * A dummy property used to infer {@code PieceAuth} type
   */
  auth: PieceAuth;
  refreshers: string[];
  refreshOnSearch?: boolean;
  options: DynamicDropdownOptions<T, PieceAuth>;
} & TPropertyValue<T, PropertyType.DROPDOWN, R>;


export const MultiSelectDropdownProperty = z.object({
  ...BasePropertySchema.shape,
  ...TPropertyValue(z.array(z.unknown()), PropertyType.MULTI_SELECT_DROPDOWN).shape,
  refreshers: z.array(z.string()),
});

export type MultiSelectDropdownProperty<
  T,
  R extends boolean,
  PieceAuth extends PieceAuthProperty | PieceAuthProperty[] | undefined = undefined
> = BasePropertySchema & {
  /**
   * A dummy property used to infer {@code PieceAuth} type
   */
  auth: PieceAuth;
  refreshers: string[];
  refreshOnSearch?: boolean;
  options: DynamicDropdownOptions<T, PieceAuth>;
} & TPropertyValue<
  T[],
  PropertyType.MULTI_SELECT_DROPDOWN,
  R
>;
