/**
 * A second root that re-exports one module of the family the first root
 * selects. The two selections reach the very same object, so the loader folds
 * them into one definition instead of reporting a collision — which is the
 * difference between an alias and two values fighting over one identity.
 */
export { invoiceV1 as publishedInvoice } from "./invoice.js";
