import * as z from "zod/mini";
import { BasePropertySchema, TPropertyValue } from './common.js';
import { PropertyType } from './property-type.js';
import { MarkdownVariant } from '../../../../piece-types/index.js';

export const MarkDownProperty = z.object({
  ...BasePropertySchema.shape,
  ...TPropertyValue(z.void(), PropertyType.MARKDOWN).shape,
});

export type MarkDownProperty = BasePropertySchema &
  TPropertyValue<
    undefined,
    PropertyType.MARKDOWN,
    false
  > & {
    variant?: MarkdownVariant;
  };
