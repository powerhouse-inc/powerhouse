import * as z from "zod/mini";
import { BasePropertySchema, TPropertyValue } from "./common.js";
import { PropertyType } from "./property-type.js";

export const ObjectProperty = z.object({
    ...BasePropertySchema.shape,
    ...TPropertyValue(
        z.record(z.string(), z.unknown()),
        PropertyType.OBJECT,
    ).shape,
})

export type ObjectProperty<R extends boolean> = BasePropertySchema &
    TPropertyValue<
        Record<string, unknown>,
        PropertyType.OBJECT,
        R
    >;
