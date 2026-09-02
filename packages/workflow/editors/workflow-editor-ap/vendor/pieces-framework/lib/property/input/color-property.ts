import * as z from "zod/mini";
import { BasePropertySchema, TPropertyValue } from "./common.js";
import { PropertyType } from "./property-type.js";

export const ColorProperty = z.object({
    ...BasePropertySchema.shape,
    ...TPropertyValue(z.string(), PropertyType.COLOR).shape,
})


export type ColorProperty<R extends boolean> = BasePropertySchema &
    TPropertyValue<string, PropertyType.COLOR, R>;
