import { type scalars } from "./scalars/index.js";
export * from "./scalars/index.js";

export type PHScalar = (typeof scalars)[keyof typeof scalars];
